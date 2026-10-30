/**
 * Export file names, shared by the worker's exports and the CLI.
 */
import type { PartSpec } from '../model/assembly.ts';

/** Fold accents and Nordic letters to ASCII, then use lower-case letters, digits and hyphens. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** What names an export: the project's name (and id, the fallback for a name without letters or digits). */
export interface ExportNaming {
  name: string;
  id?: string;
}

/**
 * `openlamp-<project-slug>`, the stem of every export file name. The project
 * slug falls back to the slugified id, then to `project`.
 */
export function exportStem(meta: ExportNaming): string {
  const project = slugify(meta.name) || slugify(meta.id ?? '') || 'project';
  return `openlamp-${project}`;
}

/** `openlamp-<project-slug>-<part-id>.<ext>`, e.g. `openlamp-bell-default-shade.stl`. */
export function partFileName(meta: ExportNaming, part: Pick<PartSpec, 'id'>, ext: string): string {
  return `${exportStem(meta)}-${part.id}.${ext}`;
}

/** `openlamp-<project-slug>.<ext>`, e.g. `openlamp-bell-default.zip`: one file for the whole lamp. */
export function archiveFileName(meta: ExportNaming, ext: string): string {
  return `${exportStem(meta)}.${ext}`;
}
