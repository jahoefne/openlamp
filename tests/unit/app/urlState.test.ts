import { readFileSync } from 'node:fs';
import { compressToEncodedURIComponent } from 'lz-string';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_VERSION,
  createDefaultProject,
  parseProject,
  type Project,
} from '@core/model/project.ts';
import {
  HASH_PREFIX,
  URL_SOFT_LIMIT,
  decodeProjectHash,
  encodeProjectHash,
  readLegacyQuery,
  resolveStartupProject,
  shareUrl,
  writeHash,
  type HistoryLike,
  type LocationLike,
} from '../../../src/app/persistence/urlState.ts';

const example = (name: string): Project =>
  parseProject(
    readFileSync(new URL(`../../../src/examples/${name}.lamp.json`, import.meta.url), 'utf8'),
  );

const location = (search = '', hash = ''): LocationLike => ({
  origin: 'https://jahoefne.github.io',
  pathname: '/openlamp/',
  search,
  hash,
});

function fakeHistory(): HistoryLike & { urls: string[] } {
  const urls: string[] = [];
  return {
    state: null,
    urls,
    replaceState(_data, _unused, url) {
      urls.push(String(url));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#p= hash', () => {
  it('round-trips a project exactly', () => {
    for (const project of [createDefaultProject({ id: 'a', name: 'A lamp' }), example('faceted')]) {
      const hash = encodeProjectHash(project);
      expect(hash.startsWith(HASH_PREFIX)).toBe(true);
      expect(decodeProjectHash(hash)).toEqual(project);
      expect(decodeProjectHash(hash.slice(1))).toEqual(project); // without the '#'
    }
  });

  it('keeps the link short (lz-string)', () => {
    expect(encodeProjectHash(example('faceted')).length).toBeLessThan(2000);
  });

  it('decodes garbage to null', () => {
    const invalid = compressToEncodedURIComponent(JSON.stringify({ version: 1, id: 'x' }));
    for (const hash of [
      '',
      '#',
      '#p=',
      '#q=abc',
      '#p=garbage!!',
      '#p=%%%',
      `#p=${compressToEncodedURIComponent('not json')}`,
      `#p=${invalid}`,
    ]) {
      expect(decodeProjectHash(hash), hash).toBeNull();
    }
  });
});

describe('legacy ?key=value links', () => {
  it('migrates the flat classic parameters', () => {
    const project = readLegacyQuery('?bottomDiameter=200&style=smooth&quality=draft');
    expect(project).not.toBeNull();
    const shade = project!.shades[0];
    expect(shade.style.bottomDiameter).toBe(200);
    expect(shade.style.surface.style).toBe('smooth');
    expect(project!.quality.preview).toBe('draft');
    expect(project!.version).toBe(PROJECT_VERSION);
  });

  it('clamps out-of-range values and ignores unknown keys', () => {
    const project = readLegacyQuery('bottomDiameter=9999&style=bogus&utm_source=x');
    expect(project!.shades[0].style.bottomDiameter).toBe(320);
    expect(project!.shades[0].style.surface.style).toBe(
      createDefaultProject().shades[0].style.surface.style,
    );
  });

  it('is null without any classic parameter', () => {
    expect(readLegacyQuery('')).toBeNull();
    expect(readLegacyQuery('?')).toBeNull();
    expect(readLegacyQuery('?utm_source=x&debug=1')).toBeNull();
  });
});

describe('startup project', () => {
  const saved = createDefaultProject({ id: 'saved', name: 'Saved lamp' });
  const shared = example('faceted');

  it('prefers a share link, then a legacy link, then the autosave, then the default', () => {
    const hash = encodeProjectHash(shared);
    expect(resolveStartupProject({ hash, search: '?height=150' }, () => saved)).toEqual({
      project: shared,
      source: 'hash',
    });
    const legacy = resolveStartupProject({ hash: '#p=broken', search: '?height=150' }, () => saved);
    expect(legacy.source).toBe('legacy');
    expect(legacy.project.shades[0].style.height).toBe(150);
    expect(resolveStartupProject({ hash: '', search: '' }, () => saved)).toEqual({
      project: saved,
      source: 'autosave',
    });
    const fresh = resolveStartupProject({ hash: '', search: '' }, () => null);
    expect(fresh.source).toBe('default');
    expect(fresh.project.shades[0].style).toEqual(createDefaultProject().shades[0].style);
  });
});

describe('browser URL', () => {
  const project = createDefaultProject({ id: 'p', name: 'Link lamp' });

  it('builds the share link from origin and path, without the query', () => {
    expect(shareUrl(project, location('?bottomDiameter=200'))).toBe(
      `https://jahoefne.github.io/openlamp/${encodeProjectHash(project)}`,
    );
  });

  it('writes the hash with replaceState, keeping or dropping the query', () => {
    const history = fakeHistory();
    const kept = writeHash(project, { location: location('?debug=1'), history });
    expect(kept).toEqual({
      url: `/openlamp/?debug=1${encodeProjectHash(project)}`,
      tooLong: false,
    });
    writeHash(project, { location: location('?height=150'), history, dropQuery: true });
    expect(history.urls).toEqual([kept.url, `/openlamp/${encodeProjectHash(project)}`]);
  });

  it('warns once when the link grows past the soft limit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A long, poorly compressible name.
    let seed = 1;
    const name = Array.from({ length: 12_000 }, () => {
      seed = (seed * 16807) % 2147483647;
      return String.fromCharCode(33 + (seed % 90));
    }).join('');
    const big = { ...project, name };
    const history = fakeHistory();
    const result = writeHash(big, { location: location(), history });
    expect(result.tooLong).toBe(true);
    expect(result.url.length).toBeGreaterThan(URL_SOFT_LIMIT);
    writeHash(big, { location: location(), history });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(history.urls).toHaveLength(2); // still written
    expect(writeHash(project, { location: location(), history }).tooLong).toBe(false);
    expect(decodeProjectHash(result.url.slice(result.url.indexOf('#')))).toEqual(big);
  });
});
