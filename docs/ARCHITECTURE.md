# openlamp architecture

This is the **target architecture** of openlamp: a static (GitHub Pages) generator for complete,
multi-part, 3D-printable lamps with pluggable light sources, several mount types, inner and outer
shades in different styles, structural parts, printer-aware bed-fit warnings, project files and
slicer-ready exports. The code is migrating toward it milestone by milestone (see
[Milestones](#16-milestones)); until M1 lands, the repo is still the vanilla-JS single-shade
generator described in the [README](../README.md), and the [reuse map](#15-reuse-map) shows where
each of today's modules ends up. Keep this document in sync when the design changes.

## Scope

| Area | Decision |
| --- | --- |
| Deploy | Public repo `jahoefne/openlamp` (MIT); Pages at `https://jahoefne.github.io/openlamp/`; Vite `base: '/openlamp/'` |
| Stack | React 19 + TypeScript + Vite; Zustand store; react-three-fiber + drei viewport; manifold-3d in a web worker; pure-TS `src/core/` shared by worker, CLI and tests |
| Light sources | Generic USB LED pucks (Bambu Kit-001 D59×H8 as preset), E27 and E14 bulb sockets, LED/COB strips |
| Mounts | Ceiling pendant on cord (canopy + cord grip), ceiling flush velcro strap (pucks only), wall arm (plate + arm), free-standing table/floor (weighted base + segmented stem) |
| Parts | Hub (light holder; mount face on top, shade collars below), outer shade, optional inner shade, base + lid, stem segments, wall plate, wall arm, canopy, cord grip, tier spacers |
| Shade styles | Revolved profile, layered PH-style tiers, slatted/louvred, geometric (polyhedral / pleated / lattice); inner and outer shade hang from two concentric hub collars with independent style and colour |
| Joints | Printed threads, bayonet (default shade↔hub), snap/press fit, screws / heat-set inserts |
| Printers | Curated list + custom profile; oversize parts only warn (no auto-split, no clamping) |
| Export | Multi-object 3MF with per-part colour, STL per part + ZIP, printable assembly/print sheet (Markdown) |
| Projects | Versioned `.lamp.json` (zod + migrations), localStorage autosave + recents, shareable URL (compressed hash), example gallery |
| Preview | Assembled lamp in context (wall/ceiling/floor), exploded view with click-to-select, light-on preview, section view |

## 1. Guiding decisions

1. **Builders emit geometry in print orientation** (bed = z 0). `assembledTransform` maps print frame → world; `printTransform` is only an XY plate offset. Bed footprint and overhang analysis fall straight out of the bounding box.
2. **Joint interfaces are data, computed once, without WASM.** `assemble(project)` is a pure function that resolves every `JointInterface` and copies the same object into the resolved params of both parts. Male and female sides cannot drift because no builder computes a mating diameter itself.
3. **The hub has a *mount face* and a *light face*, not a top and a bottom.** Hanging mounts use it light-face-down; the standing lamp uses the identical hub rotated 180° (bulb up, shade flares upward). One builder, one flip.
4. **Shades keep their own shoulder.** The collar diameter derives from the hub core (light envelope), not from the shade's top diameter. Family builders deliver a body ending in an annulus at the collar radius; a shared `collar.ts` adds the joint's male side.
5. **Part identity = canonical JSON of resolved params** (`buildKey`). Identical stem segments are one cache entry with N instances. The cache lives in the worker; the UI skips meshes whose hash it already holds.
6. **Only `project` is ever serialised.** One `serializeProject()` and one `parseProject()` (migrate → zod) serve file save/load, autosave, URL share, examples and the CLI.
7. **`src/core/` is pure TypeScript**: no DOM, no `import.meta`, no `?url` imports; the initialised kernel is passed in. It runs identically in the worker, the CLI and Vitest.

## 2. Repo layout

```
openlamp/
  index.html                       <div id="root"> + /src/app/main.tsx
  vite.config.ts                   base '/openlamp/', alias @core, optimizeDeps.exclude ['manifold-3d'], worker.format 'es'
  vitest.config.ts  playwright.config.ts  eslint.config.js  .prettierrc
  tsconfig.json (+ base/core/app/worker/node)
  cli/openlamp.ts                  Node runs .ts natively (type stripping); no tsx
  docs/ARCHITECTURE.md             this document
  src/core/
    index.ts
    model/project.ts               TS types + zod schema + PROJECT_VERSION + migrate() (incl. legacy ?query → v1)
    schema/defs.ts                 ParamDef[] per variant (drives Inspector + CLI list)
    schema/normalize.ts            clampToSchema (generalised normalizeParams)
    schema/printers.ts             curated printer DB
    assembly/assemble.ts           project → Assembly (parts, interfaces, warnings); pure
    assembly/interfaces.ts         light envelope → collars → shade joints; mount → hub mount face
    assembly/layout.ts             shelf-packing of footprints → printTransform, overflow warnings
    assembly/validate.ts           non-adjusting cross-part checks
    geometry/kernel.ts             Kernel = ManifoldToplevel; scoped() memory helper
    geometry/{quality,profile,surface,primitives}.ts
    geometry/joints/{thread,bayonet,snap,screw}.ts      male(iface) / femaleCutters(iface)
    geometry/parts/{hub,lightInserts,stem,base,baseLid,wallPlate,wallArm,canopy,cordGrip,spacer}.ts
    geometry/parts/shades/{collar,revolved,tiered,slatted,geometric}.ts
    geometry/build.ts              registry PartKind → builder; buildPart(kernel, spec, quality)
    geometry/cache.ts              PartCache (LRU by triangle budget, calls .delete())
    export/{stl,threemf,zip,printSheet}.ts
    hash.ts                        canonicalJson (sorted keys, numbers rounded 1e-4), cyrb53
  src/worker/{geometry.worker.ts,protocol.ts}
  src/app/
    main.tsx  App.tsx
    store/{projectStore,uiStore,buildStore,selectors}.ts
    worker/{workerClient,useBuildPipeline,geometryRegistry}.ts
    viewport/{Viewport,PartMesh,ContextPlanes,Ghosts,SectionPlane,LightOn,CameraRig}.tsx  useExplode.ts
    panels/{ProjectBar,LampTree,Inspector,StatusPanel,PrinterDialog,ExamplesDialog,PrintSheetDialog}.tsx
    forms/SchemaForm.tsx  forms/fields/{NumberField,SelectField,ToggleField,ColourField}.tsx
    persistence/{fileIO,autosave,urlState}.ts
    export/{exportPipeline,download}.ts
    styles/tokens.css (today's dark tokens) + *.module.css
  src/examples/*.lamp.json
  tests/unit/**  tests/e2e/**  tests/fixtures/*.lamp.json  tests/helpers/kernel.ts
  .github/workflows/ci.yml
```

## 3. Domain model (`src/core/model/project.ts`, plain JSON)

```ts
type Mm = number; type Deg = number; type Hex = `#${string}`; type Mat4 = number[]; // 16, column-major
type Quality = 'draft' | 'normal' | 'fine';

interface Project {
  version: number; id: string; name: string; revision: number; updatedAt: string;
  printer: PrinterSpec;                       // { id, vendor, name, bed:[x,y,z], nozzle, multiColour }
  quality: { preview: Quality; export: Quality };
  light: LightSource; mount: Mount;
  hub: { wallThickness: Mm; shoulderAngle: Deg; collarWall: Mm; radialGap: Mm; ventCount: number;
         fused: boolean };                     // fused = hub + outer shade as one print (today's output)
  shades: ShadeSpec[];                        // [] | [outer] | [outer, inner]
  joints: { shadeToHub: 'bayonet' | 'snap' | 'thread'; tolerance: Mm; threadPitch: Mm; threadDepth: Mm;
            screw: 'M3'; heatSet: boolean };
  colours: Record<string, Hex>;               // by PartKind, overridable by part id
  fitTest: boolean;                           // export only the joint/fit test pieces
}

type LightSource =
  | { kind: 'puck'; preset: 'bambu-kit-001' | 'custom'; diameter: Mm; height: Mm; clearance: Mm;
      lightHoleDiameter: Mm; ledgeThickness: Mm; cableWidth: Mm }
  | { kind: 'bulb'; size: 'E27' | 'E14'; fitting: 'shadeRing' | 'm10Nipple'; holeDiameter: Mm;
      plateThickness: Mm; skirtDiameter: Mm; skirtHeight: Mm; bulbDiameter: Mm; bulbLength: Mm;
      heatClearance: Mm; cableDiameter: Mm }
  | { kind: 'strip'; stripWidth: Mm; stripThickness: Mm; ringDiameter: Mm; channelDepth: Mm; cableWidth: Mm };

type Mount =
  | { kind: 'ceilingStrap'; strapWidth: Mm; strapThickness: Mm; loopLength: Mm; loopWall: Mm }   // puck only
  | { kind: 'ceilingCord'; cordDiameter: Mm; dropLength: Mm; grip: 'knot' | 'collet';
      canopy: { diameter: Mm; height: Mm; screwSpacing: Mm } }
  | { kind: 'wallArm'; plate: { width: Mm; height: Mm; thickness: Mm; keyholeSpacing: Mm };
      arm: { shape: 'straight' | 'angled' | 'curved'; length: Mm; riseAngle: Deg; tubeDiameter: Mm; cableDiameter: Mm } }
  | { kind: 'standing'; variant: 'table' | 'floor';
      base: { diameter: Mm; height: Mm; pocketDepth: Mm; lid: 'snap' | 'screws' };
      stem: { totalHeight: Mm; segmentLength: Mm; diameter: Mm; cableDiameter: Mm; fluting?: SurfaceStyle } };

interface ShadeSpec { id: string; role: 'outer' | 'inner'; colour: Hex; wallThickness: Mm;
  collarDiameter?: Mm /* auto unless overridden (may only enlarge) */; style: ShadeStyle }

type SurfaceStyle = { style: 'smooth' | 'ribbed' | 'faceted'; patternCount: number; ribDepth: Mm; twist: Deg };
type ShadeStyle =
  | { family: 'revolved'; bottomDiameter: Mm; topDiameter: Mm; height: Mm; curve: number; shoulderAngle: Deg; surface: SurfaceStyle }
  | { family: 'tiered'; tiers: number; topDiameter: Mm; bottomDiameter: Mm; tierDrop: Mm; overlap: Mm; curve: number; spacers: 3 | 4 }
  | { family: 'slatted'; topDiameter: Mm; bottomDiameter: Mm; height: Mm; slatCount: number; slatWidth: Mm;
      slatThickness: Mm; louvreAngle: Deg; twist: Deg; ringHeight: Mm }
  | { family: 'geometric'; variant: 'polyhedral' | 'pleated' | 'lattice'; bottomDiameter: Mm; topDiameter: Mm; height: Mm;
      sides?: number; twist?: Deg; pleatCount?: number; pleatDepth?: Mm; bands?: number;
      holeShape?: 'hex' | 'round'; holeSize?: Mm; holePitch?: Mm };

type JointType = 'thread' | 'bayonet' | 'snap' | 'screw';
interface JointInterface {                    // resolved once in assemble(), copied into both parts' params
  id: string; type: JointType; nominalDiameter: Mm; length: Mm; tolerance: Mm;
  thread?: { pitch: Mm; depth: Mm; flank: Deg; hand: 'right' };
  bayonet?: { lugs: number; lugWidth: Mm; lugHeight: Mm; lugDepth: Mm; travel: Deg };
  snap?: { ribs: number; ribHeight: Mm };
  screw?: { count: number; hole: Mm; counterbore: [Mm, Mm]; insertPocket?: [Mm, Mm] };
  male: string; female: string;               // part ids
}

type PartKind = 'classicShade' /* M1 only */ | 'hub' | 'shade' | 'tier' | 'spacer' | 'stem' | 'base' | 'baseLid'
  | 'wallPlate' | 'wallArm' | 'canopy' | 'cordGrip';
interface PartSpec {
  id: string; kind: PartKind; displayName: string;
  params: object;                             // self-contained resolved params incl. JointInterface copies + quality
  buildKey: string; hash: string;             // canonical JSON / cyrb53 — cache key and file-name suffix
  colour: Hex; instances: number;
  assembledTransform: Mat4; printTransform: Mat4;
  bedFootprint?: { x: Mm; y: Mm; z: Mm };     // filled from stats after build
  printNotes: string[]; warnings: Warning[];
}
interface Warning { severity: 'error' | 'warning' | 'info'; code: string; message: string; partId?: string; paramPath?: string }
interface Assembly { parts: PartSpec[]; interfaces: Record<string, JointInterface>; derived: Record<string, number>; warnings: Warning[] }
```

The schema is zod 4 (`z.discriminatedUnion('kind', …)`). `PROJECT_VERSION` bumps whenever the shape changes; `migrate(raw)` runs `MIGRATIONS[v]` in a loop until current, then `ProjectSchema.parse`. Version 0 is today's flat `?bottomDiameter=…` query string, so existing shared links keep opening. M1 already ships v1 in the `light / mount / hub / shades` structure (only `puck` + `ceilingStrap` + `revolved` + `fused: true`), so the M2 migration stays small.

## 4. Assembly algorithm (`src/core/assembly/`, pure, no WASM)

1. **Normalise** every variant against its `ParamDef[]` (clamp + warning). Hard error: `ceilingStrap` with a non-puck light.
2. **Light envelope** → `{ rCore, insertDepth, cableDiameter, cablePath: 'side' | 'axial', heatZone }`. Puck: `rCore = Ø/2 + clearance + bossWall` (today's `rBoss`). Bulb: `rCore = skirtDiameter/2`, heat zone = bulb envelope + `heatClearance`. Strip: `rCore = ringDiameter/2 + stripWidth + 2·wall` (the hub is a wide disc).
3. **Collars**: inner collar nominal `D_in = 2·(rCore + 1.5)`; outer `D_out = D_in + 2·(collarWall + lugDepth + radialGap)`. Each becomes a `JointInterface` of type `joints.shadeToHub` (female = hub, male = shade). A shade whose top is too narrow for its collar is widened with a warning.
4. **Mount joint**:
   - `ceilingStrap` → belt-loop tunnels on the hub, no extra parts.
   - `ceilingCord` → hub mount face = cord boss with knot cavity; parts: canopy (+ cord grip for `collet`, canopy↔grip thread Ø16).
   - `wallArm` → hub mount face = male hollow thread stub, female in the arm end boss; arm↔plate screw joint (4×M3, inserts in the plate).
   - `standing` → hub mount face = female thread; stem top male; stem↔stem thread (same Ø); bottom segment flange ↔ base screws (4×M3 inserts in the base).
5. **Stem segments**: `n = ceil(totalHeight / segmentLength)`, equal lengths; all non-flange segments share one `buildKey` (`instances = n − 1`).
6. **Transforms** (world z up): hanging mounts → hub print frame = world (light face at z 0 facing −z), shades translated by −H so their collar plane is z 0, canopy at `hubHeight + dropLength`. Standing → hub rotated 180° about X and lifted to the stem top; shades flipped likewise. Wall → wall plane y 0, arm along +y, hub below the arm end.
7. **Layout**: greedy shelf packing of footprints (10 mm gap, rotate 90° when that fits a shelf better) → `printTransform`; parts that overflow the bed get a warning and are still exported.
8. **Validate** (§8) and return. Interfaces flow one way (light → hub core → collars → shades; mount → hub mount face → mount parts), so there is no iteration.

## 5. Part builders (`src/core/geometry/parts/`)

Every builder is `build(k: Kernel, params, q: Quality) → { manifold, stats: { status, maxOverhangDeg, volumeMm3, bbox, triangles, notes } }` and runs inside `scoped()`.

| Part | Algorithm (manifold terms) | Print orientation |
| --- | --- | --- |
| **hub** | `revolve` profile: outer collar ring at z 0 → shoulder cone (≥ 45°) → mount boss → mount face at `zTop`; inner collar cylinder; `difference` light-insert cutters; `union` mount features; `difference` joint cutters | light-face-down (collars on the bed), as today; strip hub prints mount-face-down |
| hub · puck insert | today's pocket / ledge / light-hole cutters unchanged; cable slot sideways (strap) or axial Ø8 bore through the boss | — |
| hub · E27 / E14 | 3 mm plate with hole Ø40.5 / Ø28.5 (`shadeRing`) or Ø10.5 + nut recess Ø19×4 (`m10Nipple`); skirt Ø50/38 × 12 on the light face; `ventCount` × Ø6 vents in the cone; cable bore Ø8. Defaults: bulb Ø60/35, length 110/100, heatClearance 15 | — |
| hub · strip | disc with a downward groove `stripWidth + 0.4` × `stripThickness + 1.5` at `ringDiameter`; cable slot | mount-face-down |
| hub · mount faces | strap = today's `beltLoop()`; cord boss = cylinder with hole Ø+1 and knot cavity Ø 3.5×cord; male thread stub Ø16×12 hollow; female thread bore Ø20×14 | — |
| **shade** (any family) | family body ending in an annulus at `rCollar`; `collar.ts` appends ring + joint male side | open end down, collar up (as today) |
| **stem** | tube `cylinder(len, OD/2) − cylinder(len+2, cable/2)`; male thread top, female bore bottom; optional fluting via `radialWarp` on the mid z-range; segment 0 has a flange Ø OD+20 × 4 with 4 × Ø3.4 holes instead of the female thread | vertical, female end down |
| **base** | revolve of a flat-topped disc with ≤ 45° chamfer; annular weight pocket opening downward, minus a 14 mm spoke carrying an underside cable groove (5×4) from the central Ø10 bore to a rim notch; 4 heat-set pockets on top | top-face-down (pocket and groove face up) |
| **baseLid** | flat disc, snap ring or 3 screws | flat |
| **wallPlate** | `CrossSection` rounded rect → `extrude`; 2 keyhole slots (Ø9 head, 4.5 slot, 12 long), 4 heat-set pockets, bottom cable notch | back-face-down |
| **wallArm** | tube from a Ø60 flange: `straight` = extrude; `angled` = extrude + rotate ≤ 45°; `curved` = `revolve(annulus, segs, sweep ≤ 45°)` torus sector; end boss = vertical cylinder with female thread, teardrop section toward the wall, faired with `hull`; cable bore throughout | standing on its flange (tube within 45° of vertical, bore horizontal) |
| **canopy** | revolve of a shallow cone Ø90 × 25 narrowing upward; 2 screw slots at `screwSpacing`; central cord hole; `collet` adds a threaded neck Ø16 with 3 slits | ceiling-face-down |
| **cordGrip** | cap with internal thread and conical bore (print sheet recommends PETG) | open end down |
| **tier / spacer** | see §6 | per-tier overhang analysis |

**Printed threads — twist-extrude** (`joints/thread.ts`). `Manifold.extrude(camSection, length, nDivisions, twistDegrees)` of a 2D cam

```
r(θ) = rMinor + depth · tooth(θ / 2π)
```

where `tooth(u)` is a trapezoid with flank fraction `depth/pitch` on each side (45° flanks in the axial section) and crest = root = `(1 − 2·depth/pitch) / 2`. Defaults: pitch 2.5, depth 0.8, tolerance 0.25. `twistDegrees = 360 · length / pitch`; `nDivisions = ceil(twist / 10)` (15° in draft, 6° in fine); 96 / 128 / 192 cam vertices. The female cutter is the same cam with `rMinor + tol, rMajor + tol` (not `CrossSection.offset`, which adds vertices). Lead-in: intersect the male with a tapering frustum; countersink the female mouth. **Settle the twist sign for a right-hand thread with one unit test before anything depends on it.** Rejected alternatives: hull-segment helix sweep (slow, fragile), warp sawtooth (needs a dense mesh), `levelSet` (seconds per part).

**Bayonet** (default shade↔hub): hub ring inner radius = shade collar outer radius + tol (0.3). Per lug, the female cutters are an axial entry box (`lugWidth + 2·tol`) from the ring edge to `lugZ + lugHeight + tol` plus a circumferential groove `Manifold.revolve(rect, segs, travel)` rotated to the slot angle. The male lug on the shade collar is `Manifold.hull(6 pts)` with a flat top and a 45° underside, so it prints collar-up without support. Defaults: 3 lugs, 6 × 2 × 1.6 mm, travel 35°, collar wall locally thickened to 2.0.

**Snap / press**: collar radius = ring inner radius − 0.2 with 3 crush ribs 0.3 mm proud. **Screws**: M3 through Ø3.4, counterbore Ø6 × 3, heat-set pocket Ø4.0 × 6.0; one `screwPattern(iface)` yields the cutters for either side.

**Fused single piece** (`hub.fused`; only revolved outer shade + puck + strap/cord, no inner shade): union hub and shade in the shade's print frame (hub translated up by the shade height), with the collar joint replaced by a solid ring. This reproduces today's one-print output.

## 6. Shade families (`parts/shades/`)

Shared contract: body in print frame, open end on the bed, terminating in an annulus at `rCollar`.

1. **revolved** — today's pipeline: `sampleProfile` + `offsetProfile` (from `wallProfiles`), `buildProfile` ending at the collar instead of the housing, `radialWarp` (from `makeWarp`).
2. **tiered (PH-5 style)** — each tier is the revolve of a curved shell; tiers overlap (`rIn[i+1] < rOut[i]`, vertical `tierDrop`) so the bulb is never directly visible. Every tier is its own `PartSpec` (own colour); its print flip is chosen by computing `maxOverhangDeg` for both orientations, and flat saucers warn. `spacer` parts (Ø5 rods with Ø4 × 3 pins, 3–4 per gap) go into Ø4.3 radial holes; the top tier carries the collar.
3. **slatted** — top ring (annulus + collar) + bottom ring + N slats, each `hull(8 corners)` (top rectangle at θ, bottom at θ + twist, pre-rotated by `louvreAngle`), joined in one batch `union`. Validation: lean `atan(hypot(chord, Δr) / H) ≤ 50°`, gap `2πr/N − slatWidth > 0`.
4. **geometric**
   - `polyhedral` = `extrude(Ngon, H, 0, twist, scaleTop)` minus the inner polygon (`CrossSection.offset(−t, 'Miter')`) extruded with the same twist (ruled origami facets, no warp).
   - `pleated` = `radialWarp` with a triangle wave whose phase alternates per band (Yoshimura); profile samples aligned to band boundaries and `segs` a multiple of `pleatCount`.
   - `lattice` = shell minus hole prisms placed along the local normal on a staggered (θ, z) grid; `Manifold.compose(cutters)` then **one** `difference`; default hex 6 mm vertex-up; capped at ~600 holes, 8-segment prisms in draft.

## 7. Kernel, memory, cache, quality

- `scoped(k, (s) => { const a = s.add(Manifold.cylinder(...)); …; return s.keep(result); })` tracks every `Manifold` / `CrossSection` and deletes all but the kept ones in `finally`; `s.swap(old, next)` covers the `body = body.warp()` pattern. A test harness counts live objects and asserts zero leaks after each build, including thrown errors.
- `PartCache`: `Map<buildKey, { manifold, stats, tris, lastUsed }>`, LRU eviction by total triangle budget (~3 M) calling `.delete()`. Quality is part of `buildKey`, so `preview` (draft while dragging a slider, normal when idle) and `export` (fine) coexist. `simplify()` on export meshes.
- Normals are computed in the worker (`calculateNormals` → `getMesh()` with `numProp 6`); the main thread never runs `computeVertexNormals`.
- Rough budget at normal quality: revolve + warp 30–80 ms; hub 150–300 ms; thread (50k tris) ≈ 100 ms; slatted union ≈ 200 ms; lattice 0.5–2 s (the one expensive op).

## 8. Validation layers

1. **Schema clamp** (`schema/normalize.ts`): ranges, enums, `wallThickness ≥ nozzle` (info if < 2×nozzle).
2. **Interface resolution** (`assembly/interfaces.ts`, auto-adjust + warning): shade top raised to clear the collar; inner collar shrunk / outer raised to honour `radialGap`; strip channel = strip + 0.4.
3. **Project validation** (`assembly/validate.ts`, non-adjusting): strap + non-puck → error; inner shade inside the bulb heat zone; bulb light → recommend PETG and LED bulbs; any part bbox > bed per axis (warning only; stem `len + thread ≤ bedZ`, base Ø ≤ min(bedX, bedY)); bayonet ring wall ≥ 1.6 and `lugDepth ≤ wall − 0.4`; thread `pitch ≥ 4×nozzle`, `depth ≥ 3×layer`, `length ≥ 2×pitch`, Ø ≥ 10; cable bores ≥ cable + 1; slat lean/gap; tier overlap; pattern period `2πr/n ≥ 2×nozzle`.
4. **Geometry stats** (post-build): `status !== 'NoError'` → error; `maxOverhangDeg > 50` → warning. Test-only: `intersection(male, femaleSolid).volume() ≈ 0` per joint; `innerShade.minGap(bulbEnvelope) ≥ heatClearance`.

## 9. Worker protocol (`src/worker/protocol.ts`, hand-rolled and typed, no comlink)

```ts
type ToWorker =
  | { t: 'init' }
  | { t: 'build'; gen: number; parts: PartSpec[]; quality: Quality }
  | { t: 'export'; jobId: string; parts: PartSpec[]; quality: Quality; format: 'stl' | 'zip-stl' | '3mf';
      layout: PlacedPart[]; printer: PrinterSpec; meta: { name: string; shareUrl?: string } }
  | { t: 'cancel-export'; jobId: string };
type FromWorker =
  | { t: 'ready'; kernelMs: number }
  | { t: 'part'; gen: number; partId: string; hash: string; positions: Float32Array; normals: Float32Array;
      indices: Uint32Array; stats: PartStats; warnings: Warning[]; buildMs: number; cached: boolean }
  | { t: 'part-error'; gen: number; partId: string; message: string }
  | { t: 'build-done'; gen: number; totalMs: number }
  | { t: 'progress'; jobId: string; done: number; total: number; label: string }
  | { t: 'export-done'; jobId: string; files: { name: string; data: ArrayBuffer; mime: string }[] }
  | { t: 'export-error'; jobId: string; message: string };
```

- The worker initialises the kernel as today (`Module({ locateFile: () => wasmUrl }); setup()`).
- The build loop checks `gen !== latestGen` between parts (cooperative cancel); a throwing builder yields `part-error` for that part only and the loop continues.
- Export builds at export quality (the cache makes unchanged parts free), applies `printTransform` + layout offset, writes STL / 3MF / ZIP inside the worker and transfers the buffers.
- `workerClient.ts` exposes `build()`, `export()` with `onProgress`, and `onPart()`. `useBuildPipeline` subscribes to `project` + preview quality, debounces 120 ms, runs `assemble()`, diffs part hashes against `buildStore`, bumps `gen` and posts `build`.

## 10. App (React 19, `src/app/`)

**Stores (zustand 5)** — three, not one:

- `projectStore`: `{ project, dirty, setParam(path, key, value, transient?), replaceProject, setPrinter, addShade/removeShade/setMount/setLight/… }`, wrapped in `immer` + `zundo` `temporal` (`partialize`: project only, `limit 100`, equality on `project.revision`, `handleSet` throttled 300 ms). Slider drags call `temporal.pause()` on `onValueChange` and `resume()` + commit on `onValueCommit`, so one drag = one undo step.
- `uiStore` (not undoable, not saved): `selection`, `hover`, `explode 0..1`, `section` + axis, `lightOn`, `ghosts`, `viewMode: 'assembled' | 'bed'`, `previewQuality`, panel visibility.
- `buildStore`: per part `{ status: queued|building|ready|error|stale, revision, stats, warnings, error, buildMs, cached }`, assembly warnings, export progress. `THREE.BufferGeometry` objects live outside React in `geometryRegistry` (Map by part id), created in the worker-client message handler.
- `selectors.ts`: `useAssembly()` memoises `assemble(project)` so tree, viewport and export share one `PartSpec[]`; `useSelectedPart`, `useBedFit`, `useTotals`.

**Viewport (react-three-fiber 9 + drei 10)**:

- `THREE.Object3D.DEFAULT_UP.set(0, 0, 1)` at module scope; `<Canvas frameloop="demand" dpr={[1, 2]} gl={{ antialias: true, localClippingEnabled: true }} camera={{ up: [0, 0, 1], position: [260, -300, 220], fov: 40, near: 1, far: 4000 }}>`.
- One `<PartMesh>` per `PartSpec`, placed by `assembledTransform` (or `printTransform` + layout in bed view) plus the explode offset (`useExplode`: rank parts by assembled bbox centre z, offset `factor · 60 mm · (rank − median)`). Geometry swaps in `useLayoutEffect` keyed on `buildStore.parts[id].revision`; the old mesh stays while rebuilding. Materials are cached per (colour, mode).
- Selection via `onClick` + drei `<Outlines>` on the selected mesh; `onPointerMissed` clears it.
- Section view = one shared `THREE.Plane` always in `clippingPlanes`, with `constant = 1e6` when off (avoids shader recompiles).
- `<ContextPlanes>` per mount (ceiling at hub top + cord/strap, wall plane at the plate back, floor + drei `<Grid rotation={[π/2, 0, 0]}>` for standing, printer bed rectangle in bed view); `<Ghosts>` for puck / bulb / cord / strap / screws (today's translucent look).
- `<LightOn>` = point light + emissive source and `MeshPhysicalMaterial` with transmission for shades (metalness/roughness for a reflective inner shade), lit by a synthetic drei `<Environment>` with `<Lightformer>`s (no CDN HDR); falls back to `transparent, opacity 0.6 + emissive` when `navigator.hardwareConcurrency <= 4`.
- `<CameraRig>` = `OrbitControls` + drei `<Bounds>`, refit only on mount change, example load or the "F" key.

**Layout and components**: CSS grid `bar / tree | viewport | inspector / status` (280 px, 1fr, 340 px); below 1100 px the inspector becomes a Radix sheet, below 760 px everything stacks with the viewport at 50 vh. Radix primitives (`radix-ui` umbrella: Slider, Select, Dialog, DropdownMenu, Tabs, Tooltip) + CSS Modules with today's dark tokens. `SchemaForm` renders `ParamDef[]` (number → Radix Slider + number input; select; boolean; colour with swatches); `visibleWhen` replaces today's `refreshVisibility()`; clamp warnings from core show inline. Panels: `ProjectBar` (name, printer chip, undo/redo, open/save/share, examples, export ▾), `LampTree` (Printer, Mount, Light, Outer shade, Inner shade, Structure parts), `Inspector`, `StatusPanel` (build ms, triangles, grams per part, max overhang, bed-fit badges, warnings, per-part errors), `PrinterDialog`, `ExamplesDialog`, `PrintSheetDialog`.

## 11. Persistence (`src/app/persistence/`)

- `parseProject(text)` = `JSON.parse` → `migrate` → `ProjectSchema.parse`; `serializeProject(project)`. Both live in core and are used everywhere.
- **File save**: `showSaveFilePicker` (Chromium) with the Blob + `<a download>` fallback; the handle is kept for Save vs Save as; suggested name `<name>.lamp.json`. **Load**: `<input type=file accept=".json">` and a whole-app drop zone.
- **Autosave**: `projectStore.subscribe`, debounced 800 ms → `localStorage['openlamp:project:<id>']` + `openlamp:recents` (≤ 12 entries); try/catch with one eviction retry on `QuotaExceededError`.
- **URL share**: `#p=` + lz-string `compressToEncodedURIComponent(serializeProject(project))` (≈ 1–2 KB), `history.replaceState` on commit only; soft warning above 8 000 chars; legacy `?key=value` links are detected and migrated on load.
- **Examples**: `src/examples/*.lamp.json` via `import.meta.glob(…, { eager: true })`; a Vitest test parses and assembles every example and builds it at draft quality with `NoError`.

## 12. Export (`src/core/export/`, runs in the worker)

- **STL** per part: `meshToBinaryStl` (today's writer, unchanged) after `printTransform`; file names `openlamp-<project>-<part>.stl`.
- **ZIP**: fflate `zipSync`, level 0, for the STLs + `print-sheet.md`.
- **3MF**: hand-rolled core-spec writer (`@jscadui/3mf-export` has no colour support, no types and no exports map). `3D/3dmodel.model` with `unit="millimeter"`, `<basematerials id="1">` with one `<base name displaycolor="#RRGGBBFF">` per distinct colour, each `<object id type="model" name="…" pid="1" pindex="k">` with its mesh, `<build><item objectid transform="…">` carrying the bed-layout offset; plus `[Content_Types].xml` and `_rels/.rels`; zipped with fflate level 6. Bambu Studio, OrcaSlicer and PrusaSlicer import it as separately named objects.
- A `slicerFlavour: 'generic' | 'bambu' | 'prusa'` option exists in the pipeline from day one. The Bambu project flavour (`Metadata/model_settings.config` per-object `extruder` + `project_settings.config`) is **deferred** until Bambu Studio's colour import bug (bambulab/BambuStudio#9666: generic colours become face paint instead of per-object filaments) is fixed and tested on a real AMS.
- **Bed layout** (`assembly/layout.ts`) also drives the viewport's bed view.
- **Print sheet**: pure `renderPrintSheet(assembly, printer, project) → Markdown` (parts table with colour, grams, orientation and joint notes; non-printed items derived from mount/light such as puck + cable + velcro, E27 socket + cord set, screws/anchors, weights; per-mount assembly steps; printing notes), rendered with `marked` in a dialog with `@media print` CSS and included in the ZIP.

## 13. Printer database (`src/core/schema/printers.ts`)

| id | Model | X×Y×Z mm | Multi-colour |
| --- | --- | --- | --- |
| bambu-a1-mini | Bambu Lab A1 mini | 180×180×180 | yes (AMS lite) |
| bambu-a1 / p1p / p1s / x1c | Bambu Lab A1, P1P, P1S, X1 Carbon | 256×256×256 | yes |
| bambu-h2d | Bambu Lab H2D (single nozzle) | 325×320×325 | yes |
| bambu-h2d-dual | Bambu Lab H2D (both nozzles) | 300×320×325 | yes |
| prusa-mini | Prusa MINI+ | 180×180×180 | no |
| prusa-mk3s | Prusa i3 MK3S+ | 250×210×210 | MMU optional |
| prusa-mk4 | Prusa MK4 / MK4S | 250×210×220 | MMU3 optional |
| prusa-core-one | Prusa CORE One | 250×220×270 | MMU3 optional |
| prusa-xl | Prusa XL | 360×360×360 | yes |
| creality-ender3-v3-se / ke | Ender-3 V3 SE / KE | 220×220×250 / 240 | no |
| creality-k1 / k1-max / k2-plus | K1 / K1 Max / K2 Plus | 220³ / 300³ / 350³ | no / no / yes |
| elegoo-neptune4 / plus / max | Neptune 4 (Pro) / Plus / Max | 225×225×265 / 320×320×385 / 420×420×480 | no |
| elegoo-centauri-carbon | Centauri Carbon | 256×256×256 | no |
| voron-0.2 / 2.4-250/300/350 | Voron 0.2 / 2.4 | 120³ / 250³ / 300³ / 350³ | no |
| anycubic-kobra2 / kobra3 / kobra-s1 | Kobra 2 / 3 / S1 | 220×220×250 / 250×250×260 / 250³ | no / yes / yes |
| custom | Custom | user | user |

All profiles default to a 0.4 mm nozzle. Profile shape: `{ id, vendor, name, bed: [x, y, z], nozzle, multiColour, notes? }`; a custom profile is stored inline in the project.

## 14. Tooling, tests, CI (versions verified on npm 2026-10-21)

- **Runtime deps**: react / react-dom 19.3.1, @react-three/fiber 9.8.2 (peer react `>=19 <19.4`), @react-three/drei 10.7.9, three 0.186.1 (+ @types/three 0.186.0), zustand 5.0.15, zundo 2.3.0, immer 11.2.7, zod 4.6.7, fflate 0.8.3, lz-string 1.5.0, marked 18.1.1, radix-ui 1.8.1, manifold-3d ^3.5.4 (upgrade from 3.1.1; its `exports` map still exposes `./manifold.wasm`).
- **Dev deps**: vite ^8.3.5 + @vitejs/plugin-react ^6.1.2 (fallback pair vite 7.3.7 + plugin-react 5 if Rolldown misbehaves with the worker / WASM `?url`), typescript ~5.9.3 (TS 7.0 is out, but typescript-eslint 8.72 only supports `<6.1`), vitest 5.0.5, @playwright/test 1.64.1, eslint 10.13 + @eslint/js + typescript-eslint 8.72 + eslint-plugin-react-hooks 7.1 + eslint-plugin-react-refresh 0.5 + eslint-config-prettier 10.1 + prettier 3.9 + globals 17, @types/node 24.
- **tsconfig**: solution file with `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `moduleResolution: bundler`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`, `paths @core/*`) and four projects: `core` (lib ES2023, `types: []`, which proves purity), `app` (DOM, `jsx: react-jsx`, `types: ["vite/client"]`), `worker` (lib WebWorker), `node` (CLI, tests, configs; `module: NodeNext`). `npm run typecheck` = `tsc -b`. Core and CLI import with relative paths **including `.ts` extensions** so Node's native type stripping can run them; the `@core/*` alias is for app, worker and tests only (mirrored in `vite.config.ts` `resolve.alias`).
- **ESLint** flat config: `@eslint/js` + `typescript-eslint` recommended, react-hooks flat recommended, react-refresh vite preset, prettier last; `src/core/**` forbids `window` / `document` / `self` via `no-restricted-globals`.
- **Vitest** (`vitest.config.ts` merges `vite.config.ts`): `environment: 'node'`, `pool: 'forks'`, `testTimeout` 30 s, `server.deps.external: [/manifold-3d/]` so Node loads the Emscripten glue natively (the path `cli/openlamp.ts` already proves). One kernel per process via a memoised `tests/helpers/kernel.ts` (`Module().then(m => { m.setup(); return m })`). Tests: every part builder asserts `status === 'NoError'`, bbox and key diameters (slice at known z, e.g. housing Ø = `2·rBoss`) and zero manifold leaks; `assemble()` golden snapshots (no WASM); joint intersection volume ≈ 0; thread handedness; every fixture `.lamp.json` migrates and parses; every example assembles and builds.
- **Playwright** (`playwright.config.ts`): chromium only, `launchOptions.args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']` (fallback `channel: 'chromium'`), `webServer: vite preview --port 4173` so tests hit the real `/openlamp/` base (`baseURL http://localhost:4173/openlamp/`, `page.goto('./')`), 2 workers in CI, `trace: retain-on-failure`. Smoke tests at draft quality: app loads with no console errors or failed requests (catches base-path regressions); change a param → status busy → Ready and the footprint changes; switch example; edit → hash changes → reload persists; download STL (header + `84 + 50·n` size check), ZIP and 3MF (`PK\x03\x04` magic); import a fixture via `setInputFiles`. Budget ≤ 3 min.
- **CI / Pages** (`.github/workflows/ci.yml`, one workflow). M0 ships only build + deploy; the target is:
  - job `check` on push + PR: `actions/checkout@v7`, `actions/setup-node@v7` (node 24, npm cache; bump to 26 once it is Active LTS on 2026-10-28), `npm ci`, typecheck, lint + format check, `npm test`, `npm run samples` (watertightness gate; upload `samples/` with `actions/upload-artifact@v7`, 14 days), `npm run build`, cached `playwright install --with-deps --only-shell chromium`, `playwright test`, upload `playwright-report` on failure, `actions/upload-pages-artifact@v5` on main;
  - job `deploy` (needs `check`, main pushes only, `permissions: pages: write, id-token: write`, `environment: github-pages`, `concurrency: pages`) runs `actions/deploy-pages@v5`.
  - No `.nojekyll` is needed (Actions deploys skip Jekyll); Pages serves `.wasm` with the right MIME type and module workers are same-origin.
- **CLI** (`cli/openlamp.ts`, `#!/usr/bin/env node`, `node:util parseArgs`, no deps): `part <kind> [--param v…] -o out.stl`, `project <file.lamp.json> --out dir/ [--zip] [--3mf]`, `samples` (all `src/examples/*.lamp.json` → `samples/`, exit 1 on any non-`NoError`), `list`. npm scripts: `generate`, `samples`. Sample STLs are generated, never committed.

## 15. Reuse map

| Today (`src/`) | New home | Change |
| --- | --- | --- |
| `geometry.ts` `derive` | `assembly/interfaces.ts` (puck envelope) + `parts/shades/revolved.ts` (cone maths) | hub core replaces `rBoss` |
| `wallRadius`, `wallProfiles` | `geometry/profile.ts` `sampleProfile(rFn, zSamples)` + `offsetProfile` | explicit z samples (pleat bands); returns overhang |
| `buildProfile` | `parts/shades/revolved.ts` | ends at the collar annulus; flat-shade fallback kept |
| `makeWarp`, `smoothstep` | `geometry/surface.ts` `radialWarp({ style, n, depth, twist, zRange, fade })` | z-range so stems/threads stay untouched |
| `circularSegments`, `QUALITY` | `geometry/quality.ts` | per-part budgets |
| `beltLoop` | `parts/hub.ts` (strap mount face) | takes hub dims |
| `buildShade` | M1: `classicShade` builder as-is; M2: dissolved into hub + revolved shade, kept via `hub.fused` | — |
| `params.ts` `PARAM_GROUPS` / `normalizeParams` | `schema/defs.ts` / `schema/normalize.ts` | typed `ParamDef` union, `visibleWhen`; cross-constraints move to `assemble` |
| `params.ts` `PRESETS` | `src/examples/*.lamp.json` | validated by tests |
| `stl.ts` `meshToBinaryStl` | `core/export/stl.ts` | unchanged |
| `worker.ts` | `src/worker/geometry.worker.ts` | per-part cache, generations, normals, export jobs |
| `app.ts` three.js setup (Z-up, clipping, ghosts, ceiling, debounce, URL mirror) | `viewport/*`, `useBuildPipeline`, `urlState` | declarative equivalents |
| `style.css` tokens | `styles/tokens.css` | unchanged palette |
| `cli.mjs` | `cli/openlamp.ts` | project-aware, `samples` command |

## 16. Milestones

Each numbered step is one PR-sized commit on `main`; `npm run dev` keeps working after each.

### M0 — Rename, repo, deploy the existing app

1. Rename to openlamp: `package.json` (name, bin, description, MIT licence), `LICENSE`, `index.html` title/meta/h1, `README.md`, `.claude/launch.json`, STL header string, download file names; `vite.config.js` gains `base: '/openlamp/'`.
2. `.gitignore` += `samples/`, `test-results/`, `playwright-report/`, `coverage/`, `node_modules/.tmp/`; stop tracking `samples/`.
3. Add this document and `.github/workflows/ci.yml` (build + Pages deploy only at this point).
4. Create the public repo `jahoefne/openlamp` and enable Pages with build type "GitHub Actions".

Done when `https://jahoefne.github.io/openlamp/` builds the default shade (worker + WASM load under the base path).

### M1 — New UI, printers, projects (today's shade only)

1. **Toolchain**: vite 8 + plugin-react, typescript 5.9, tsconfig set, eslint/prettier, `git mv src/*.js → .ts`, `vite.config.ts`; manifold-3d → 3.5.4; CI adds typecheck + lint.
2. **Core extraction** (`src/core/`): `geometry/kernel.ts` (`scoped()`), `geometry/parts/classicShade.ts` holding today's `buildShade` unchanged as part kind `classicShade` (the hub + shade split happens in M2), `schema/defs.ts` (today's `PARAM_GROUPS` typed, `visibleWhen`), `schema/normalize.ts`, `schema/printers.ts`, `model/project.ts` (zod v1 in the light/mount/hub/shades structure + `migrate` with v0 = legacy query params), `assembly/assemble.ts` (one `classicShade` part, bed-fit warnings, layout), `export/stl.ts`, `hash.ts`. Convert the 7 `PRESETS` into `src/examples/*.lamp.json`. Vitest config + helpers + first tests (shade builder, schema/migrations, examples). Port the CLI to `cli/openlamp.ts` with `npm run samples`; delete `cli.mjs`, `src/params.ts`, `src/geometry.ts`, `src/stl.ts`.
3. **Worker**: `src/worker/protocol.ts` + `geometry.worker.ts` with `PartCache`, generation cancellation, worker-side normals, export jobs (STL first). Delete `src/worker.ts`.
4. **React app**: `index.html` → `#root`; `main.tsx`, `App.tsx`, the three stores + selectors, `workerClient` + `useBuildPipeline` + `geometryRegistry`, R3F viewport (`Viewport`, `PartMesh`, `Ghosts`, `SectionPlane`, `ContextPlanes` for ceiling/bed, `CameraRig`), `SchemaForm` + `Inspector` for the single shade, `ProjectBar` (name, printer chip, undo/redo, open/save/share, examples, Download STL), `PrinterDialog` (curated + custom), `ExamplesDialog`, `StatusPanel` (today's stats + bed-fit badge + warnings). `tokens.css` from `style.css`. Delete `src/app.ts`, `src/style.css` and the form markup in `index.html`.
5. **Persistence**: `fileIO.ts` (save / save as / load / drag-drop), `autosave.ts` + recents, `urlState.ts` (`#p=`, legacy `?` import).
6. **Playwright** suite + CI e2e job; README rewrite (live link, usage, `.lamp.json` format, CLI, development).

Done when the live site offers the 7 examples, slider edits rebuild, undo works, save → reload → load round-trips, a share link reopens the same project, a printer change toggles the bed-fit badge, STL downloads, and CI is green and regenerates the samples.

### M2 — Multi-part assembly, mounts, lights

1. **Light envelopes + hub** (`assembly/interfaces.ts`, `parts/hub.ts`, `parts/lightInserts.ts`, puck first), `parts/shades/collar.ts`, joints `bayonet.ts` / `snap.ts` / `thread.ts` (+ handedness test) / `screw.ts`; replace `classicShade` by `hub` + revolved `shade`; `hub.fused` reproduces the one-piece print. Schema v2 + migration; "Reflector classic" example.
2. **Mounts**: `ceilingStrap` (tunnels on the hub), `ceilingCord` (`canopy.ts`, `cordGrip.ts`), `standing` (`stem.ts` with threads and cable bore, `base.ts`, `baseLid.ts`), `wallArm` (`wallPlate.ts`, `wallArm.ts`). Assembled transforms and context planes per mount.
3. **Lights**: E27/E14 inserts (shadeRing / m10Nipple), strip channel; heat-zone validation; print-sheet BOM items.
4. **Inner shade**: second collar, `radialGap`, inner-shade validation; per-part colours.
5. **App**: `LampTree`, per-node inspectors, click-to-select, exploded view, bed view, ZIP export, print sheet (Markdown dialog), fit-test export (a thread/bayonet test pair replaces today's `fitTest` ring).
6. **Tests**: `assemble()` golden snapshots per mount, joint intersection ≈ 0, leak counter, one example per mount + light. Playwright: switch mount, export ZIP.

### M3 — Shade style families

`tiered.ts` (+ `spacer.ts`, per-tier flip analysis), `slatted.ts`, `geometric.ts` (polyhedral, pleated, lattice with the hole cap). `ParamDef[]` + inspector sections per family, validations (§8), one example per family, builder tests. Schema bump if fields change.

### M4 — Export and rendering polish

Generic 3MF writer + bed layout (with the viewport bed view synced to it), `LightOn` mode with the transmission material and the low-end fallback, `PrintSheetDialog` printing, Playwright 3MF test, then the `bambu` / `prusa` 3MF flavours behind the `slicerFlavour` option once upstream colour handling is fixed.
