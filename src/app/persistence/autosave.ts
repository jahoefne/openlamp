/**
 * Autosave and recent projects in web storage:
 * - `openlamp:project:<id>`: the serialised project (`serializeProject`);
 * - `openlamp:recents`: up to 12 `{ id, name, updatedAt }`, most recent first.
 *
 * Writes are debounced (800 ms after the last change). Every storage access is
 * guarded: storage can be missing (private mode, blocked site data), throw on
 * access, or be full. On `QuotaExceededError` the oldest recent project is
 * evicted and the write retried once.
 *
 * The storage is injected (`StorageLike`), so the logic runs in Node tests.
 */
import { parseProject, serializeProject, type Project } from '@core/model/project.ts';

export const PROJECT_KEY_PREFIX = 'openlamp:project:';
export const RECENTS_KEY = 'openlamp:recents';
export const MAX_RECENTS = 12;
export const AUTOSAVE_DEBOUNCE_MS = 800;

/** The part of the Web Storage API autosave uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RecentProject {
  id: string;
  name: string;
  /** When it was last autosaved (ISO 8601). */
  updatedAt: string;
}

export interface AutosaveOptions {
  /** Clock for `RecentProject.updatedAt` (tests). */
  now?: () => Date;
  debounceMs?: number;
  maxRecents?: number;
}

export interface Autosave {
  /** Write the project now (cancelling a scheduled write). False if storage refused it. */
  save(project: Project): boolean;
  /** Write the project once nothing has changed for `debounceMs`. */
  schedule(project: Project): void;
  /** Write a scheduled project right away (page hide / unload). */
  flush(): void;
  /** Drop a scheduled write. */
  cancel(): void;
  /** The autosaved project with this id, or null (missing or unreadable). */
  readAutosave(id: string): Project | null;
  /** The most recently autosaved project that still reads, or null. */
  latest(): Project | null;
  listRecents(): RecentProject[];
  /** Forget one project: its recents entry and its autosave. */
  removeRecent(id: string): void;
  /** Forget every recent project (and its autosave) except `keep`. */
  clearRecents(keep?: string): void;
  /** Called after the recents list changed. */
  subscribe(listener: () => void): () => void;
}

export const projectKey = (id: string): string => PROJECT_KEY_PREFIX + id;

function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22;
}

function isRecent(v: unknown): v is RecentProject {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && typeof r.updatedAt === 'string';
}

function warn(message: string, e: unknown): void {
  console.warn(`openlamp autosave: ${message}`, e);
}

export function createAutosave(
  storage: StorageLike | null,
  options: AutosaveOptions = {},
): Autosave {
  const now = options.now ?? (() => new Date());
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const maxRecents = options.maxRecents ?? MAX_RECENTS;
  const listeners = new Set<() => void>();
  let pending: Project | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    for (const l of [...listeners]) l();
  };

  const get = (key: string): string | null => {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch (e) {
      warn(`could not read ${key}`, e);
      return null;
    }
  };

  const remove = (key: string): void => {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch (e) {
      warn(`could not remove ${key}`, e);
    }
  };

  const readRecents = (): RecentProject[] => {
    const text = get(RECENTS_KEY);
    if (!text) return [];
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<string>();
      return parsed.filter((r): r is RecentProject => {
        if (!isRecent(r) || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    } catch {
      return [];
    }
  };

  /**
   * Evict the oldest recent project other than `protect`: its autosave and its
   * entry. Returns the list without it, or null when there is nothing to evict.
   */
  const evictOldest = (recents: RecentProject[], protect: string): RecentProject[] | null => {
    for (let i = recents.length - 1; i >= 0; i--) {
      const victim = recents[i]!;
      if (victim.id === protect) continue;
      remove(projectKey(victim.id));
      const rest = recents.filter((_, j) => j !== i);
      writeRaw(RECENTS_KEY, JSON.stringify(rest));
      return rest;
    }
    return null;
  };

  /** setItem without retry; false on any error. */
  function writeRaw(key: string, value: string): boolean {
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch (e) {
      if (!isQuotaError(e)) warn(`could not write ${key}`, e);
      return false;
    }
  }

  /**
   * setItem; on QuotaExceededError evict the oldest recent project (never
   * `protect`) and retry once. `value` is re-read for the retry, so a recents
   * list can drop the evicted entry.
   */
  const write = (
    key: string,
    value: () => string,
    protect: string,
    recents: RecentProject[],
  ): boolean => {
    if (!storage) return false;
    try {
      storage.setItem(key, value());
      return true;
    } catch (e) {
      if (!isQuotaError(e)) {
        warn(`could not write ${key}`, e);
        return false;
      }
    }
    const rest = evictOldest(recents, protect);
    if (!rest) {
      warn(`storage is full, could not write ${key}`, null);
      return false;
    }
    recents.splice(0, recents.length, ...rest);
    try {
      storage.setItem(key, value());
      return true;
    } catch (e) {
      warn(`storage is full, could not write ${key}`, e);
      return false;
    }
  };

  const save = (project: Project): boolean => {
    cancel();
    if (!storage) return false;
    let text: string;
    try {
      text = serializeProject(project);
    } catch (e) {
      warn('project does not validate, not saved', e);
      return false;
    }
    const recents = readRecents();
    if (!write(projectKey(project.id), () => text, project.id, recents)) return false;

    const entry: RecentProject = {
      id: project.id,
      name: project.name,
      updatedAt: now().toISOString(),
    };
    const next = [entry, ...recents.filter((r) => r.id !== project.id)];
    for (const dropped of next.splice(maxRecents)) remove(projectKey(dropped.id));
    const ok = write(RECENTS_KEY, () => JSON.stringify(next), project.id, next);
    emit();
    return ok;
  };

  function cancel(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  }

  const readAutosave = (id: string): Project | null => {
    const text = get(projectKey(id));
    if (!text) return null;
    try {
      return parseProject(text);
    } catch (e) {
      warn(`autosave of ${id} is unreadable`, e);
      return null;
    }
  };

  return {
    save,
    schedule(project) {
      // Switching projects: the last edits of the previous one are written now.
      if (pending && pending.id !== project.id) save(pending);
      pending = project;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const p = pending;
        pending = null;
        if (p) save(p);
      }, debounceMs);
    },
    flush() {
      const p = pending;
      if (p) save(p);
      else cancel();
    },
    cancel,
    readAutosave,
    latest() {
      for (const r of readRecents()) {
        const project = readAutosave(r.id);
        if (project) return project;
      }
      return null;
    },
    listRecents: readRecents,
    removeRecent(id) {
      const recents = readRecents();
      remove(projectKey(id));
      writeRaw(RECENTS_KEY, JSON.stringify(recents.filter((r) => r.id !== id)));
      emit();
    },
    clearRecents(keep) {
      const recents = readRecents();
      for (const r of recents) if (r.id !== keep) remove(projectKey(r.id));
      const kept = recents.filter((r) => r.id === keep);
      if (kept.length > 0) writeRaw(RECENTS_KEY, JSON.stringify(kept));
      else remove(RECENTS_KEY);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ---------------------------------------------------------------- the page's autosave

/** `localStorage`, or null where it is missing or blocked (accessing it can throw). */
export function browserStorage(): StorageLike | null {
  try {
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

let pageAutosave: Autosave | null = null;

/** The page's autosave on `localStorage` (created on first use). */
export function getAutosave(): Autosave {
  pageAutosave ??= createAutosave(browserStorage());
  return pageAutosave;
}

export const readAutosave = (id: string): Project | null => getAutosave().readAutosave(id);
export const listRecents = (): RecentProject[] => getAutosave().listRecents();
export const removeRecent = (id: string): void => getAutosave().removeRecent(id);
export const clearRecents = (keep?: string): void => getAutosave().clearRecents(keep);

/** A store whose `project` is autosaved (the zustand `subscribe` signature). */
export interface ProjectSource {
  subscribe(
    listener: (state: { project: Project }, prev: { project: Project }) => void,
  ): () => void;
}

/** Autosave every change of the store's project (debounced). Returns the unsubscribe. */
export function connectAutosave(autosave: Autosave, store: ProjectSource): () => void {
  return store.subscribe((state, prev) => {
    if (state.project !== prev.project) autosave.schedule(state.project);
  });
}
