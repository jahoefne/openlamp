# Reflector

Parametric, 3D‑printable **ceiling lamp shade for the Bambu Lab LED Lamp Kit‑001**, hung
from the ceiling with a velcro (hook‑and‑loop) strap. Generates a watertight binary STL
from a browser UI with live preview, or from the command line.

```
ceiling  ═════════════════════  self‑adhesive velcro strip stuck to the ceiling
         ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  strap lying across the top of the housing …
       ╔═╤═════════════════╤═╗  … held captive by two belt‑loop tunnels on the sides
       ║ │    LED puck     │ ║  puck pocket, open towards the ceiling (Ø59.4 × 8.3 mm)
       ║ └───┐         ┌───┘ ║  2 mm ledge with a Ø50 mm light opening
      ╱                       ╲ shoulder at 50° (prints without support)
     ╱          shade          ╲ 0.8 mm wall, smooth / ribbed / faceted, optional twist
    ╵───────────────────────────╵ open bottom – this edge sits on the print bed
```

## How the mount works

1. Stick the self‑adhesive **hook** strip (or the loop strip – either way round) to the ceiling.
2. Drop the LED puck into the pocket from the top, diffuser facing down into the shade,
   and lay the cable out through the slot in the housing wall.
3. Thread a strip of the mating velcro down through one side tunnel, across the top of the
   housing (over the back of the puck) and down through the other tunnel. The strap keeps
   the puck in and gives a 25 × 64 mm contact patch. Trim the tails.
4. Press the lamp against the ceiling strip. To take it down, peel it off.

The puck is not screwed or glued; the ledge carries it and the strap stops it from
rattling, so it can be swapped at any time.

## Run the app

```bash
npm install
npm run dev        # opens the UI on http://localhost:5173
```

Adjust the sliders, watch the preview (there is a section view and a "mounted on the
ceiling" view), then click **Download STL**. The settings are mirrored in the URL, so
**Copy link** gives you a shareable configuration.

`npm run build` produces a static site in `dist/` that works from any web server.

## Command line

```bash
node cli.mjs                                   # default shade → samples/shade.stl
node cli.mjs --list                            # all parameters and presets
node cli.mjs --preset "Faceted" -o faceted.stl
node cli.mjs --bottomDiameter 200 --height 150 --style ribbed --patternCount 48 --twist 60 --quality fine -o big.stl
node cli.mjs --json                            # stats as JSON
```

Any parameter from `--list` can be passed as `--key value`. Values are clamped to their
range and cross‑checked (for example the top of the shade is widened automatically if it
would not clear the puck housing).

## Parameters

| Group | Parameter | Default | Notes |
| --- | --- | --- | --- |
| Shape | bottomDiameter | 160 mm | opening that faces the room |
| | topDiameter | 92 mm | where the wall meets the shoulder, must clear the Ø64 mm housing |
| | height | 120 mm | wall height; the housing adds ≈ 34 mm |
| | curve | 0.25 | < 0 trumpet flare, > 0 bell bulge |
| | wallThickness | 0.8 mm | Bambu's design guide recommends 0.8 mm for translucency |
| | shoulderAngle | 50° | roof slope from horizontal; ≥ 45° needs no support |
| Style | style | ribbed | smooth, ribbed or faceted |
| | patternCount | 40 | number of ribs or facets |
| | ribDepth | 1.6 mm | peak‑to‑valley |
| | twist | 25° | pattern rotation bottom → top |
| Puck | puckDiameter | 59 mm | Bambu lists D59 |
| | puckHeight | 8 mm | Bambu's store lists H8, some resellers list 18 – **measure yours** |
| | puckClearance | 0.2 mm | radial fit gap (Bambu's guide suggests 0.2) |
| | pocketExtraDepth | 0.3 mm | pocket is this much deeper than the puck |
| | lightHoleDiameter | 50 mm | opening in the ledge (diffuser is ≈ 46 mm) |
| | ledgeThickness | 2 mm | |
| | bossWall | 2.4 mm | housing wall around the pocket |
| | cableSlotWidth | 4.5 mm | |
| Mount | strapWidth | 25 mm | common velcro widths are 20, 25 and 50 mm |
| | strapThickness | 2.5 mm | tunnel gap |
| | loopLength | 10 mm | vertical tunnel length |
| | loopWall | 2.4 mm | |
| Output | quality | normal | draft / normal / fine |
| | fitTest | no | `yes` exports only the housing ring for a quick fit check |

## Printing

* Print **as exported**: open end on the bed, housing on top. Every overhang is ≤ 45°
  from vertical (the shoulder is 50° from the bed, the tunnel chamfers 45°), so no supports.
* 0.4 mm nozzle, 0.2 mm layers (0.12 mm for nicer ribs), 2 walls, no infill needed for the
  shade (the housing is solid anyway). White or "Jade White" PLA diffuses the light best.
* The 0.8 mm wall is a 1.6 mm wide ring on the first layer; use a brim or a textured plate
  if adhesion is a worry. Bambu's guide prefers no brim because the brim marks show under
  light – a smooth PEI plate and a slow first layer work well.
* Fine quality exports are ~10 MB; the slicer copes, but "normal" is plenty for printing.
* **Check the fit first:** set *Fit test only* to *yes* (or `--fitTest yes`) to export just the
  13 mm tall housing ring (`samples/fit-test-ring.stl`, ≈ 15 g, ≈ 10 min). Drop your puck in,
  thread the strap, then adjust `puckDiameter`, `puckHeight` or `puckClearance` if needed.

## Verification

Every STL is produced by [manifold‑3d](https://github.com/elalish/manifold), which only
emits oriented, watertight 2‑manifold meshes (`status: NoError` is checked). The default
shade was additionally cross‑checked by slicing the STL numerically: pocket radius 29.70,
light opening 25.00, housing 32.10 and belt loops out to 37.0 mm, as designed.

## Project layout

```
cli.mjs            command‑line generator
index.html         web UI shell
src/params.js      parameter schema, defaults, presets, validation
src/geometry.js    shade geometry (profile → revolve → warp → booleans)
src/stl.js         binary STL writer
src/worker.js      web worker that owns the WASM geometry kernel
src/app.js         UI, three.js preview, STL download
samples/           example STLs
```

## Sources for the kit dimensions

* Bambu Lab store: product size D59 × H8 mm, 5 V 3 W, 1.5 m cable, contents: lamp,
  2 × BT3×12 self‑tapping screws, 1 × Ø40 mm 3M VHB tape.
* Bambu Lab "LED Lamp Kit‑001 Design Guide" (MakerWorld model 13717): 0.8 mm walls,
  overhangs > 40° print cleanly, 0.2 mm fit tolerance.
* Resellers (3DJake, 3D Universe) list 59 × 18 mm – the puck thickness is therefore a
  parameter; measure your kit before printing.
