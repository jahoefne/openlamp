/**
 * The project in the URL: `#p=` + lz-string `compressToEncodedURIComponent`
 * of `serializeProject(project)`, and the first app's `?key=value` links,
 * which the core v0 migration turns into a project.
 *
 * DOM-free apart from `shareUrl` / `writeHash`, which default to the page's
 * `location` / `history` (looked up on `globalThis`, so the module also loads
 * in Node for the unit tests).
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import {
  createDefaultProject,
  loadProject,
  parseProject,
  serializeProject,
  type Project,
} from '@core/model/project.ts';
import { CLASSIC_SHADE_DEFS } from '@core/schema/defs.ts';

export const HASH_KEY = 'p';
export const HASH_PREFIX = `#${HASH_KEY}=`;
/** Above this many characters a link may be cut by chat apps and mail clients. */
export const URL_SOFT_LIMIT = 8000;

/** The parts of `window.location` this module reads. */
export interface LocationLike {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

/** The part of `window.history` this module writes. */
export interface HistoryLike {
  readonly state: unknown;
  replaceState(data: unknown, unused: string, url?: string | null): void;
}

interface BrowserGlobals {
  location?: LocationLike;
  history?: HistoryLike;
}

function browserLocation(): LocationLike | undefined {
  return (globalThis as BrowserGlobals).location;
}

function browserHistory(): HistoryLike | undefined {
  return (globalThis as BrowserGlobals).history;
}

// ---------------------------------------------------------------- #p= hash

/** `#p=<compressed project>`. */
export function encodeProjectHash(project: Project): string {
  return HASH_PREFIX + compressToEncodedURIComponent(serializeProject(project));
}

/**
 * The project in a `#p=…` hash (with or without the `#`), or null when there
 * is none or it does not decode to a valid project.
 */
export function decodeProjectHash(hash: string): Project | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  // Not URLSearchParams: the lz-string alphabet contains '+', which it would read as a space.
  const field = body.split('&').find((part) => part.startsWith(`${HASH_KEY}=`));
  if (!field) return null;
  const encoded = field.slice(HASH_KEY.length + 1);
  if (!encoded) return null;
  try {
    const text = decompressFromEncodedURIComponent(encoded);
    if (!text) return null;
    return parseProject(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- legacy ?query

const LEGACY_DEFS = new Map(CLASSIC_SHADE_DEFS.map((def) => [def.key as string, def]));

/**
 * A project from the first app's links (`?bottomDiameter=200&style=smooth…`,
 * the flat classic-shade parameters), or null when the query has none of
 * them. Numbers are parsed, selects kept as strings; the core v0 migration
 * clamps and completes them.
 */
export function readLegacyQuery(search: string): Project | null {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw: Record<string, number | string> = {};
  for (const [key, value] of query) {
    const def = LEGACY_DEFS.get(key);
    if (!def) continue;
    raw[key] = def.type === 'select' ? value : parseFloat(value);
  }
  if (Object.keys(raw).length === 0) return null;
  try {
    return loadProject(raw); // no `version`: migrated from v0
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- startup

export type StartupSource = 'hash' | 'legacy' | 'autosave' | 'default';

export interface StartupProject {
  project: Project;
  source: StartupSource;
}

/**
 * Which project the app opens with: a `#p=` share link, else a legacy
 * `?query` link, else the most recent autosaved project, else a new default
 * project.
 */
export function resolveStartupProject(
  url: Pick<LocationLike, 'hash' | 'search'>,
  latestAutosave: () => Project | null,
): StartupProject {
  const shared = decodeProjectHash(url.hash);
  if (shared) return { project: shared, source: 'hash' };
  const legacy = readLegacyQuery(url.search);
  if (legacy) return { project: legacy, source: 'legacy' };
  const saved = latestAutosave();
  if (saved) return { project: saved, source: 'autosave' };
  return { project: createDefaultProject(), source: 'default' };
}

// ---------------------------------------------------------------- browser URL

/** A link that reopens this project: origin + path + `#p=…` (no query). */
export function shareUrl(
  project: Project,
  location: LocationLike | undefined = browserLocation(),
): string {
  const base = location ? location.origin + location.pathname : '';
  return base + encodeProjectHash(project);
}

export interface WriteHashOptions {
  /** Drop the query too (after migrating a legacy `?key=value` link). */
  dropQuery?: boolean;
  location?: LocationLike | undefined;
  history?: HistoryLike | undefined;
}

export interface WriteHashResult {
  /** The page URL as written (path + query + hash). */
  url: string;
  /** Longer than `URL_SOFT_LIMIT` (as a full link, with the origin). */
  tooLong: boolean;
}

/**
 * Mirror the project into the address bar with `history.replaceState` (no
 * history entry, no `hashchange`). Call it for committed edits only, never for
 * the intermediate values of a slider drag. Warns (once per crossing) when the
 * link grows past `URL_SOFT_LIMIT`.
 */
export function writeHash(project: Project, options: WriteHashOptions = {}): WriteHashResult {
  const location = 'location' in options ? options.location : browserLocation();
  const history = 'history' in options ? options.history : browserHistory();
  const hash = encodeProjectHash(project);
  const search = options.dropQuery || !location ? '' : location.search;
  const url = (location?.pathname ?? '') + search + hash;
  const length = (location?.origin.length ?? 0) + url.length;
  const tooLong = length > URL_SOFT_LIMIT;
  if (tooLong && !warnedTooLong) {
    console.warn(
      `openlamp: the share link is ${length} characters long (over ${URL_SOFT_LIMIT}); some apps may cut it.`,
    );
  }
  warnedTooLong = tooLong;
  history?.replaceState(history.state, '', url);
  return { url, tooLong };
}

let warnedTooLong = false;

/** Whether a full link of this length is over the soft limit. */
export function isUrlTooLong(url: string): boolean {
  return url.length > URL_SOFT_LIMIT;
}
