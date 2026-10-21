import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProject, serializeProject, type Project } from '@core/model/project.ts';
import {
  AUTOSAVE_DEBOUNCE_MS,
  MAX_RECENTS,
  RECENTS_KEY,
  connectAutosave,
  createAutosave,
  projectKey,
  type ProjectSource,
  type StorageLike,
} from '../../../src/app/persistence/autosave.ts';

/** In-memory Web Storage with an optional size limit (in characters, keys + values). */
class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  readonly quota: number;
  constructor(quota = Infinity) {
    this.quota = quota;
  }
  get size(): number {
    let n = 0;
    for (const [k, v] of this.data) n += k.length + v.length;
    return n;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const old = this.data.get(key);
    const next =
      this.size - (old === undefined ? 0 : key.length + old.length) + key.length + value.length;
    if (next > this.quota)
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const lamp = (id: string, name = `Lamp ${id}`): Project => createDefaultProject({ id, name });
const ids = (autosave: ReturnType<typeof createAutosave>) =>
  autosave.listRecents().map((r) => r.id);

let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 21, 12, 0, clock++));

beforeEach(() => {
  clock = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('writing and reading', () => {
  it('stores the serialised project under openlamp:project:<id> and lists it', () => {
    const storage = new FakeStorage();
    const autosave = createAutosave(storage, { now });
    const project = lamp('a', 'Hallway');
    expect(autosave.save(project)).toBe(true);
    expect(storage.getItem(projectKey('a'))).toBe(serializeProject(project));
    expect(projectKey('a')).toBe('openlamp:project:a');
    expect(autosave.readAutosave('a')).toEqual(project);
    expect(autosave.listRecents()).toEqual([
      { id: 'a', name: 'Hallway', updatedAt: '2026-10-21T12:00:00.000Z' },
    ]);
    expect(JSON.parse(storage.getItem(RECENTS_KEY)!)).toEqual(autosave.listRecents());
    expect(autosave.latest()).toEqual(project);
  });

  it('reads nothing for unknown or corrupt autosaves', () => {
    const storage = new FakeStorage();
    const autosave = createAutosave(storage, { now });
    expect(autosave.readAutosave('missing')).toBeNull();
    storage.setItem(projectKey('bad'), '{ not json');
    expect(autosave.readAutosave('bad')).toBeNull();
    storage.setItem(RECENTS_KEY, '"not a list"');
    expect(autosave.listRecents()).toEqual([]);
    expect(autosave.latest()).toBeNull();
  });

  it('skips unreadable autosaves for the latest project', () => {
    const storage = new FakeStorage();
    const autosave = createAutosave(storage, { now });
    autosave.save(lamp('old'));
    autosave.save(lamp('new'));
    storage.setItem(projectKey('new'), 'garbage');
    expect(autosave.latest()?.id).toBe('old');
  });
});

describe('recents', () => {
  it('lists the most recently saved first, once per project, with its current name', () => {
    const autosave = createAutosave(new FakeStorage(), { now });
    autosave.save(lamp('a'));
    autosave.save(lamp('b'));
    autosave.save(lamp('c'));
    expect(ids(autosave)).toEqual(['c', 'b', 'a']);
    autosave.save(lamp('a', 'Renamed'));
    expect(ids(autosave)).toEqual(['a', 'c', 'b']);
    expect(autosave.listRecents()[0]).toMatchObject({ name: 'Renamed' });
  });

  it(`keeps at most ${MAX_RECENTS} and forgets the autosaves that fall off`, () => {
    const storage = new FakeStorage();
    const autosave = createAutosave(storage, { now });
    for (let i = 0; i < MAX_RECENTS + 2; i++) autosave.save(lamp(`p${i}`));
    const list = ids(autosave);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]).toBe(`p${MAX_RECENTS + 1}`);
    expect(list).not.toContain('p0');
    expect(list).not.toContain('p1');
    expect(storage.getItem(projectKey('p0'))).toBeNull();
    expect(storage.getItem(projectKey('p1'))).toBeNull();
    expect(storage.getItem(projectKey('p2'))).not.toBeNull();
  });

  it('removes one recent, or all but the open project', () => {
    const storage = new FakeStorage();
    const autosave = createAutosave(storage, { now });
    const changes = vi.fn();
    autosave.subscribe(changes);
    for (const id of ['a', 'b', 'c']) autosave.save(lamp(id));
    autosave.removeRecent('b');
    expect(ids(autosave)).toEqual(['c', 'a']);
    expect(storage.getItem(projectKey('b'))).toBeNull();
    autosave.clearRecents('a');
    expect(ids(autosave)).toEqual(['a']);
    expect(storage.getItem(projectKey('c'))).toBeNull();
    expect(autosave.readAutosave('a')?.id).toBe('a');
    autosave.clearRecents();
    expect(ids(autosave)).toEqual([]);
    expect(storage.data.size).toBe(0);
    expect(changes).toHaveBeenCalledTimes(6);
  });
});

describe('storage limits and failures', () => {
  it('evicts the oldest recent on QuotaExceededError and retries once', () => {
    const one = serializeProject(lamp('p0')).length + 200;
    const storage = new FakeStorage(one * 3);
    const autosave = createAutosave(storage, { now });
    for (const id of ['p0', 'p1', 'p2']) autosave.save(lamp(id));
    expect(ids(autosave)).toEqual(['p2', 'p1', 'p0']);

    expect(autosave.save(lamp('p3'))).toBe(true);
    expect(ids(autosave)).toEqual(['p3', 'p2', 'p1']);
    expect(storage.getItem(projectKey('p0'))).toBeNull();
    expect(autosave.readAutosave('p3')?.id).toBe('p3');
    expect(storage.size).toBeLessThanOrEqual(storage.quota);
  });

  it('never evicts the project it is writing, and gives up after one retry', () => {
    const storage = new FakeStorage(100); // smaller than any project
    const autosave = createAutosave(storage, { now });
    expect(autosave.save(lamp('a'))).toBe(false);
    expect(autosave.listRecents()).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('survives storage that throws on every access', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    const autosave = createAutosave(broken, { now });
    expect(autosave.save(lamp('a'))).toBe(false);
    expect(autosave.listRecents()).toEqual([]);
    expect(autosave.readAutosave('a')).toBeNull();
    expect(() => autosave.removeRecent('a')).not.toThrow();
    expect(() => autosave.clearRecents()).not.toThrow();
  });

  it('does nothing without storage', () => {
    const autosave = createAutosave(null, { now });
    expect(autosave.save(lamp('a'))).toBe(false);
    expect(autosave.latest()).toBeNull();
  });
});

describe('debounced autosave', () => {
  it(`writes ${AUTOSAVE_DEBOUNCE_MS} ms after the last change, once`, () => {
    vi.useFakeTimers();
    const storage = new FakeStorage();
    const autosave = createAutosave(storage, { now });
    autosave.schedule(lamp('a', 'one'));
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 100);
    autosave.schedule(lamp('a', 'two'));
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 100);
    expect(storage.getItem(projectKey('a'))).toBeNull();
    vi.advanceTimersByTime(100);
    expect(autosave.readAutosave('a')?.name).toBe('two');
    expect(autosave.listRecents()).toHaveLength(1);
  });

  it('flushes a pending write, and writes the previous project when another one is scheduled', () => {
    vi.useFakeTimers();
    const autosave = createAutosave(new FakeStorage(), { now });
    autosave.schedule(lamp('a'));
    autosave.flush();
    expect(ids(autosave)).toEqual(['a']);
    autosave.schedule(lamp('b'));
    autosave.schedule(lamp('c')); // switching projects: b is written now
    expect(ids(autosave)).toEqual(['b', 'a']);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(ids(autosave)).toEqual(['c', 'b', 'a']);
    autosave.schedule(lamp('d'));
    autosave.cancel();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(ids(autosave)).not.toContain('d');
  });

  it('follows the project of a store', () => {
    vi.useFakeTimers();
    const autosave = createAutosave(new FakeStorage(), { now });
    type Listener = Parameters<ProjectSource['subscribe']>[0];
    let listener: Listener = () => {};
    const store: ProjectSource = {
      subscribe(l) {
        listener = l;
        return () => {};
      },
    };
    connectAutosave(autosave, store);
    const a = lamp('a');
    listener({ project: a }, { project: a }); // something else changed
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(ids(autosave)).toEqual([]);
    const edited = { ...a, name: 'Edited' };
    listener({ project: edited }, { project: a });
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.readAutosave('a')?.name).toBe('Edited');
  });
});
