# openlamp

**openlamp** is a parametric, 3D-printable lamp generator that runs in the browser. Today it
designs a ceiling lamp for the **Bambu Lab LED Lamp Kit-001**, hung from the ceiling with a
velcro (hook-and-loop) strap: either one single-piece shade (the default) or a two-part lamp, a
hub that holds the puck and a shade that hangs from it on a bayonet, press fit or printed
thread. You shape it with sliders, watch a live 3D preview, check that every part fits your
printer's bed and download watertight STLs. The same core also runs from the command line.

Try it at **https://jahoefne.github.io/openlamp/**.

openlamp is growing into a generator for complete lamps: pluggable light sources (LED pucks,
E27/E14 bulbs, LED strips), several mounts (ceiling cord, wall arm, standing base), inner and
outer shades in different styles and multi-part, slicer-ready exports. The target design and
the roadmap are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173/openlamp/
```

Requires Node.js 24 (the version CI uses).

## Using the app

The Atelier workspace opens on **Outer shade** editing, with a compact **component rail**
on the left, a warm studio **3D preview** in the middle and the selected component's
**inspector** on the right. Use **»** to expand the rail and see component details.
The preview toolbar switches between **Assembled** and **Print bed**, frames the lamp,
and toggles the light. **Print details** expands measurements and part statistics below
the preview; build errors and warnings stay visible when it is collapsed.

**Light on** (or **L**) enters **Afterglow**: a dark lighting studio with warm accents,
an illuminated shade and matching menus and editing controls. **Simple preview** in the
viewport toolbar uses lighter materials for slower devices. Camera position, selection
and parameter edits are kept when changing lighting. **Print bed** returns to Atelier;
switching back to **Assembled** restores the light and preview quality you chose.

Below 1100 px the inspector opens as a sheet over the viewport (pick a component, or
_Edit …_). Below 760 px the component rail becomes horizontal and editing controls
stack below the preview, which takes about half the screen height.

- **Examples** opens an illustrated collection with Nordic-inspired names: Måne (bell), Holm
  (drum), Klint (faceted), Bølge (fluted twist), Fjord (straight cone), Lilje (trumpet), Sol
  (wide & shallow), Lærke (cord pendant), Lys (E27 pendant), Glød (strip-ring drum), Skumring
  (two-tone bell), Siv (slatted drum), Nord (layered pendant), Fold (origami pendant), Væv
  (lattice drum), Ro (table lamp) and Aften (wall lamp). Each card keeps its lamp type,
  dimensions and shape details visible. Picking one replaces the current lamp, which stays
  one undo away. The collection name follows the new project into its print sheet and exports;
  filenames use readable ASCII equivalents, such as `openlamp-laerke.zip`.
- **The lamp tree** lists the lamp's nodes: **Project**, **Printer**, **Mount** (its kind),
  **Light** (its kind), **Outer shade**, **Inner shade** (or _Add inner shade_), **Hub &
  joints**, then one row per further part of the lamp (canopy, cord grip, stem segments, stem
  foot, base, base lid, wall plate, wall arm, or the fit-test pieces), each part with its colour
  and a bed-fit mark (✓ fits, ⚠ too big for the printer). A shade of several parts lists them
  under its node (a tiered shade's lower tiers and its spacers); a part printed several times
  says how often ("Stem segment ×2", "Spacer 1 ×3"). Selecting a node shows only its
  parameters in the inspector; selecting a part row selects the node it belongs to (its mount,
  or Hub & joints for the test pieces) and outlines the part.
- **The inspector** shows the selected node's parameters, generated from the core schema.
  Outer and inner shades start with common shape controls, followed by style, colour and surface
  controls. **Construction** and **Pattern details** expand the technical settings; notes for
  those settings remain visible while collapsed. Mounts, lights and hub connections follow the
  same approach: placement, hardware dimensions and joint clearance first; cable routing,
  fitting measurements, thread geometry and construction details in expandable sections. Each
  number has a slider and a text field; values out of range are clamped and explained under the
  field, rows that do not apply are hidden (a smooth shade has no rib count). While you drag a
  slider the preview builds at draft quality; releasing it builds the full mesh.
  - **Project**: _Reset_, the preview and export mesh quality, _Fit test only (joint test
    pair)_ and the view options below.
  - **Printer**: the build volume, how the parts lie on the plate, _Choose printer…_ (also the
    chip next to the project name).
  - **Mount**: how the lamp is hung or stands: the velcro strap on the ceiling, a pendant on a
    cord (a ceiling canopy, the cord knotted in it or held by a collet and a screw-on grip), a
    wall arm (wall plate and arm) or a standing lamp (base, lid and a segmented stem), each with
    its own parameters.
  - **Light**: a USB LED puck, an E27 or E14 bulb in a lampholder or an LED strip ring.
  - **Outer shade** / **Inner shade**: the **Style family** first — _Revolved_ (a turned wall,
    smooth, ribbed or faceted), _Slatted_ (a bottom and a top ring joined by flat slats that can
    twist around the shade and turn like louvres), _Tiered_ (PH-style overlapping tiers) or
    _Geometric_ (polyhedral, pleated or a lattice of holes); switching keeps the diameters and
    the height, and the lamp tree names each shade's family. A tiered shade is a stack of
    curved saucers, each its own print, stepped by the tier drop and overlapping so the light is
    not seen directly (a warning says when it is, or when a tier is too flat to print without
    supports); the tiers hang on short spacer rods with pins, three or four per gap, printed as
    copies of one part. A geometric shade is a twisted polygon prism (polyhedral), an origami
    Yoshimura pleat (pleated) or a wall with hexagonal or round holes (lattice). Then the
    family's shape and the colour;
    the inner shade hangs from a second collar ring of the hub (_Remove inner shade_ takes it
    away). Only a revolved outer shade can be printed in one piece with the hub.
  - **Hub & joints**: the single-piece print (velcro strap, puck and revolved shade only) or the two-part
    lamp, and for that the shade joint (bayonet, press fit, thread), its clearance, the thread
    pitch and depth, the collar wall, the radial gap between two collars, the hub's shoulder
    and, for bulbs, the vents.
- **The viewport** shows the lamp assembled; click a part to select it (and its node), click
  empty space to go back to the project, drag to orbit, **F** frames the lamp. The **View**
  options: **Explode** moves the parts apart along the lamp's axis (nothing is rebuilt, the
  camera stays); **Bed view** (**B**) lays every part out in its print orientation on the
  printer's bed as the export does, with the height limit as a wire box and parts that do not
  fit beside the bed in red (every copy of a part printed several times gets its own place);
  the section view (**X**, across X or Y) cuts the lamp in half; **Light on** (**L**) dims the
  room and switches the lamp on: the light source glows with a warm light, the shades let it
  through and a light-coloured inner shade reflects it like a polished reflector (the section
  view still cuts it); _Simple light preview_ uses plain translucent shades instead, for slow
  graphics (on by default on machines with 4 or fewer cores); the light, strap and cord show as
  ghosts; _Show as mounted_ shows the ceiling, the wall or the floor.
- **The status strip** under the viewport shows the build status, the bed-fit badge and warnings.
  Expand **Print details** for the part table (footprint, grams, triangles, overhang, bed fit per part, and the totals; clicking a
  row selects that part) with the selected part's details, and every warning.
- **Undo / redo**: ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y, or the arrows in the top
  bar. A whole slider drag is one step.
- **Export → Download STL** writes one binary STL per part at the export quality, named
  `openlamp-<project>-<part>.stl`; **ZIP of all parts** packs them with the print sheet;
  **Print sheet…** shows the parts, what to buy, the assembly steps and printing tips.
- **Fit test**: with _Fit test only_ a two-part lamp exports just a test pair of its shade
  joint, a 15 mm section of the shade's collar on a base disc and one of the hub's collar ring
  (≈ 35 g together), built from the same joint as the real parts; join them, then raise or lower
  the joint clearance under Hub & joints until the fit is right. The single-piece print exports
  its puck housing ring instead.
- **Projects**: **Save** downloads the lamp as a `.lamp.json` file named after the project and
  **Open** loads one back. **Share** copies a link that carries the whole project in the URL hash (`#p=…`);
  the address bar follows your edits, so any URL of the app reopens what you see. The app
  also autosaves in the browser and lists recent projects. Links from the first version of
  the app (`?bottomDiameter=200&style=smooth`) still open and are rewritten to the new form.

## Parameters

The shade's parameters, as shown in the inspector and accepted by the CLI
(`node cli/openlamp.ts list` prints them with their ranges):

| Group  | Parameter         | Default | Notes                                                                            |
| ------ | ----------------- | ------- | -------------------------------------------------------------------------------- |
| Shape  | bottomDiameter    | 160 mm  | opening that faces the room                                                      |
|        | topDiameter       | 92 mm   | where the wall meets the shoulder, must clear the Ø65 mm housing                 |
|        | height            | 120 mm  | wall height; the housing adds ≈ 34 mm                                            |
|        | curve             | 0.25    | < 0 trumpet flare, > 0 bell bulge                                                |
|        | wallThickness     | 0.8 mm  | Bambu's design guide recommends 0.8 mm for translucency                          |
|        | shoulderAngle     | 50°     | roof slope from horizontal; ≥ 45° needs no support                               |
| Style  | style             | ribbed  | smooth, ribbed or faceted                                                        |
|        | patternCount      | 40      | number of ribs or facets                                                         |
|        | ribDepth          | 1.6 mm  | peak-to-valley                                                                   |
|        | twist             | 25°     | pattern rotation bottom → top                                                    |
| Puck   | puckDiameter      | 59 mm   | Bambu lists D59                                                                  |
|        | puckHeight        | 8 mm    | Bambu's store lists H8, some resellers list 18 – **measure yours**               |
|        | puckClearance     | 0.7 mm  | radial fit gap, so the pocket is Ø60.4 for a Ø59 puck (0.2 mm printed too tight) |
|        | pocketExtraDepth  | 0.3 mm  | pocket is this much deeper than the puck                                         |
|        | lightHoleDiameter | 50 mm   | opening in the ledge (diffuser is ≈ 46 mm)                                       |
|        | ledgeThickness    | 2 mm    |                                                                                  |
|        | bossWall          | 2.4 mm  | housing wall around the pocket                                                   |
|        | cableSlotWidth    | 4.5 mm  |                                                                                  |
| Mount  | strapWidth        | 25 mm   | common velcro widths are 20, 25 and 50 mm                                        |
|        | strapThickness    | 2.5 mm  | tunnel gap                                                                       |
|        | loopLength        | 10 mm   | vertical tunnel length                                                           |
|        | loopWall          | 2.4 mm  |                                                                                  |
| Output | quality           | normal  | draft / normal / fine                                                            |
|        | fitTest           | no      | `yes`: only the housing ring, or a two-part lamp's joint test pair               |

The two-part lamp's hub and joint live in the project file (`hub`, `joints`) and in the
inspector's **Hub & joint** group:

| Parameter                 | Default        | Notes                                                                     |
| ------------------------- | -------------- | ------------------------------------------------------------------------- |
| `hub.fused`               | true           | `false` splits the lamp into a hub and a shade                            |
| `joints.shadeToHub`       | bayonet        | bayonet (3 lugs, twist 35° to lock), snap (press fit, crush ribs), thread |
| `joints.tolerance`        | 0.3 mm         | radial clearance of the collar in the hub ring (press fit: 0.1 mm less)   |
| `joints.threadPitch`      | 2.5 mm         | thread only; right-hand                                                   |
| `joints.threadDepth`      | 0.8 mm         | thread only; at most 0.4 × the pitch                                      |
| `hub.collarWall`          | 2 mm           | wall of the shade collar and of the hub ring                              |
| `hub.shoulderAngle`       | 50°            | the hub's own roof slope (the shade keeps its own `shoulderAngle`)        |
| `hub.wallThickness`       | 2 mm           | the hub's cone wall                                                       |
| `shades.0.collarDiameter` | auto (68.2 mm) | collar Ø = 2 · (housing radius + 1.5); a larger value enlarges it         |

## Printing notes

### How the mount works

```
ceiling  ═════════════════════  self‑adhesive velcro strip stuck to the ceiling
         ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  strap lying across the top of the housing …
       ╔═╤═════════════════╤═╗  … held captive by two belt‑loop tunnels on the sides
       ║ │    LED puck     │ ║  puck pocket, open towards the ceiling (Ø60.4 × 8.3 mm)
       ║ └───┐         ┌───┘ ║  2 mm ledge with a Ø50 mm light opening
      ╱                       ╲ shoulder at 50° (prints without support)
     ╱          shade          ╲ 0.8 mm wall, smooth / ribbed / faceted, optional twist
    ╵───────────────────────────╵ open bottom – this edge sits on the print bed
```

1. Stick the self-adhesive **hook** strip (or the loop strip – either way round) to the ceiling.
2. Drop the LED puck into the pocket from the top, diffuser facing down into the shade, and
   lay the cable out through the slot in the housing wall.
3. Thread a strip of the mating velcro down through one side tunnel, across the top of the
   housing (over the back of the puck) and down through the other tunnel. The strap keeps the
   puck in and gives a 25 × 65 mm contact patch. Trim the tails.
4. Press the lamp against the ceiling strip. To take it down, peel it off.

The puck is not screwed or glued; the ledge carries it and the strap stops it from rattling,
so it can be swapped at any time.

### Two-part lamp (hub + shade)

With _Single-piece print (fused)_ off, the housing becomes a separate **hub** (the puck pocket,
the strap tunnels and, below them, a ring 8 mm tall) and the **shade** ends in a collar that
slides up into that ring: push the shade's lugs into the slots and turn it clockwise (seen from
below) to lock the bayonet, press it home (press fit) or screw it in (thread). Both print
without supports: the hub collar ring down, the shade open end down. The shade's top is
widened automatically if it would not clear the hub ring (Ø76 mm for the default bayonet, so
the top must be at least 78 mm).

### Printing

- Print **as exported**: open end on the bed, housing on top. Every overhang is ≤ 45° from
  vertical (the shoulder is 50° from the bed, the tunnel chamfers 45°), so no supports.
- 0.4 mm nozzle, 0.2 mm layers (0.12 mm for nicer ribs), 2 walls, no infill needed for the
  shade (the housing is solid anyway). White or "Jade White" PLA diffuses the light best.
- The 0.8 mm wall is a 1.6 mm wide ring on the first layer; use a brim or a textured plate if
  adhesion is a worry. Bambu's guide prefers no brim because the brim marks show under light –
  a smooth PEI plate and a slow first layer work well.
- Fine quality exports are ~10 MB; the slicer copes, but "normal" is plenty for printing.
- **Check the fit first:** turn on _Fit test only_ (or pass `--fitTest yes`) to export just the
  13 mm tall housing ring (≈ 15 g, ≈ 10 min). Drop your puck in, thread the strap, then adjust
  `puckDiameter`, `puckHeight` or `puckClearance` if needed. For a two-part lamp the same switch
  exports the joint's test pair instead (`part fitMale` / `part fitFemale` on the command line):
  print both, twist, press or screw them together, and adjust `joints.tolerance`.

Every STL is produced by [manifold-3d](https://github.com/elalish/manifold), which only emits
oriented, watertight 2-manifold meshes; the app, the CLI and the tests check `status: NoError`.
The default shade was additionally cross-checked by slicing the STL numerically: pocket radius
30.20, light opening 25.00, housing 32.60 and belt loops out to 37.5 mm, as designed.

## Command line

The CLI builds STLs with the same core as the app (Node runs the TypeScript directly):

```bash
node cli/openlamp.ts list                      # part kinds, printers, examples, shade families, all parameters
node cli/openlamp.ts part shade                # default single-piece shade → samples/openlamp-shade.stl
node cli/openlamp.ts part shade --bottomDiameter 200 --height 150 --style ribbed \
  --patternCount 48 --twist 60 --quality fine -o big.stl
node cli/openlamp.ts part shade --fitTest yes -o samples/fit-test-ring.stl
node cli/openlamp.ts part fitMale --joint thread   # the joint test pair: collar piece …
node cli/openlamp.ts part fitFemale --joint thread # … and hub-ring piece
node cli/openlamp.ts part hub --joint thread   # hub of a two-part lamp → samples/openlamp-hub.stl
node cli/openlamp.ts part shade --joint snap   # its shade, with a press-fit collar
node cli/openlamp.ts part hub --mount ceilingCord  # the pendant's hub (cord boss on top)
node cli/openlamp.ts part canopy               # a mount's own part, with the mount's defaults
node cli/openlamp.ts part shade --json         # stats as JSON
node cli/openlamp.ts project src/examples/faceted.lamp.json --out prints/
node cli/openlamp.ts samples                   # every example → samples/ (same as npm run samples)
```

- `part <kind>` builds one part from parameters; every classic-shade parameter from `list` can
  be passed as `--<param> <value>`. Values are clamped to their range and cross-checked (for
  example the top of the shade is widened automatically if it would not clear the puck
  housing). Kinds: `shade` (the single-piece shade, or with `--joint bayonet|snap|thread` the
  shade of a two-part lamp) and `hub` (the hub of a two-part lamp, bayonet by default);
  `--mount <kind>` picks the mount, and a mount's own parts (`canopy`, `cordGrip`) come with
  that mount's defaults; `fitMale` and `fitFemale` are the fit-test pair of the shade joint.
- `project <file.lamp.json>` builds every part of a project at its export quality into
  `--out <dir>` as `openlamp-<project>-<part>.stl`.
- `samples` builds every `src/examples/*.lamp.json` into `samples/` (git-ignored).
- `--quality draft|normal|fine` overrides the quality, `--json` prints the stats as JSON,
  `--help` shows the full usage. `part`, `project` and `samples` exit with 1 if any mesh is not
  a valid manifold.

The package also exposes the CLI as an `openlamp` binary (`npm link`, then `openlamp list`).

## The `.lamp.json` format

A project is one versioned JSON document, the same for saved files, autosave, share links,
the examples and the CLI. Its top-level fields:

| Field                                 | Contents                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `version`                             | format version (currently `3`); older versions are migrated on load                                           |
| `id`, `name`, `revision`, `updatedAt` | identity, display name, edit counter, ISO timestamp                                                           |
| `printer`                             | `{ id, vendor, name, bed: [x, y, z], nozzle, multiColour, notes? }`                                           |
| `quality`                             | `{ preview, export }`, each `draft`, `normal` or `fine`                                                       |
| `light`                               | the light source: `{ kind: "puck", diameter, height, clearance, bossWall, … }`                                |
| `mount`                               | how the lamp is hung or stands: `ceilingStrap`, `ceilingCord`, `wallArm` or `standing`, with its parameters   |
| `hub`                                 | `{ wallThickness, shoulderAngle, collarWall, radialGap, ventCount, fused }`                                   |
| `shades`                              | one outer shade `{ colour, wallThickness, collarDiameter?, style: { family: "revolved", shoulderAngle, … } }` |
| `joints`                              | `{ shadeToHub, tolerance, threadPitch, threadDepth, screw: "M3", heatSet }`                                   |
| `colours`, `fitTest`                  | colours by part id or kind (`hub` defaults to `#d9d4cb`); export only the fit-test pieces                     |

The schema (zod) and the migrations are in
[`src/core/model/project.ts`](src/core/model/project.ts); a complete example is
[`src/examples/bell-default.lamp.json`](src/examples/bell-default.lamp.json).

## Development

| Script                            | What it does                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                     | Vite dev server on http://localhost:5173/openlamp/           |
| `npm run build`                   | static site in `dist/`, built for the base path `/openlamp/` |
| `npm run preview`                 | serves `dist/` on http://localhost:4173/openlamp/            |
| `npm run typecheck`               | `tsc -b` over the core, app, worker and Node projects        |
| `npm run lint`                    | ESLint                                                       |
| `npm run format` / `format:check` | Prettier                                                     |
| `npm test` / `test:watch`         | Vitest unit tests (`tests/unit`)                             |
| `npm run samples`                 | every example → `samples/`; fails on any non-watertight mesh |
| `npm run generate -- <command>`   | the CLI, e.g. `npm run generate -- list`                     |
| `npm run e2e` / `e2e:ui`          | Playwright smoke tests (`tests/e2e`) against the built site  |

The e2e tests drive headless Chromium against the production build (Playwright starts
`npm run preview` itself), so build first; install the browser once:

```bash
npx playwright install --only-shell chromium
npm run build && npm run e2e
```

Layout:

```
src/core/                 pure TypeScript shared by the worker, the CLI and the tests:
                          schema, project model, assembly, geometry, STL writer (no DOM)
src/examples/             example projects (.lamp.json)
src/worker/               web worker that owns the WASM geometry kernel, and its typed messages
src/app/                  React UI: stores, build pipeline, react-three-fiber viewport, panels
cli/openlamp.ts           command-line generator
tests/unit/               Vitest unit tests (builders, schema and migrations, examples, stores)
tests/e2e/                Playwright smoke tests
tests/fixtures/           project files used by the tests
docs/ARCHITECTURE.md      target architecture and milestones
.github/workflows/ci.yml  CI and the GitHub Pages deploy
```

**CI and Pages**: every push and pull request runs typecheck, lint, format check, unit tests,
`npm run samples` (the STLs are uploaded as the `samples` artifact), the build and the
Playwright tests (their report is uploaded when they fail). Every push to `main` then deploys
`dist/` to GitHub Pages at https://jahoefne.github.io/openlamp/.

## Sources for the kit dimensions

- Bambu Lab store: product size D59 × H8 mm, 5 V 3 W, 1.5 m cable, contents: lamp,
  2 × BT3×12 self-tapping screws, 1 × Ø40 mm 3M VHB tape.
- Bambu Lab "LED Lamp Kit-001 Design Guide" (MakerWorld model 13717): 0.8 mm walls,
  overhangs > 40° print cleanly, 0.2 mm fit tolerance.
- Resellers (3DJake, 3D Universe) list 59 × 18 mm – the puck thickness is therefore a
  parameter; measure your kit before printing.

## License

[MIT](LICENSE)
