/**
 * The example gallery: every src/examples/*.lamp.json, validated by the core
 * loader, default first.
 */
import { loadProject, type Project } from '@core/model/project.ts';

export const DEFAULT_EXAMPLE_ID = 'bell-default';

const rank = (p: Project) => (p.id === DEFAULT_EXAMPLE_ID ? 0 : 1);

export const EXAMPLES: readonly Project[] = Object.values(
  import.meta.glob<{ default: unknown }>('../../examples/*.lamp.json', { eager: true }),
)
  .map((mod) => loadProject(mod.default))
  .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
