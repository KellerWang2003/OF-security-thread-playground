# Security thread playground

A design tool for previewing lenticular security threads on banknotes. Upload 2 to 5 frames per banknote and tilt it back and forth to see the thread animate.

```bash
npm install
# Copy .env.example to .env.local and fill in the publishable key.
npm run dev
```

## What it does

- **Projects:** create (just a name), open, rename, duplicate and delete. **Demo** opens a temporary flapping-bird preview. Its edits are discarded when you exit, and it never appears in the project list. Enter a username to open its shared workspace. Projects and uploaded images autosave to Supabase and are available on other browsers and devices. Browser storage keeps recovery copies while offline. Anyone who knows a username can open and edit its workspace.
- **Banknotes:** a project holds any number of banknotes, like artboards. Each has its own name, size in mm (portrait or landscape), background (solid colour or an uploaded design), thread and frames.
- **Thread:** vertical or horizontal, thickness 3 to 6 mm, position across the note, optional background colour, and individually editable windows. The Windows switch turns windows on (continuous when off) and shows the first one ready to adjust; + adds one in the widest free stretch. There is no edit mode: picking a window, in the panel's list or on the canvas, edits it there (draw more on the thread, move them, or drag their ends), and clicking elsewhere on the banknote, the empty canvas or Escape ends it. Sections snap to 0.5 mm; Start/End fields set exact positions, and Delete removes the selected section. Complete frame images stay upright, fill the thread's thickness at their own aspect ratio, and repeat to the banknote edge. Image gap sets the space between copies, defaulting to 0 mm; gaps show the thread background or the banknote underneath.
- **Frames:** up to 5 per banknote, images or colours. Each frame has a length on the timeline; its share of the total is its share of the cycle. Replace, recolour, reorder or delete from a frame's ⋯ menu, or drop images on a banknote.
- **Tilt:** drag a banknote (both ways) to tilt it up to ±90° (edge-on), or press Play (Space toggles play/pause) to sweep from flat (0°) through the full Cycle angle and back to flat. Flat shows the middle frame by default; drag the pin on the frame strip in the thread editor's Lens to move it (start or middle of any frame). For Partial reveal on one tilt, drag the ends of the band on that strip to hide more or fewer frames. **1 → 5**, in the ⋯ menu on the Lens title, sets whether frames run top to bottom (the default for new projects) or bottom to top, and left to right or right to left. **Cycle** (degrees for one full pass through the frames) and **Playback settings** (fade between frames, speed, motion curve, and a hold at each end) are shared by every banknote in the project. Past one cycle the frames loop.
- **Watermark:** + on a banknote's row adds one, under the banknote as a layer beside its thread. Upload one image. A watermark is thinner paper letting light through, so only brightness counts and it only ever gets lighter: the image's light parts are the thinner paper, so it glows where the image is light, and its background (or transparency) is plain paper. **Invert** makes the dark parts glow instead, so a black logo glows. It shows in the banknote's own colours, under the thread, brightening the design (dark print stays dark, as ink blocks light): faint flat, clearer as the banknote tilts (clearest from 30°), and clear held to the light. On the banknote it drags like the thread: press it and drag to move it. Picking it, on the banknote or from its layer, shows the banknote flat with the watermark clear and its box: drag it, drag a corner to resize it (proportions kept, 0.5 mm steps) or nudge it with the arrow keys; X, Y, W and Depth set it exactly. A click elsewhere, the empty canvas or Escape ends placing, and Delete removes it. Duplicate keeps it.
- **Held to the light:** the lamp on the tilt pad, or a tap of L, holds every banknote up to the light, which shows the watermark clearly at any tilt; the design and the thread look the same. Hold L to peek at the other light. Playback's ☀ Hold to light move stays flat while the light fades in, holds (seconds per move) and fades out; recordings keep the light too.
- **Lens effect** (one per banknote, or one per thread section with Mixed angles; edited in the thread editor): Horizontal, Vertical, Diagonal 45°, Partial reveal on one tilt, or Custom angle, named by the lens ridges. A lens plays one sequence of frames; each tilt runs through it at its own cycle, and the lens angle follows from the two (tan angle = ↕ cycle ÷ ↔ cycle, `src/lib/lens.ts`). Partial reveal computes the slow tilt's cycle so the outer frames never show at any tilt up to 90°, with a Wobble allowance for a hand that drifts onto the fast tilt (flat shows the middle frame). Custom sets each tilt's cycle, or the lens angle and lens cycle. Frames a tilt never reaches get an eye-off badge with ↕ or ↔ on the timeline and in the panel, and a tilt map shows the frame at every tilt. Clicking the tilt map flips it to the print: the thread's frames, magnified, cut into strips under the ridges and woven together as they would print (`src/lib/print.ts`), with the strips seen at the current tilt lit. When side tilt responds, Playback can sweep ↕, ↔ or both.
- **Thread pattern** (`src/lib/pattern.ts`): the thread is a pattern of sections within one repeat (Repeat, in mm) that tiles the whole thread. Each section is an area of the repeat (along in mm, across as a share of the thread's width) with a frame track (which banknote frame each strip of its print shows; a shorter story is padded) and, while **Mixed angles** is on, its own lens; with it off every section plays the banknote's lens. A banknote from before patterns is one section over the whole thread and plays exactly as before. Presets (`src/lib/patternPresets.ts`): Single lens, Split band, Alternating and Chevron lock. The layout rules are checked live and only warn (`src/lib/patternRules.ts`): every window shows each tilt wherever the print lands, one rest frame, frames only some sections show sit under ridges near their tilt's axis, one strip count, minimum sizes, few ridge angles, no gaps. The print isn't registered to the banknote, so **Offset** previews one landing along the thread and **Shuffle** tries another, listing the windows that miss a tilt there; it is remembered per browser and never saved in the project. The canvas, export and print draw each section with its own frame.
- **Export:** the Export button (top right of the canvas, or beside the banknote's name when one is selected) saves one playback loop as MP4 or GIF: Banknotes are ticked in a list, side by side by default with an option for separate files; resolution (720p to 4K for MP4, 360p to 1080p for GIF), frame rate, loops (MP4) and background (transparent for GIF) are adjustable. It uses the current Cycle and Playback settings. The watermark follows the tilt and Hold to light moves as on the canvas, and with the lamp left on it is clear for the whole video. The banknotes are redrawn on a canvas (`src/lib/exportRender.ts`) to match the live view, then encoded in the browser (`src/lib/exportMedia.ts`, loaded only when exporting).
- **Canvas:** every banknote sits on one canvas. Scroll, drag the empty canvas, or middle-drag to pan, pinch or ⌘-scroll to zoom (100% is about true size), drag a banknote's label to move it, or its thread or watermark to move that on the banknote. The pointer outlines what a click would pick (a banknote, its whole thread or its watermark), and what is picked stays outlined.

## Cloud setup and Vercel

The backend is deployed to **General playground** (`swovjhbaoxlxodakauxo`). No email setup or Supabase Auth accounts are required. Use the same username on another device to open the same projects. Usernames ignore case and accept 2–32 letters, numbers, hyphens, or underscores.

For Vercel, import this repo, keep the Vite preset, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local`. Build with `npm run build`; output is `dist`. Set the variables for each Vercel environment you intend to use and redeploy after changing them. No database password or service-role key belongs in Vercel or the browser.

Existing browser projects appear under **Import browser projects** in the workspace's project list. Import them from the same browser and origin where they were created; the original copies are retained.

See [backend and save behavior](docs/SUPABASE.md) for schema, deployment, recovery, and verification details.

## Editor layout

A full-screen canvas with floating panels:

- **Left edge:** the tilt pad. Drag anywhere on it to tilt every banknote: up/down vertically, side to side horizontally, with the centre flat; it stays where you let go. The ↕ and ↔ fields take exact angles, each lock keeps the pad and canvas drag off that axis, and ↺ or a double-click returns to flat. Arrow keys nudge it when focused (Shift for 5°). The lamp in its corner (or L) holds every banknote up to the light.
- **Top left:** back to Projects, the project name, and the collapsible Banknotes list (double-click to rename, + to add, duplicate, delete). Each banknote opens to its layers: Security thread, and Watermark once added (+ on the banknote's row).
- **Bottom:** play/pause, Cycle and a Playback settings popover, always. With a banknote selected, its frames follow as clips on a track: drag a frame's right edge to change its length, drag to scrub, scroll to move along, ⌘-scroll to zoom. The playhead shows where in the cycle the tilt is.
- **Right, while a banknote is selected:** name and Export, then only what was clicked: the banknote (on the canvas or its row) shows **Banknote** (size, background); its thread (on the canvas or its **Security thread** row) shows the thread (placement with a compact Windows card, then artwork) and **Lens effect**, just an **Edit thread** button, with Offset and Shuffle when a section is shorter than the repeat; its watermark shows **Watermark**: its image (with Invert), position, width and depth. Picking another banknote shows that banknote, never the layer picked before, and tilting the selected banknote by dragging it keeps what is shown. Later features such as intaglio get their own layer.
- **Thread editor** (Edit thread, or double-click a thread on the canvas): full screen over the canvas. Top: back, the banknote's name, Mixed angles, Repeat, Ridges and undo/redo. Left: the presets, each with a ridge picture, and the Sections list (double-click to rename, + to add in the largest gap or else cut the selected section in two, duplicate, delete). Middle: the thread magnified over two or three repeats with its real artwork at the current tilt, the repeat's ends dashed, each section outlined and, with Ridges, hatched at its ridge angle. Drag on empty thread to draw a section (it takes the look and name of the section beside it), drag a section to move it or its edges to resize it (snapping to 0.5 mm along and twelfths across); a click selects, a double-click on empty thread fills that gap (a section in line with it runs on over it, or a new one takes its look), Delete removes (selecting the next section), Escape deselects and then goes back. Right: the selected section's Area and Frames (pick the frame each strip shows), the Lens (the section's own with Mixed angles, otherwise the banknote's, marked Shared) and the Checks, where a click on a problem selects its section and Fill fills every gap the same way. Bottom: the tilt pad and the playback bar, the timeline following the selected section.

## UI

Built on shadcn (same setup as Banknote Ergo Research). Add components with `npx shadcn@latest add <name>`. Theme tokens live in `src/index.css`.

## Code layout

```
src/
  app/          project list and editor screens
  editor/       Canvas (pan, zoom, move, tilt), ProjectPanel (top left, banknotes and their layers),
                TimelineBar (bottom), Inspector (right), WatermarkPanel and WatermarkEditor (placing),
                AddNoteDialog, frame and watermark actions; ThreadEditor (the full-screen thread editor),
                PatternView (its magnified thread), PatternPicture (pattern thumbnails),
                EffectSection (the lens controls)
  components/   ui/ = shadcn components (base-nova, Base UI), restyle these for the platform look;
                controls.tsx = playground compositions of them; NoteView = the banknote and thread
  cloud/        username selection, scoped workspace API client, local outbox and conflict recovery
  tilt/         preview tilt state and the spring-smoothed tilt loop
  lib/          types, defaults and migrations, lens maths (lens.ts), the thread pattern (pattern.ts: sections,
                tracks, repeat, editing maths), its rules (patternRules.ts), presets (patternPresets.ts) and
                print offset (patternOffset.ts), the print under the ridges (print.ts), playback moves (moves.ts),
                how clearly the watermark shows (light.ts), watermark placing (watermark.ts) and its relief (relief.ts),
                legacy IndexedDB import, editor actions, frame maths, demo
```

## Undo and redo

Undo/redo buttons sit beside Projects in the editor, and in the thread editor's top bar. Use ⌘/Ctrl+Z to undo, ⌘/Ctrl+Shift+Z to redo, or Ctrl+Y to redo. In the thread editor they take back only that banknote's steps and the playback every banknote shares; a step on another banknote stops them there, and the canvas's undo still reaches it. History covers project names, banknotes, artwork, thread settings and patterns, lens and timeline edits; the print offset is a preview and isn't undone. Continuous drags and scrubs are grouped into one step; text fields retain native text undo while focused. Restored edits autosave normally. Each project keeps up to 100 steps for the current session, including temporary demos.

## Checks

```bash
npm test
npm run lint
npm run build
```

Later: phone gyroscope, PNG and video export, then the Anima foil, Arc-en-Ciel and SPARK Flow PRIME as new layers.
