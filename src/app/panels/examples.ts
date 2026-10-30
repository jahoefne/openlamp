/**
 * The example gallery: every src/examples/*.lamp.json, validated by the core
 * loader, default first.
 */
import { loadProject, type Project } from '@core/model/project.ts';

export const DEFAULT_EXAMPLE_ID = 'bell-default';

/** Familiar lamp types remain visible beneath the collection names. */
export const EXAMPLE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'bell-default': 'Bell',
  drum: 'Drum',
  faceted: 'Faceted',
  'fluted-twist': 'Fluted twist',
  'straight-cone': 'Straight cone',
  trumpet: 'Trumpet',
  'wide-shallow': 'Wide & shallow',
  'pendant-cord': 'Pendant on a cord',
  'e27-pendant': 'E27 pendant',
  'strip-drum': 'Strip ring drum',
  'two-tone-bell': 'Two-tone bell',
  'slatted-drum': 'Slatted drum',
  'lattice-drum': 'Lattice drum',
  'origami-pendant': 'Origami pendant',
  'ph-layered': 'Layered pendant',
  'table-lamp': 'Table lamp',
  'wall-lamp': 'Wall lamp',
};

const rank = (p: Project) => (p.id === DEFAULT_EXAMPLE_ID ? 0 : 1);

export const EXAMPLES: readonly Project[] = Object.values(
  import.meta.glob<{ default: unknown }>('../../examples/*.lamp.json', { eager: true }),
)
  .map((mod) => loadProject(mod.default))
  .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
