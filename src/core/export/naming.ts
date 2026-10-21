/**
 * Export file names, shared by the worker's exports and the CLI.
 */
import type { PartSpec } from '../model/assembly.ts';

/** Lower-case ASCII letters and digits, runs of anything else as one `-`, no `-` at the ends. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** What names an export: the project's name (and id, the fallback for a name without letters or digits). */
export interface ExportNaming {
  name: string;
  id?: string;
}

/**
 * `openlamp-<project-slug>-<part-id>.<ext>`, e.g. `openlamp-bell-default-shade.stl`.
 * The project slug falls back to the slugified id, then to `project`.
 */
export function partFileName(meta: ExportNaming, part: Pick<PartSpec, 'id'>, ext: string): string {
  const project = slugify(meta.name) || slugify(meta.id ?? '') || 'project';
  return `openlamp-${project}-${part.id}.${ext}`;
}
