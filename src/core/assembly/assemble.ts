/**
 * project → Assembly: the printable parts with their resolved parameters,
 * cache keys, transforms and bed footprints, plus every warning. Pure, no WASM:
 * it runs on the main thread for every edit.
 *
 * M1 resolves the one part it can build, the fused classic shade.
 */
import { canonicalJson, cyrb53 } from '../hash.ts';
import { classicShadeFootprint, derive } from '../geometry/parts/classicShade.ts';
import type { Quality } from '../geometry/quality.ts';
import { IDENTITY, type Assembly, type PartSpec, type Warning } from '../model/assembly.ts';
import { CLASSIC_PARAM_PATHS, projectToClassicParams, type Project } from '../model/project.ts';
import { normalizeClassicShade } from '../schema/normalize.ts';
import type { ClassicShadeKey } from '../schema/defs.ts';
import { layoutParts, placementTransform } from './layout.ts';
import { validateBedFit, validateLayout } from './validate.ts';

export interface AssembleOptions {
  /** Mesh quality baked into every part's params and buildKey; default the preview quality. */
  quality?: Quality;
}

const CLASSIC_PRINT_NOTES = [
  'Print as exported: open end on the bed, housing on top. No supports needed.',
  'Two 0.4 mm perimeters (0.8 mm wall) diffuse the light best; no infill needed.',
];

const FIT_TEST_NOTES = [
  'Fit test: drop the puck into the ring and thread the strap before printing the whole shade.',
];

function projectPath(key: string | undefined): string | undefined {
  return key !== undefined && key in CLASSIC_PARAM_PATHS
    ? CLASSIC_PARAM_PATHS[key as ClassicShadeKey]
    : key;
}

export function assemble(project: Project, options: AssembleOptions = {}): Assembly {
  const quality = options.quality ?? project.quality.preview;
  const shade = project.shades[0];

  const id = 'shade';
  const kind = 'classicShade';
  const normalised = normalizeClassicShade(projectToClassicParams(project, quality));
  const params = normalised.values;
  const buildKey = canonicalJson({ kind, params });
  const fitTest = params.fitTest === 'yes';
  const footprint = classicShadeFootprint(params);

  const layout = layoutParts([{ id, x: footprint.x, y: footprint.y }], project.printer.bed);
  const placement = layout.placements.find((p) => p.id === id);

  const part: PartSpec = {
    id,
    kind,
    displayName: fitTest ? 'Fit-test ring' : 'Shade',
    params,
    buildKey,
    hash: cyrb53(buildKey),
    colour: project.colours[id] ?? project.colours[kind] ?? shade.colour,
    instances: 1,
    assembledTransform: [...IDENTITY],
    printTransform: placement ? placementTransform(placement) : [...IDENTITY],
    bedFootprint: footprint,
    printNotes: [...(fitTest ? FIT_TEST_NOTES : CLASSIC_PRINT_NOTES)],
    warnings: [],
  };
  const parts: PartSpec[] = [part];

  const warnings: Warning[] = normalised.warnings.map((w) => {
    const paramPath = projectPath(w.paramPath);
    return paramPath === undefined ? { ...w, partId: id } : { ...w, partId: id, paramPath };
  });
  const bedFit = validateBedFit(parts, project.printer);
  warnings.push(...bedFit);
  warnings.push(...validateLayout(layout, new Set(bedFit.map((w) => w.partId ?? ''))));
  for (const p of parts) p.warnings = warnings.filter((w) => w.partId === p.id);

  return { parts, layout, derived: derive(params), warnings };
}
