/**
 * Project identity. The id names the autosave slot (`openlamp:project:<id>`),
 * so a project that starts something new gets a fresh one: loading an example
 * or pressing Reset never writes over the example's or anyone else's slot.
 * Opening a file or a share link keeps the project's own id.
 */
import type { Project } from '@core/model/project.ts';

/** A fresh project id: `crypto.randomUUID()`, or a random fallback outside secure contexts. */
export function newProjectId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const random = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `lamp-${Date.now().toString(36)}-${random()}${random()}`;
}

/** The same lamp as a new project of its own (name kept, fresh id). */
export function asNewProject(project: Project): Project {
  return { ...project, id: newProjectId() };
}
