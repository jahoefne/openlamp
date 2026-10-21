# openlamp architecture

This is the **target architecture** of openlamp: a static (GitHub Pages) generator for complete,
multi-part, 3D-printable lamps with pluggable light sources, several mount types, inner and outer
shades in different styles, structural parts, printer-aware bed-fit warnings, project files and
slicer-ready exports. The code is migrating toward it milestone by milestone (see
[Milestones](#16-milestones)). Milestone 1 has landed: the React app, the pure core, the worker
protocol, project files and share links, tests and the Pages deploy are in place, and the
[reuse map](#15-reuse-map) records where each of the original modules went. M2 step 1 has
landed too: schema v2, the light envelope and mount dispatch, the hub, the revolved shade with
its collar, the bayonet / snap / thread / screw joint builders, and `hub.fused` keeping the
classic one-piece print (byte-identical meshes). M2 step 2 has landed: schema v3 with all four
mounts, the mount framework (`MountModule`, see [the framework](#mount-framework-as-built-m22a)),
the hub's four mount faces, the pendant on a cord (canopy, cord grip), the standing lamp (stem
segments, weighted base, lid) and the wall lamp (wall plate, arm). M2 step 3 has landed: the
E27 / E14 bulb and the LED strip as light sources (still schema v3), with their hub inserts,
vents, heat-zone checks and ghosts. M2 step 4 (the inner shade on a second hub collar) and
step 5 (the app: lamp tree, per-node inspectors, click-to-select, exploded and bed views, ZIP
export, print sheet, the joint's fit-test pair) have landed, which completes M2. Notes marked
**As built** below record where the implementation differs from the original design. Keep
this document in sync when the design changes.

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
    model/project.ts               TS types + zod schema + PROJECT_VERSION + migrate() (incl. legacy ?query → current)
    model/assembly.ts, model/parts.ts   resolved types: PartSpec, JointInterface, Assembly; builder params
    schema/defs.ts                 ParamDef[] per variant (drives Inspector + CLI list)
    schema/normalize.ts            clampToSchema (generalised normalizeParams)
    schema/printers.ts             curated printer DB
    assembly/assemble.ts           project → Assembly (parts, interfaces, warnings); pure
    assembly/interfaces.ts         light envelope → collars → shade joints (+ screw joints for the mounts)
    assembly/lights/{index,puck}.ts      light kind → envelope + hub insert (bulb, strip: M2.3)
    assembly/mounts/{index,types,common,ceilingStrap,ceilingCord,standing,wallArm}.ts   one MountModule per mount kind
    assembly/transforms.ts         4×4 helpers (translation, rotationZ, flipX, compose)
    assembly/layout.ts             shelf-packing of footprints → printTransform, overflow warnings
    assembly/validate.ts           non-adjusting cross-part checks
    geometry/kernel.ts             Kernel = ManifoldToplevel; scoped() memory helper
    geometry/{quality,profile,surface,primitives}.ts
    geometry/joints/{thread,bayonet,snap,screw,index,types}.ts   male(k, iface, ctx) / femaleCutters(k, iface, ctx); screwPattern
    geometry/parts/{hub,lightInserts,mountFaces,shade,classicShade,stem,base,baseLid,wallPlate,wallArm,canopy,cordGrip,fitPair,spacer}.ts
    geometry/parts/shades/{collar,revolved,tiered,slatted,geometric}.ts
    geometry/build.ts              registry PartKind → builder; buildPart(kernel, spec, quality)
    geometry/cache.ts              PartCache (LRU by triangle budget, calls .delete())
    export/{stl,threemf,zip,printSheet}.ts
    hash.ts                        canonicalJson (sorted keys, numbers rounded 1e-4), cyrb53
  src/worker/{geometry.worker.ts,protocol.ts}
  src/app/
    main.tsx  App.tsx
    App.tsx  useLayout.ts  useKeyboardShortcuts.ts
    store/{projectStore,uiStore,buildStore,selectors,nodes}.ts
    worker/{workerClient,useBuildPipeline,geometryRegistry,pipelineDiff}.ts
    viewport/{Viewport,PartMesh,ContextPlanes,Ghosts,SectionPlane,LightOn,CameraRig}.tsx  useExplode.ts explode.ts bedView.ts
    panels/{ProjectBar,LampTree,Inspector,InspectorSheet,StatusPanel,PrinterDialog,ExamplesDialog,PrintSheetDialog}.tsx
    panels/inspectors/{Project,Printer,Mount,Light,Shade,InnerShade,Hub}Inspector.tsx  ClassicForm.tsx warnings.ts
    forms/SchemaForm.tsx  forms/editSession.ts  forms/fields/{NumberField,SelectField,ToggleField,ColourField,RangeField}.tsx
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

type PartKind = 'hub' | 'shade' | 'tier' | 'spacer' | 'stem' | 'base' | 'baseLid'
  | 'wallPlate' | 'wallArm' | 'canopy' | 'cordGrip'
  | 'fitMale' | 'fitFemale';                  // the joint's fit-test pair (M2.5); tier, spacer: M3
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

**As built (v3, M2.4).** `shades` is `[outer]` or `[outer, inner]` (`ShadesSchema`, a union of two tuples; the inner `ShadeSpec` has `role: 'inner'`, its own colour, default `#ffffff`, wall and revolved style). Purely additive, so `PROJECT_VERSION` stayed 3. Each shade has the flat parameters of the classic shade's shape and surface groups (`SHADE_GROUPS` / `SHADE_DEFS` / `FlatShadeParams` in `schema/defs.ts`; `SHADE_PARAM_PATHS`, `shadeParamPath(role, key)`, `shadeToParams` in project.ts); `classicParamsToProject` keeps an inner shade. `assembly/innerShade.ts` adds one (`defaultInnerShade`: the outer style with bottom and top Ø less `2·radialGap + 2·wall`, the top at least what its ring needs, 10 mm shorter, smooth, white; `withInnerShade` also turns `hub.fused` off) or removes it. An inner shade with the fused print (strap + puck + `fused`) is the error `inner-shade-fused` at `hub.fused`, and only the fused shade is built; other mounts never fuse, so they just split. The inner shade is part `innerShade` (kind `shade`, "Inner shade"), coloured by `colours.innerShade` or its own colour.

**As built (v3, M2.3).** `LightSource` has the `bulb` and `strip` variants with exactly the fields above; adding them was purely additive (every earlier v3 file still parses), so `PROJECT_VERSION` stayed 3. Defaults: E27 on a shade ring (hole Ø40.5, plate 3, skirt Ø50 × 12, bulb Ø60 × 110, heat clearance 15, cable Ø6); `BULB_PRESETS` give E14 hole Ø28.5, skirt Ø38, bulb Ø35 × 100, and `m10Nipple` a Ø10.5 hole for either size; the strip is 10 × 2 mm in a Ø120 ring, channel 3.5 deep, cable 4.5 wide. As for the mounts, each light's parameters are flat keys in the form (`bulbHoleDiameter`, `stripRingDiameter`, …; `LIGHT_GROUPS`, `LIGHT_DEFS`, `LIGHT_PARAM_PATHS`, `LIGHT_DEFAULTS` in `schema/defs.ts`; `lightFromParams`, `lightToParams`, `lightParamPath` in project.ts); the puck keeps the classic shade's `kit` group (`projectToClassicParams` reads the kit puck's values for any other light, and `classicParamsToProject` keeps a non-puck light of its base). `lightDefaults(kind, size, fitting)` makes a light; `withBulbPreset(light, size, fitting)` moves a bulb to another size or fitting and takes the new preset only for the fields still at the old preset's value (so edits survive); `lightForChoice(light, choice)` maps the inspector's Light select (`puck`, `E27`, `E14`, `strip`) onto that. `hub.ventCount` (`DEFAULT_VENTS`: 8 for a bulb, 0 otherwise, applied when the light kind changes) is cut only in bulb hubs. `hub.fused` only fuses the strap with a puck.

**As built (v3, M2.2a).** `Mount` has all four variants with the fields above (`fluting` of the stem is left out for now). Defaults come from the mounts' `ParamDef` groups in `schema/defs.ts` (`MOUNT_GROUPS`, `MOUNT_DEFAULTS`): cord Ø4, drop 600, knot grip, canopy Ø90 × 25 with screws 60 apart; wall plate 80 × 120 × 6 with keyholes 60 apart, a straight arm 250 long rising 20° (when angled or curved), tube Ø24, cable Ø6; table lamp, base Ø180 × 22 with a 14 mm pocket and a snap lid, stem 400 tall in 200 mm segments, Ø28, cable Ø6. Each mount's parameters are flat keys in the form (`canopyDiameter`, `armShape`, …); `MOUNT_PARAM_PATHS` maps them into `project.mount` (`defaultMount`, `mountToParams`, `mountFromParams`, `mountParamPath` in project.ts). `hub.fused` only applies to the velcro strap (the classic builder only has belt loops): every other mount assembles a hub and a shade, whatever `fused` says, so switching back to the strap restores the single print. The 2 → 3 migration only bumps the version (the strap kept its shape). The classic-shade bridge keeps a mount other than the strap (its strap fields read as defaults). `Assembly` also carries `context: MountContext` (`kind: 'ceiling' | 'wall' | 'floor'`, `ceilingZ` / `wallY` / `floorZ`, the pendant's `cord`), and `derived.ceilingZ + ceilingGap` is the ceiling for every ceiling mount (the strap: mount face + 3 mm; the cord: the ceiling itself, gap 0).

**As built (v2, M2.1).** The puck light carries `bossWall` and `pocketExtraDepth` (they describe its pocket; v1 had them on the hub). `hub.wallThickness` defaults to 2 mm (v1 only mirrored the shade wall, so the migration resets it). The 1 → 2 migration also copies `hub.shoulderAngle` into the revolved style, adds the hub's `collarWall` / `radialGap` / `ventCount`, the `joints` defaults and `colours.hub` (`#d9d4cb`), and turns a `classicShade` colour into the `shade` colour; v0 migrates straight to the current version. Still at most one outer shade. The fused shade is part kind `shade` with `params.variant: 'fused'` (the classic flat parameters); the split shade has `variant: 'revolved'`. In a `JointInterface` of a collar joint, `nominalDiameter` is the diameter of the male collar's cylindrical body (the thread root, the surface the bayonet lugs and snap ribs stand on), and the ring's bore is `tolerance` larger in radius. `Assembly` also carries the bed `layout`, and its `derived` holds world-frame numbers for the viewport: `ceilingZ` (the hub's mount face), `ceilingGap`, `bottomZ`, `puckZ` / `puckDiameter` / `puckHeight` and the strap's dimensions.

## 4. Assembly algorithm (`src/core/assembly/`, pure, no WASM)

1. **Normalise** every variant against its `ParamDef[]` (clamp + warning). Hard error: `ceilingStrap` with a non-puck light.
2. **Light envelope** → `{ rCore, insertDepth, cableDiameter, cablePath: 'side' | 'axial', heatZone }`. Puck: `rCore = Ø/2 + clearance + bossWall` (today's `rBoss`). Bulb: `rCore = skirtDiameter/2`, heat zone = bulb envelope + `heatClearance`. Strip: `rCore = ringDiameter/2 + stripWidth + 2·wall` (the hub is a wide disc).
   **As built (M2.3)** (`assembly/lights/{puck,bulb,strip,index}.ts`; `lightEnvelope(light, { wallThickness, collarWall, mount })`): a bulb's `rCore` is `skirtDiameter/2 + 6` (`BULB_AIR_ANNULUS`): with `rCore = skirtDiameter/2` the shade collar's bore (`rCore + 1.5 − collarWall`) would cut 0.5 mm into a skirt that stands on the light face, and the 6 mm annulus between them is the vents' air path. `heatZone` is `{ z0, z1, rMin }` in the hub's own frame (the bulb hangs from the light face, z 0, by `bulbLength`, cap included; a standing lamp's placement turns it over with the hub): the glass at the bulb's far end, `z0 = −bulbLength − heatClearance`, `z1 = −bulbLength + bulbDiameter + heatClearance`, `rMin = bulbDiameter/2 + heatClearance`; pucks and strips have none. The bulb's cable runs along the axis; its `insertDepth` is skirt + plate (+ the nut recess). A strip's `rCore` is the plan's, grown only when a thick collar wall would leave the channel's rim under 1.2 mm; its cable leaves sideways under a strap (over the rim), else along the axis. `normalizeLight` clamps a bulb's or strip's flat parameters (`normalizeLightParams`, warnings at `light.…`) and applies its rules: an M10 nipple's hole at most Ø13 (the nut must not slip through), a skirt wide enough for the shade ring (hole + 2 + 2 walls) or the nut's boss, a channel at least the strip's thickness + 0.5 deep.
3. **Collars**: inner collar nominal `D_in = 2·(rCore + 1.5)`; outer `D_out = D_in + 2·(collarWall + lugDepth + radialGap)`. Each becomes a `JointInterface` of type `joints.shadeToHub` (female = hub, male = shade). A shade whose top is too narrow for its collar is widened with a warning.
   **As built (M2.1, one shade):** the outer shade uses `D = 2·(rCore + 1.5)` (68.2 mm for the kit), or its larger `collarDiameter`. The hub ring's bore is `D/2 + tolerance`, its outer (seat) radius `D/2 + tolerance + depth + collarWall` (depth = lug depth, thread depth, 0 for snap); the shade's top must be at least `2·seat + 2` (78 mm for the default bayonet), so the rule includes the tolerance. Per type: bayonet 3 lugs 6 × 2 × 1.6 mm, travel 35°, tolerance = `joints.tolerance`; snap clearance = `joints.tolerance − 0.1` (0.2 mm by default) with 3 ribs 0.1 mm proud of it (0.3 mm); thread pitch / depth from `joints`, 45° flanks, right hand. All 8 mm long. `resolveShadeJoint` returns non-adjusting warnings (thread Ø < 10, pitch < 4 × nozzle, length < 2 × pitch; bayonet collar wall < 1.6).
   **As built (M2.4, two shades)** (`resolveShadeJoints`): the inner shade takes `D_in = 2·(rCore + 1.5)` (its `collarDiameter` may enlarge it), the outer `D_out = D_in + 2·(collarWall + depth + radialGap)` (or its larger `collarDiameter`), so `radialGap` is the air between the hub's inner ring (outer radius = the inner seat) and the outer ring's bore, and between the inner collar's lugs and the outer collar's bore. `radialGap` is raised (warning at `hub.radialGap`) to `collarWall + tolerance + 2` so the outer collar's bore keeps `MIN_COLLAR_AIR` = 2 mm from the inner ring. Joints `shadeToHub` (outer) and `innerShadeToHub` (inner), same type and settings (their checks are reported once), both in `Assembly.interfaces` and in the hub's params (`joint`/`collar`, `innerJoint`/`innerCollar`). Each shade's top is widened to `2·seat + 2` of its own collar (the outer's rule now uses the larger outer collar: 102 mm for the kit's bayonet). With one shade nothing changes (same collar, same buildKeys). `derived` adds `innerZCollar` and `innerCollarDiameter`.
4. **Mount joint**:
   - `ceilingStrap` → belt-loop tunnels on the hub, no extra parts.
   - `ceilingCord` → hub mount face = cord boss with knot cavity; parts: canopy (+ cord grip for `collet`, canopy↔grip thread Ø16).
   - `wallArm` → hub mount face = male hollow thread stub, female in the arm end boss; arm↔plate screw joint (4×M3, inserts in the plate).
   - `standing` → hub mount face = female thread; stem top male; stem↔stem thread (same Ø); bottom segment flange ↔ base screws (4×M3 inserts in the base).

   **As built (M2.2a) — closed mount faces.** A puck drops into its pocket from the mount face, so every mount face but the strap's (which holds the puck in) needs another way in: under a *closed* face (cord boss, male stub, female bore) the housing carries a 45° **roof** (a dome, inner and outer cone at 45°, `hub.wallThickness` apart, so it prints without support) with the mount's feature on its apex, and the puck is **pressed in from the light face**: the pocket's bore is open all the way down (no ledge; `lightHoleDiameter` / `ledgeThickness` are unused there), three 90° V crush ribs reach `clearance + 0.3` mm into the pocket (45° undersides that also guide the puck), and the puck stops against the roof `clearance` above the pocket wall's top (`zPuck`). The cable slot through the housing gets a 45° gable top. The cord boss's knot cavity (Ø 3.5 × cord, 1.5 × cord tall) opens **down** into the dome under the hole Ø cord + 1, with a 45° ceiling: the cord is fed down through the boss, knotted inside the hub (reached from the light face before the puck goes in), and the lamp's weight pulls the knot up into the cavity. The male stub (wall arm) is a hollow thread, root Ø16 × 12 (`HUB_THREAD_STUB`), on a shoulder `thread crest + 3.5` wide at `zFace`; the female bore (standing lamp) is root Ø20 × 14 deep (`HUB_THREAD_BORE`) in a boss, built by the thread joint's female cutters turned half a turn about x (a rotation, so it stays right-handed), its bottom opening into the dome. Both use `joints.threadPitch` / `threadDepth` (depth ≤ 0.4 × pitch) / `tolerance`; the joint frame's origin is the hub's `zFace` (mouth or shoulder). `HubDerived` adds `zFace` (where the mount meets the hub), `hubHeight` (the top), `zPuck`, `zApex`, `zRoofBase`, `rFeature`, `zFeatureBase`; the strap's hub is unchanged (byte-identical meshes).

   **As built (M2.2a) — the pendant.** Hub at the world origin as every hanging lamp; the cord runs from the hub's top (`cordZ0 = hubHeight`) to the canopy's room side at `hubHeight + dropLength` (`cordZ1`, `canopyZ`); the canopy is printed ceiling-face-down and placed flipped (`flipX`) with its ceiling face at `ceilingZ = canopyZ + canopy.height`. The canopy is a revolved shallow cone (rim 2 mm, flat top Ø ≥ D/2) minus a 45° recess on the ceiling side (the knot sits in its apex above the cord hole), two radial stadium slots 4.5 × 10 with Ø9 head counterbores leaving 4 mm, the cord hole Ø cord + 1; the screw spacing is kept between the collet (or cord hole) and the rim (`ceilingCordMount.normalize`). With `grip: 'collet'` a threaded neck (root Ø16 × 10, `COLLET_THREAD`, three 1.2 mm slits from 2 mm above the canopy) is the male side of the `canopyToGrip` thread joint; the cord grip (female) is a ribbed cap whose 45° cone is parallel to the neck's lead-in, `tolerance` away while its mouth is still 1.5 mm (`CORD_GRIP_TRAVEL`) short of the canopy, so the last 1.5 mm squeeze the slit tip by about 1.1 mm; its thread grooves are clipped under the cone so no flat ceiling remains. The grip is placed at that contact position, turned along the thread (`360 · travel / pitch`) so the helices line up. Print notes recommend PETG for the grip.

#### Mount framework (as built, M2.2a)

`assemble()` is generic: the fused path is the strap's classic print; everything else runs `assembleMounted(kind, mount, …)` against the kind's `MountModule` (`assembly/mounts/types.ts`), registered in `MOUNT_MODULES` (`mounts/index.ts`):

| Step | Signature | What it does |
| --- | --- | --- |
| clamp | `normalizeMountParams(kind, flat)` (schema/normalize.ts) | ranges and options of `MOUNT_DEFS[kind]`, warnings with `mount.…` paths (the strap is clamped with the classic shade instead) |
| `normalize?` | `(mount) → { mount, warnings }` | cross-parameter rules that adjust (e.g. the canopy's screw spacing) |
| `validate` | `(ctx: MountCtx) → Warning[]` | non-adjusting checks (strap + non-puck light → error; thread and cable checks; bed-fit infos) |
| `hubFace` | `(ctx) → HubMountFace` | `strap`, `cordBoss`, `threadMale` or `threadFemale` with its params (a thread face carries its `JointInterface`) |
| `parts` | `(ctx: MountHubCtx) → { parts: PartDraft[]; interfaces: JointInterface[]; warnings? }` | the mount's own parts (not called in fit-test mode) |
| `placement` | `(ctx, parts) → { hubTransform, shadeTransforms, partTransforms, bottomZ, context, derived }` | world transforms, the lamp's lowest point, what it is mounted on, extra numbers for `Assembly.derived` |
| `withPart?` | `(kind, mount) → mount` | for the CLI's `part <kind>` (the cord grip needs `grip: 'collet'`) |

`MountCtx` holds the normalised mount, the light and its envelope, the normalised `joints`, the printer, the colour overrides and the quality; `MountHubCtx` adds the hub's params and `HubDerived` (`zFace`, `hubHeight`, …), the hanging shades (`{ id, zCollar }`) and `fitTest`. A `PartDraft` is a part before `assemble()` gives it its buildKey, hash, transforms and bed placement (`{ id, kind, displayName, params, colour, footprint, printNotes, instances? }`); `mountPartColour(ctx, id, kind)` and `hangingTransforms(ctx)` (hub = world, shades at −`zCollar`) are in `mounts/common.ts`. Mount parts are laid out on the bed with the others.

**As built (M2.2b) — the standing lamp** (`mounts/standing.ts`). The hub's mount face is the female bore (`stemToHub`, root Ø20 × 14). The stem is `n = ceil(totalHeight / segmentLength)` equal segments; every segment carries the same male thread on top (into the next segment or the hub), and every segment but the foot the same female thread at its bottom (`stemToStem`), so the segments above the foot are one part with `instances = n − 1` (`stem`), the foot (`stemFoot`, or `stem` when n = 1) has a flange Ø stem + 20 × 4 instead, screwed to the base with 4 M3 on a bolt circle Ø stem + 11 (`stemToBase`, heat-set inserts or tapping holes in the base, the heads on the flange). The stem's Ø is raised so the threads fit inside it. Segments print female end (or flange) down, a 45° roof over the female bore; the cable bore is Ø cable + 1 throughout. The base is a revolved flat-topped disc with a ≤ 4 mm 45° chamfer, an annular weight pocket open to the floor minus a 14 mm solid spoke carrying the cable groove (≥ 5 × 4, cable + 1) from the central bore (≥ Ø10) out through the rim; it prints top face down. The lid (`baseLid`) is a flat ring in the pocket's mouth with a notch for the spoke: `snap` (3 crush ribs, the press fit's clearance) or `screws` (3 M3 into tapping bosses, `lidToBase`). Placement: base on the floor (z 0), the foot at the base's top, the hub turned over (`flipX`) with its mount face on the stem's top and the shade flaring upward; `context.floorZ = 0`; `derived` adds the base, the stem's ends and segments, `hubZ`, `topZ`. `table` and `floor` differ by their defaults only (`standingDefaults`: floor = Ø280 × 30 base, 1300 mm stem in 220 mm segments, Ø32); bed-fit infos point at the segment length and the base Ø.

**As built (M2.2b) — the wall lamp** (`mounts/wallArm.ts`). The hub's mount face is the male stub (`hubToArm`, root Ø16 × 12) screwed up into the arm's end boss. The wall plate is an extruded rounded rectangle (corner 6, 45° front chamfer) hung on two keyholes on its vertical centre line (`keyholeSpacing` apart; Ø9 head, 4.5 slot, 12 travel, the head channel on the back with a 45° roof), 4 heat-set pockets for the arm's flange (`armToPlate`, 4 M3 on a Ø50 bolt circle) and a through cable slot from the centre past the lower keyhole out of the bottom edge; it prints back face down. The arm is a tube (Ø `tubeDiameter`, cable bore Ø cable + 1) from a Ø60 × 6 flange: `straight` along the wall normal, `angled` rising `riseAngle` (a rotated extrusion), `curved` bending up along a torus sector whose end tangent rises `riseAngle` (≤ 45°); the end boss is vertical in the room with the female thread, a teardrop section toward the wall faired into the tube by a hull; it prints standing on its flange. `normalize` keeps a 3 mm tube wall around the cable bore, the plate wide and tall enough for the flange and both keyholes, and the keyholes clear of the cable hole. Placement: the hub stays at the world origin as every hanging lamp; the wall is the plane y = −(`armLength` + plate thickness) (`context.wallY`), the arm's flange on the plate, its boss's bottom face on the hub's mount face; both mount parts print with their wall side on the bed and the room's up along +y, so they share one rotation ((x, y, z) → (−x, z, y)).
5. **Stem segments**: `n = ceil(totalHeight / segmentLength)`, equal lengths; all non-flange segments share one `buildKey` (`instances = n − 1`).
6. **Transforms** (world z up): hanging mounts → hub print frame = world (light face at z 0 facing −z), shades translated by −H so their collar plane is z 0, canopy at `hubHeight + dropLength`. **As built:** the shade's translation is −`zCollar` (the height of its seat in its print frame); the fused shade keeps identity transforms. The viewport lifts the scene by −`derived.bottomZ` so the lamp's lowest point stands on the grid. Standing → hub rotated 180° about X and lifted to the stem top; shades flipped likewise. Wall → wall plane y 0, arm along +y, hub below the arm end.
7. **Layout**: greedy shelf packing of footprints (10 mm gap, rotate 90° when that fits a shelf better) → `printTransform`; parts that overflow the bed get a warning and are still exported.
8. **Validate** (§8) and return. Interfaces flow one way (light → hub core → collars → shades; mount → hub mount face → mount parts), so there is no iteration.

**As built (M2.5) — fit-test mode.** `project.fitTest` with the fused print keeps the classic housing ring (part `shade`, "Fit-test ring"). Every split lamp resolves its light, mount face, collars and joints as usual (with all their warnings), then `assembleFitPair` returns the shade joint's **test pair** instead of the lamp's parts: `fitMale` ("Collar test piece", the shade's colour) and `fitFemale` ("Ring test piece", the hub's colour), both with the same `FitPieceParams` (`collar` and `joint` of the outer shade, `height` `FIT_SECTION` = 15, `base` `FIT_BASE` = 3, `baseRadius` = seat radius + `FIT_GRIP` 3). The joint in their params and in `Assembly.interfaces.shadeToHub` is the real `shadeToHub` with `male` / `female` relabelled to the pieces (with an inner shade it is the outer joint, moved out by the radial gap). Assembled as the shade hangs from the hub: the ring piece at identity, the collar piece at z −3, `bottomZ` −3, context `floor` at −3; the mount's `parts` and `placement` are not called (`MountHubCtx.fitTest` is gone). Print notes: print both, join them as the shade joins the hub (per joint type), raise or lower `joints.tolerance` (Hub & joints) and print again. The CLI's `part fitMale` / `part fitFemale` turn fit-test mode on. Tests: `tests/unit/core/fitPair.test.ts` (for bayonet, snap and thread: both pieces `NoError` and leak-free at normal quality, assembled intersection < 1 mm³ (< 1e-3 for bayonet and thread), the ring's bore minus the collar = tolerance ± 0.005 mm sliced halfway up the joint, 18 mm tall (≤ 40), overhangs ≤ 45° outside the thread facets).

## 5. Part builders (`src/core/geometry/parts/`)

Every builder is `build(k: Kernel, params, q: Quality) → { manifold, stats: { status, maxOverhangDeg, volumeMm3, bbox, triangles, notes } }` and runs inside `scoped()`.

**As built (M2.3) — the hub around a bulb or a strip** (`parts/hub.ts`, `parts/lightInserts.ts`; every hub still prints light face down, collar ring on the bed). A **bulb** hub's housing is the lampholder's skirt (Ø `skirtDiameter`, the hub's wall thick): the shoulder cone climbs from the ring all the way in to it, and it stands on the light face inside the shade collar's bore with the air annulus around it. The plate (`plateThickness`, the lampholder's hole) sits on the skirt at `skirtHeight`; under it the skirt's inside rises at 45° to the hole (from the bed when the hole is small), so neither the plate nor the skirt needs support (the lampholder's ring or cap seats on that 45° edge). Above the plate a chamber (the skirt's inside) reaches up to the housing's top under the mount face (the closed faces' 45° dome, or open under the strap); an `m10Nipple` plate carries a boss with a hexagonal recess Ø19 across corners × 4 for an M10 nut (16 mm across flats; the print notes give the height to pause the print at and drop it in). `vents` (= `hub.ventCount`) vertical Ø6 cylinders on the circle midway between the skirt and the ring's bore cut through the shoulder's shell above the annulus (vertical walls: no overhang; halfway up the shoulder they split its shell into one arc per vent). A **strip** hub is a wide disc inside the collar's bore (0.5 mm clear of it): thick (`channelDepth` + wall) over the ring channel (`stripWidth + 0.4` wide, `channelDepth` deep, from `ringDiameter/2` outward, opening on the light face), one wall thick inside it; its rim rises to a flange over the collar's slot to the ring; a boss in the middle carries the mount face, with a pocket (≥ R8, the knot's room for a cord) open to the light face. The strip's cable leaves the channel through a slot in its ceiling on +X, runs over the disc and into the boss through a side opening with a 45° gable (closed faces). **Deviation:** the strip hub prints light face down like every other hub (not mount face down): the channel's ceiling and the collar slot are short bridges (10.4 and ≈ 2.8 mm by default; an info above 11 mm), every other surface is ≤ 45°. `HubDerived` adds `zPlate`, `rSkirt`, `rSkirtInner`, `rVent`, `ventCount` (bulb) and `rDisc`, `discThickness`, `innerThickness`, `rChannelInner`, `rChannelOuter`, `zChannel`, `zRimTop` (strip); `zPuck` is the light's underside (a bulb's tip at −`bulbLength`), and every insert has a `height` (the puck's thickness, the bulb's length, the strip's thickness). The puck's hubs are unchanged (byte-identical).

**As built (M2.4) — two collar rings.** With an inner shade the hub's profile gains the inner ring: the annulus from the inner ring's bore to the inner seat radius, intersected with the hub's outer envelope (so it rises from the light face until it meets the shoulder cone, or a strip hub's flange), unioned after the cavity is cut; the cavity between the two rings stays open to the light face (the outer shade's collar stands in it). The outer ring, the cone (`kOuter` from the outer seat), the vents, the inserts and the mount faces are as before; a bulb's vents sit midway between the skirt and the inner ring's bore, a strip's disc inside the inner collar's bore. Each ring gets its joint's female cutters; a thread's cutters (cam and countersink are solids from the axis) are trimmed to an annulus 1.5 mm inside their ring's bore, so they cut only their ring (this also fixes the M2.3 bulb and strip hubs with a thread joint, whose skirt or disc the cutter removed). A strip hub's flat flange bridges the radial gap between its rings (an info above 11 mm). The hub still prints light face down; `HubDerived` adds `innerCollarInnerRadius` / `innerRingOuterRadius`. The inner shade is an ordinary revolved shade on the inner collar; both shades hang with their collar plane at the hub's z 0 (the standing lamp turns both over with the hub). Tests: `tests/unit/core/innerShade.test.ts`, `tests/e2e/shade.spec.ts`.

**As built (M2.1).** The hub's and the revolved shade's profiles are built as `CrossSection` booleans (outer envelope minus the cavity) and then revolved, which removes the special cases of hand-intersected polylines. The puck cutters live in `parts/lightInserts.ts` and the belt loops in `parts/mountFaces.ts`; both are shared with the fused classic builder (same arithmetic and creation order, so its meshes stay byte-identical). The hub's ring is 8 mm tall with 0.5 mm headroom above the shade collar; the mount face's features are trimmed by the hub's whole cavity, and a strap mount keeps the housing at least `loopLength + strapThickness + loopWall + 1` above the point where the cone meets it (the ledge grows thicker on short hubs), so the tunnels always open above the cone. Its `ventCount` is cut only in bulb hubs (M2.3). The revolved shade's shoulder cone ends at the seat radius (the hub ring's outer radius) in a short vertical **neck** whose top is a flat **seat** the hub ring stands on, flush on the outside; the solid crown under the seat has a 45° underside down from just inside the shell, so it prints without support, and its height is chosen so the crown is 1 mm thick at the collar bore. `collar.ts` then stands the collar tube (`collarWall` thick) on the seat and unions the joint's male side.

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

**As built:** the lug is the hull of its 8 corners (6 when its outer face vanishes), centred in the 8 mm joint. Its 45° underside is also its bearing face (the shade hangs on it), so the groove is the revolve of a profile whose floor is that line offset by the tolerance (full contact, not a line on a flat floor) and whose ceiling rises 45° outward (no flat overhang in the hub printed ring-down); the groove reaches out to the lug's corners plus the tolerance and spans `travel` plus the lug's angular width. Locking turns the shade by +travel about z (clockwise seen from below). The whole collar tube is `hub.collarWall` thick (2 mm by default), not just locally.

**Snap / press**: collar radius = ring inner radius − 0.2 with 3 crush ribs 0.3 mm proud. **Screws**: M3 through Ø3.4, counterbore Ø6 × 3, heat-set pocket Ø4.0 × 6.0; one `screwPattern(iface)` yields the cutters for either side.

**As built:** the ribs are thin boxes turned 45° about their long axis (V ribs, so only the tip crushes: about 0.2 mm³ of overlap with the ring in total), 6 mm long; the clearance follows `joints.tolerance − 0.1`. `screwPattern(k, iface, side, { z, face, segs })` places `count` screws on the bolt circle `nominalDiameter`; without heat-set inserts the female side gets Ø2.5 tapping holes. `screwJoint()` in `interfaces.ts` makes the interface for the mounts of M2.2.

**Threads, as built:** right hand = **positive** `twistDegrees` (manifold turns the top counter-clockwise seen from +z), settled by `tests/unit/core/thread.test.ts`. 96 / 128 / 192 cam vertices and 15° / 10° / 6° of twist per division (draft / normal / fine); the cam's vertices include the tooth corners. The male thread ring and the female cutter are extruded with aligned divisions (the cutter two divisions longer at each end, pre-rotated to the same phase), so both sides match vertex for vertex and the clearance stays `tolerance` even where the twisted facets sag. The collar tube and the ring's bore sit 0.3 mm inside the thread root (the teeth form the mating surfaces, no nearly coincident faces). Lead-in: the male ring is intersected with a 45° frustum that meets the root at the top; the female mouth has a 45° countersink. The default tolerance is `joints.tolerance` (0.3 mm), not 0.25.

**Fused single piece** (`hub.fused`; only revolved outer shade + puck + strap/cord, no inner shade): union hub and shade in the shade's print frame (hub translated up by the shade height), with the collar joint replaced by a solid ring. This reproduces today's one-print output. **As built:** the fused part is built by the classic shade's builder (`parts/classicShade.ts`) unchanged rather than by a union of the hub and the shade, so the default project and every example keep their exact meshes (the STL header now names the part "Shade (fused)").

**Fit-test pair, as built (M2.5)** (`parts/fitPair.ts`). `buildFitMale`: one revolved profile, the base disc (an annulus from the collar's bore to `baseRadius`, 3 mm) and the collar tube (`radius − bodyInset` out, `radius − collarWall` bore) up to 3 + 15 mm, unioned with the joint builder's `male(...)` on the collar plane z 3 … 3 + `length`, exactly where the shade has it above its seat; prints base down. `buildFitFemale`: one revolved profile, the hub ring (bore `ringInnerRadius − bodyInset`, outer `seatRadius`) 18 mm tall whose bottom 3 mm widen to `baseRadius` (the ring base), minus the joint's `femaleCutters(...)` at the mouth z 0 … `length`; prints mouth down as the hub does. Both use `QUALITY[q].segments` (aligned facets, so the clearance holds on the mesh) and report 45° overhangs.

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

**As built (M2.4):** `validateInnerShade` (validate.ts) samples both revolved profiles every 0.5 mm in the hub frame (`revolvedShadeRadii`: the outer surface with the pattern's crests, the inner surface with its troughs, the cones, the crown, the collar's bore): `shade-clearance` (warning) when the inner shade's outside comes within 2 mm of the outer shade's inside, `heat-zone` (warning) when the inner shade's inside reaches into a bulb's heat zone (converted from the hub frame to the shade's), `inner-shade-longer` (info) when it hangs out below the outer shade, `bridge` (info) for a strip hub's long flange between the rings. The rib allowance is half the rib depth on each shade (the warp moves the surface by ±depth/2), not the full depth. Bed fit covers every part, the inner shade included.

**As built (M2.3):** `ceilingStrapMount.validate` now sees bulbs and strips (strap + non-puck → error at `mount.kind`; the lamp is then split, never fused). `validateLight` (assembly/lights) adds, for a bulb: an info at `light.kind` (LED bulbs only, PETG for the hub, mains wiring by a qualified person), an info when `heatClearance` < 10, a warning when the heat zone reaches into the hub (`heatZone.z1 > 0`: the hub stands on its light face at z 0), and, for bulbs and strips, a warning when the light's cable is wider than the hole through the mount face (the cord hole Ø cord + 1, the stub's or bore's cable bore; on a pendant the cord is the cable) or than an M10 nipple's Ø7 bore; for a strip an info when the channel's ceiling bridges more than 11 mm. Tests: `tests/unit/core/lights.test.ts` (presets and paths, envelopes, every bulb fitting and size and the strip on the cord, standing and wall-arm mounts `NoError` and leak-free at draft and normal, the plate hole, the skirt, the Ø19 hexagonal nut recess, the channel `stripWidth + 0.4` wide at `ringDiameter`, the cable slots, the vents (`ventCount + 1` pieces halfway up the shoulder), overhangs ≤ 45° on the mesh outside the joint ring, the threads' twisted facets and the strip's bridges, the checks, the world-frame numbers), `tests/unit/app/lightStore.test.ts` (the Light select and the presets in the store), `tests/e2e/light.spec.ts`.

**As built (M2.2a):** mount parameters are clamped by `normalizeMountParams` and the mount's own `normalize`; `ceilingStrapMount.validate` holds the strap + non-puck error (paramPath `mount.kind`); `mountThreadJoint` (interfaces.ts) gives the mounts' threads the same pitch / two-turn warnings as the shade joint. Tests: `tests/unit/core/hubFaces.test.ts` (every hub face `NoError` and leak-free at draft and normal, the pocket open below, the crush ribs, the stub's and the bore's diameters), `ceilingCord.test.ts` (snapshots of the knot and collet pendants, placement, every part `NoError` and leak-free, canopy and grip overhangs ≤ 45° measured on the mesh outside the twisted thread facets, the collet ↔ grip intersection < 1 mm³, the cord hole through the boss).

**As built (M2.1):** layer 2 clamps the hub & joint parameters (`normalizeHubJoint`: ranges, thread depth ≤ 0.4 × pitch) and widens the shade top; `resolveShadeJoint` emits the thread / bayonet warnings listed in §4.3. The joint tests (`tests/unit/core/parts.test.ts`) build the default split lamp per joint type and check `NoError`, an assembled intersection volume of 0 (bayonet, thread) or < 1 mm³ (snap, the crush ribs), the ring bore minus the collar radius = tolerance (± 0.005 mm, sliced halfway up the collar) and zero leaks.

## 9. Worker protocol (`src/worker/protocol.ts`, hand-rolled and typed, no comlink)

```ts
type ToWorker =
  | { t: 'init' }
  | { t: 'build'; gen: number; parts: PartSpec[] }   // quality is baked into each part's params by assemble()
  | { t: 'export'; jobId: string; parts: PartSpec[]; format: 'stl' | 'zip-stl' | '3mf';
      layout: Layout; printer: PrinterSpec; meta: { name: string; shareUrl?: string } }
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
- The build loop yields to the event loop and checks `gen !== latestGen` before each part (cooperative cancel); a throwing builder yields `part-error` for that part only and the loop continues. One `PartCache` (3 M triangles) lives as long as the worker.
- Normals: `calculateNormals(0, 180)` (smooth, a few ms) then `getMesh(0)`; sharp-edge angles below 180° cost 40–1000 ms per mesh on ribbed shades. `part.warnings` carries the post-build checks (`validateGeometry`); the assembly's own warnings stay on the main thread.
- Export builds at export quality (the cache makes unchanged parts free), applies `printTransform` + layout offset, writes STL / 3MF / ZIP inside the worker and transfers the buffers.
- `workerClient.ts` exposes `ready`, `build()` (returns the generation; stale `part` / `part-error` / `build-done` are dropped), `export()` with `onProgress` and an abort `signal`, `onPart()`, `onPartError()`, `onBuildDone()`, `onError()` and `dispose()`. `useBuildPipeline` subscribes to `project` + preview quality, debounces 120 ms, runs `assemble()`, diffs part hashes against `buildStore`, bumps `gen` and posts `build`.

## 10. App (React 19, `src/app/`)

**Stores (zustand 5)** — three, not one:

- `projectStore`: `{ project, dirty, loads, replaceProject, setParam-style actions (setClassicParam, setHubParam, setMountParam, setLightParam, setShadeParam), setPrinter, setQuality, setFitTest, setFused, setMount, setLight, addInnerShade / removeInnerShade, setShadeColour, … }`, wrapped in `immer` + `zundo` `temporal` (`partialize`: project only, `limit 100`, equality on `project.revision`, `handleSet` throttled 300 ms). Slider drags pause the history on the first transient value and resume + commit on release, so one drag = one undo step.
- `uiStore` (not undoable, not saved): `selection` (the lamp-tree **node**, see below; `project` by default), `selectedPart` (the part picked with it: outlined, its details in the status strip), `hover`, `explode` 0..1, `section` + axis, `ghosts`, `mounted`, `viewMode: 'assembled' | 'bed'`, `previewQuality` (draft while dragging), `panels` (`tree` expanded, `inspector` sheet open; `null` = the layout's default), `fitRequest`, `notice`. Actions `select(node, part?)`, `selectPart(part)` (its node + the part), `clearSelection()` (back to `project`), `toggleViewMode()`.
- `buildStore`: per part `{ status: queued|building|ready|error|stale, revision, hash, readyHash, built (the spec the shown mesh came from), stats, warnings, error, buildMs, cached }`, the dispatched assembly's warnings / derived / context, `shownDerived` / `shownContext` (of the latest finished build), export progress. `THREE.BufferGeometry` objects live outside React in `geometryRegistry` (Map by part id), created in the worker-client message handler.
- `selectors.ts`: `useAssembly()` memoises `assemble(project, { quality })` so the tree, the viewport, the status strip and the export share one `PartSpec[]`; `useSelectedPart`, `useShownNode`, `useBedFit`, `useTotals`.
- `nodes.ts` (pure): `NODE_IDS` = `project`, `printer`, `mount`, `light`, `outerShade`, `innerShade`, `hub` with `NODE_LABELS`; `nodeOfPart(part)` (hub and the fit-test pieces → `hub`, the shades → their node, every other part → `mount`), `mainPartOf(node, parts)` (the hub, the outer or the inner shade), `structuralParts(parts)` (everything but the hub and the shades), `shownNode` (the inner-shade node falls back to the outer shade when there is none).

**Layout and components** (`App.tsx`, `App.module.css`, `useLayout.ts`). **As built (M2.5):** a CSS grid `bar / tree | viewport | inspector / status` with the columns 260 px · 1fr · 360 px and the status strip under the viewport only (a fixed `min(30vh, 220px)` row, so the canvas never resizes while the status changes; the tree and the inspector run the full height and scroll). `useLayout()` (matchMedia, `useSyncExternalStore`) reports `wide` (≥ 1100 px), `medium` (760–1099 px: the tree is a 52 px rail of icons, » expands it to 240 px; the inspector is `InspectorSheet`, a non-modal Radix Dialog over the viewport's right edge, opened by picking a node or the _Edit …_ button, closed by ✕ or Escape) or `narrow` (< 760 px: bar / tree (a row of icons, expandable) / viewport 50 vh / status / inspector stacked; picking a node scrolls to the inspector). Radix primitives (`radix-ui` umbrella: Slider, Select, Dialog, DropdownMenu, Switch, Tooltip) + CSS Modules with the dark tokens. Panels:

- `ProjectBar`: name, printer chip, undo/redo, Open ▾ (recents) / Save / Share, Examples, Export ▾ (STL, ZIP, print sheet).
- `LampTree`: one button per node, **Project** (its name), **Printer** (name and bed), **Mount** (`MOUNT_LABELS`), **Light** (`LIGHT_CHOICE_LABELS`), **Outer shade**, **Inner shade** or an _Add inner shade_ row (adds one and selects it), **Hub & joints** (the joint type, or "fused into the shade"), then a group with one row per `structuralParts` entry ("Mount parts", or "Fit-test pieces"). Rows that stand for a part show its colour swatch and its bed-fit mark (from the `bed-fit` warnings). Picking a node selects it with its main part; picking a part row calls `selectPart`. The selected node and the picked part's row are `aria-current`; test ids `tree-<node>`, `tree-part-<id>`, `tree-fit-<id>`, `tree-add-inner`.
- `Inspector`: a heading and the selected node's inspector only (keyed by node), each reusing the `SchemaForm` groups and store actions of the former single inspector unchanged (same element ids): `ProjectInspector` (Reset, Output: preview / export quality and _Fit test only (joint test pair)_, View: bed view, explode, section + axis, ghosts, mounted), `PrinterInspector` (build volume, nozzle, colours, _Choose printer…_, the plate's fit, a bed-view switch), `MountInspector` (Mount select + `MOUNT_GROUPS`), `LightInspector` (Light select + `LIGHT_GROUPS`), `ShadeInspector` (`SHADE_GROUPS` + colour), `InnerShadeInspector` (colour, _Remove inner shade_, its groups under `p-inner-` ids), `HubInspector` (fused toggle or hint + `HUB_JOINT_GROUPS`). `SchemaForm` renders `ParamDef[]` (number → Radix Slider + number input; select; boolean; colour with swatches); `visibleWhen` hides rows; clamp warnings from core show inline. `RangeField` is the view options' 0–1 slider (the explode factor, no undo).
- `StatusPanel` (the status strip): status line ("Loading kernel…", "Building…", "Ready · …"), notices, the bed-fit badge, the part table (one row per part with footprint, grams, triangles, overhang, bed fit and the totals; a row click picks that part, a second click goes back to the project), the picked part's details, every warning.
- `PrinterDialog`, `ExamplesDialog`, `PrintSheetDialog`.

**Viewport (react-three-fiber 9 + drei 10)**:

- `THREE.Object3D.DEFAULT_UP.set(0, 0, 1)` at module scope; `<Canvas frameloop="demand" dpr={[1, 2]} flat gl={{ antialias: true, localClippingEnabled: true }} camera={{ up: [0, 0, 1], position: [260, -300, 220], fov: 40, near: 1, far: 4000 }}>`.
- One `<PartMesh>` per `PartSpec`: one mesh per copy (`instanceTransforms`, e.g. the stacked stem segments, all sharing the part's geometry and material), placed by the transforms of the spec its geometry was built from (`buildStore.parts[id].built`, so nothing moves ahead of a rebuild) inside a group lifted by −`bottomZ`. The geometry is re-read from the registry when the part's `revision` changes; the old mesh stays while rebuilding. Materials are cached per colour.
- **Selection**: a click on any copy calls `selectPart(part)` (the part's node, the part outlined with drei `<Outlines>` on every copy); `onPointerMissed` → `clearSelection()` (the project node). Clicks that moved more than 4 px are orbit drags.
- **Exploded view** (`explode.ts`, `useExplode.ts`): `explodeOffsets(items, factor)` ranks the parts by the z of the centre of their built bounding box (print frame, `buildStore` stats) through every copy's transform, and moves each part with all its copies by `factor · 60 mm · (rank − median rank)` along z (`EXPLODE_STEP`); the matrices get the offset in their translation (`useMatrices(transforms, offsetZ)`). The ghosts follow their part (the light and the strap the hub or the fused shade, the cord the hub at its lower and the canopy at its upper end); selection and outlines are unaffected; the camera does not refit.
- **Bed view** (`bedView.ts`, `viewMode: 'bed'`, the View switch, the Printer node's switch or **B**): `bedScene(parts, printer.bed, bboxOf)` packs the parts with core's `packParts` (the same packing as `Assembly.layout`, plus which copies did not fit) and places every copy in its print orientation (print frame, bed = z 0), centred on its placement by its built bounding box, turned 90° when the layout turns it, the bed's centre at the world origin; copies that do not fit go beside the bed (+x, front to back) and are drawn red (`overflowMaterial`). `BedPlate` (the printer's bed with a 10 mm grid, inside `<Bounds>` so a refit frames the whole bed) and `BedVolume` (the height limit as a wire box) replace the context planes; no ghosts, no explode (the slider is disabled), no lift. Switching back restores the assembled scene.
- Section view = one shared `THREE.Plane` always in `clippingPlanes`, with `constant = 1e6` when off (avoids shader recompiles).
- `<ContextPlanes>` per mount in the mounted view (a ceiling plane at `ceilingZ`, a vertical wall plane at `wallY`, a floor grid at `floorZ`, from `Assembly.context` of the finished build), the 256 mm bed grid otherwise; `<Ghosts>` for the puck / bulb / strip / strap / cord (translucent), from `Assembly.derived` of the finished build (`lightDerived`: `puckZ`…, `bulbZ`…, `stripZ`…).
- `<CameraRig>` = `OrbitControls` + drei `<Bounds>`, refit only on a project load (the startup project included: its first build may finish before the canvas mounts), after a `requestFit(true)` (mount, light, fused, inner shade, fit-test changes), on "F", when the shown mount context changes, and right away when the view mode changes (the bed from the front and above, the lamp from the room side of its context; in the bed view every fit takes the bed's view). The camera glides over 1 s, or jumps when `prefers-reduced-motion: reduce` (the e2e tests ask for it).
- `<LightOn>` (transmission material, synthetic environment, low-end fallback) is M4.

Earlier as-built notes: **(M2.1)** the ghosts and context planes read `Assembly.derived` of the latest *finished* build, and each mesh is placed by the transform of the spec its geometry was built from. **(M2.2a)** the Mount select (`MOUNT_LABELS`) and its groups (`MOUNT_GROUPS`, `setMountParam` by flat key); switching keeps the light, the shade, the hub and the joints, one undo step; the fused toggle only for the strap; select labels from `SelectParamDef.optionLabels`. **(M2.3)** the Light select (`#p-light`, `LIGHT_CHOICES`) and its groups (`setLightParam`, `setLight`; a new bulb size or fitting presets the untouched diameters, `withBulbPreset`); the vents only for bulbs (`visibleWhen` on `lightKind`); the bulb and strip ghosts. **(M2.4)** the inner shade's add / remove, colour and groups. **(M2.5)** everything above: three columns, the lamp tree, one inspector per node, click-to-select by node, the exploded and the bed view, the status strip, the fit-test pair's switch; tests `tests/unit/app/viewLogic.test.ts` (node mapping, the selection, the explode ranking, the bed placements) and `tests/e2e/tree.spec.ts`.

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

**As built (M2.5, exports).** `zipFiles(entries, level = 0)` (export/zip.ts) wraps fflate `zipSync`; the worker's `zip-stl` format writes the `stl` export's per-part STLs (an instanced part once) stored, plus the main thread's `meta.extraFiles` deflated, as `openlamp-<slug>.zip` with a `progress` per part (`3mf`: not implemented yet). The print sheet is rendered on the main thread, where the grams and triangles live (`buildStore`, the preview build): `renderPrintSheet({ project, assembly, printer, stats?, shareUrl?, date?, statsQuality? })` (export/printSheet.ts) is deterministic, escapes project text, and derives the items to buy (`nonPrintedItems`, incl. M3 screws and heat-set inserts from the screw joints and the base's weight from its pocket), the per-mount steps (`assemblySteps`) and the tips (`printingNotes`). It is `print-sheet.md` in the ZIP and Export → Print sheet… (`PrintSheetDialog`: `marked` with raw HTML shown as text, http(s) links only; Print = `window.print()` with `@media print` hiding everything but the sheet; Download .md).

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
- **Playwright** (`playwright.config.ts`): chromium only, `launchOptions.args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']` (fallback `channel: 'chromium'`), `webServer: vite preview --port 4173` so tests hit the real `/openlamp/` base (`baseURL http://localhost:4173/openlamp/`, `page.goto('./')`), 2 workers in CI, `trace: retain-on-failure`. Smoke tests at draft quality: app loads with no console errors or failed requests (catches base-path regressions); change a param → status busy → Ready and the footprint changes; switch example; edit → hash changes → reload persists; download STL (header + `84 + 50·n` size check), ZIP and 3MF (`PK\x03\x04` magic); import a fixture via `setInputFiles`. Budget ≤ 3 min. **As built (M2.5):** software rendering dominates the suite's cost (each WebGL frame of a 100k-triangle lamp costs SwiftShader most of a CPU-second), so most spec files run serially on one shared page (`test.describe.configure({ mode: 'serial' })` + `sharedPage()` in `beforeAll`: the kernel loads once per file), open their lamps through the running app's share hash (`showProject`: sets `#p=…`, waits until the app has rewritten it and the build is Ready) at draft quality wherever no triangle count is asserted, the camera jumps instead of gliding (`reducedMotion: 'reduce'`) and the page is composited in software (`--disable-gpu-compositing`; only the canvas goes through SwiftShader). 29 tests; locally (`--workers=2`) 22.6 s → 16.8 s wall and about 293 → 134 CPU-seconds against the 21 tests before.
- **CI / Pages** (`.github/workflows/ci.yml`, one workflow). M0 ships only build + deploy; the target is:
  - job `check` on push + PR: `actions/checkout@v7`, `actions/setup-node@v7` (node 24, npm cache; bump to 26 once it is Active LTS on 2026-10-28), `npm ci`, typecheck, lint + format check, `npm test`, `npm run samples` (watertightness gate; upload `samples/` with `actions/upload-artifact@v7`, 14 days), `npm run build`, cached `playwright install --with-deps --only-shell chromium`, `playwright test`, upload `playwright-report` on failure, `actions/upload-pages-artifact@v5` on main;
  - job `deploy` (needs `check`, main pushes only, `permissions: pages: write, id-token: write`, `environment: github-pages`, `concurrency: pages`) runs `actions/deploy-pages@v5`.
  - No `.nojekyll` is needed (Actions deploys skip Jekyll); Pages serves `.wasm` with the right MIME type and module workers are same-origin.
- **CLI** (`cli/openlamp.ts`, `#!/usr/bin/env node`, `node:util parseArgs`, no deps): `part <kind> [--param v…] -o out.stl`, `project <file.lamp.json> --out dir/ [--zip] [--3mf]`, `samples` (all `src/examples/*.lamp.json` → `samples/`, exit 1 on any non-`NoError`), `list`. npm scripts: `generate`, `samples`. Sample STLs are generated, never committed. **As built (M2.2a):** `list` prints the part kinds, printers, examples, the classic-shade and hub parameters and every mount with its parts and its parameters by project path; `part <kind>` builds a mount's own part with that mount's defaults (`part canopy`, `part cordGrip`), `--mount <kind>` picks the mount for any part (`part hub --mount wallArm`). **As built (M2.3):** `list` also prints the lights (the bulb's and the strip's parameters by project path); a bulb or strip lamp is built from a project file (`project`, `samples`).

## 15. Reuse map

| Today (`src/`) | New home | Change |
| --- | --- | --- |
| `geometry.ts` `derive` | `assembly/lights/puck.ts` (puck envelope) + `parts/hub.ts` / `parts/shades/revolved.ts` (cone maths) | hub core replaces `rBoss` |
| `wallRadius`, `wallProfiles` | `geometry/profile.ts` `sampleProfile(rFn, zSamples)` + `offsetProfile` | explicit z samples (pleat bands); returns overhang |
| `buildProfile` | `parts/shades/revolved.ts` | ends at the collar annulus; flat-shade fallback kept |
| `makeWarp`, `smoothstep` | `geometry/surface.ts` `radialWarp({ style, n, depth, twist, zRange, fade })` | z-range so stems/threads stay untouched |
| `circularSegments`, `QUALITY` | `geometry/quality.ts` | per-part budgets |
| `beltLoop` | `parts/mountFaces.ts` (strap mount face, shared with the fused builder) | takes housing dims |
| `buildShade` | M1: `classicShade` builder as-is; M2: the `shade` part of a fused lamp (`parts/classicShade.ts`, unchanged), split lamps get `parts/hub.ts` + `parts/shades/revolved.ts` | puck cutters → `parts/lightInserts.ts` |
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

1. **Light envelopes + hub** (`assembly/interfaces.ts`, `parts/hub.ts`, `parts/lightInserts.ts`, puck first), `parts/shades/collar.ts`, joints `bayonet.ts` / `snap.ts` / `thread.ts` (+ handedness test) / `screw.ts`; replace `classicShade` by `hub` + revolved `shade`; `hub.fused` reproduces the one-piece print. Schema v2 + migration; "Reflector classic" example. **Landed**, without the extra example (the seven examples were re-saved as v2, all still fused); the app gained the minimal two-part UI (fused toggle and joint fields, per-part status rows).
2. **Mounts**: `ceilingStrap` (tunnels on the hub), `ceilingCord` (`canopy.ts`, `cordGrip.ts`), `standing` (`stem.ts` with threads and cable bore, `base.ts`, `baseLid.ts`), `wallArm` (`wallPlate.ts`, `wallArm.ts`). Assembled transforms and context planes per mount. **Landed**: 2a (schema v3, the mount framework, the four hub faces, the pendant on a cord and its example "Pendant on a cord", the Mount select, context planes per mount) and 2b (the standing lamp and the wall lamp with their parts, see §4, and the "Table lamp" and "Wall lamp" examples).
3. **Lights**: E27/E14 inserts (shadeRing / m10Nipple), strip channel; heat-zone validation; print-sheet BOM items. **Landed** (still schema v3), with the "E27 pendant" and "Strip ring drum" examples and the Light select; the print-sheet BOM items come with the print sheet (M2.5).
4. **Inner shade**: second collar, `radialGap`, inner-shade validation; per-part colours. **Landed** (still schema v3), with the "Two-tone bell" example (see §3, §4, §5).
5. **App**: `LampTree`, per-node inspectors, click-to-select, exploded view, bed view, ZIP export, print sheet (Markdown dialog), fit-test export (a thread/bayonet test pair replaces today's `fitTest` ring). **Landed** in two parts: the exports (ZIP, print sheet; §12) and the UI (§10: three columns, the lamp tree, one inspector per node, the exploded and bed views; the fit-test pair, §4 and §5, for every joint type; the fused print keeps its ring).
6. **Tests**: `assemble()` golden snapshots per mount, joint intersection ≈ 0, leak counter, one example per mount + light. Playwright: switch mount, export ZIP. **Landed** with the steps above (snapshots per mount, joint and fit-pair intersections, leak counters, every example built in `examples.test.ts` and `npm run samples`; Playwright covers mounts, lights, the inner shade, the standing lamp, exports, the tree, the views and the fit-test pair).

**M2 has landed.**

### M3 — Shade style families

`tiered.ts` (+ `spacer.ts`, per-tier flip analysis), `slatted.ts`, `geometric.ts` (polyhedral, pleated, lattice with the hole cap). `ParamDef[]` + inspector sections per family, validations (§8), one example per family, builder tests. Schema bump if fields change.

### M4 — Export and rendering polish

Generic 3MF writer + bed layout (with the viewport bed view synced to it), `LightOn` mode with the transmission material and the low-end fallback, `PrintSheetDialog` printing, Playwright 3MF test, then the `bambu` / `prusa` 3MF flavours behind the `slicerFlavour` option once upstream colour handling is fixed.
