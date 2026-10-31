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
- **Thread:** vertical or horizontal, thickness 3 to 6 mm, position across the note, optional background colour, and individually editable windows. Choose Continuous or Windowed, then Edit windows to draw visible sections on the canvas, move them, or drag their ends. Sections snap to 0.5 mm; Start/End fields set exact positions, and Delete removes the selected section. Complete frame images stay upright, fill the thread's thickness at their own aspect ratio, and repeat to the banknote edge. Image gap sets the space between copies, defaulting to 0 mm; gaps show the thread background or the banknote underneath.
- **Frames:** up to 5 per banknote, images or colours. Each frame has a length on the timeline; its share of the total is its share of the cycle. Replace, recolour, reorder or delete from a frame's ⋯ menu, or drop images on a banknote.
- **Tilt:** back and forth only (horizontal lenses). Drag a banknote to tilt it up to ±60°, or press Play (Space toggles play/pause) to sweep from flat (0°) upward through the full Cycle angle and back to flat. **Cycle** (degrees for one full pass through the frames) and **Playback settings** (fade between frames, speed, motion curve, and a hold at each end) are shared by every banknote in the project. Past one cycle the frames loop.
- **Export:** the Export button (top right of the canvas, or beside the banknote's name when one is selected) saves one playback loop as MP4 or GIF: the selected banknote, all of them, or a chosen few, side by side in one file or as separate files in a zip. Scale (px per mm), frame rate, loops (MP4) and background (transparent for GIF) are adjustable. It uses the current Cycle and Playback settings. The banknotes are redrawn on a canvas (`src/lib/exportRender.ts`) to match the live view, then encoded in the browser (`src/lib/exportMedia.ts`, loaded only when exporting).
- **Canvas:** every banknote sits on one canvas. Scroll, drag the empty canvas, or middle-drag to pan, pinch or ⌘-scroll to zoom (100% is about true size), drag a banknote's label to move it.

## Cloud setup and Vercel

The backend is deployed to **General playground** (`swovjhbaoxlxodakauxo`). No email setup or Supabase Auth accounts are required. Use the same username on another device to open the same projects. Usernames ignore case and accept 2–32 letters, numbers, hyphens, or underscores.

For Vercel, import this repo, keep the Vite preset, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local`. Build with `npm run build`; output is `dist`. Set the variables for each Vercel environment you intend to use and redeploy after changing them. No database password or service-role key belongs in Vercel or the browser.

Existing browser projects appear under **Import browser projects** in the workspace's project list. Import them from the same browser and origin where they were created; the original copies are retained.

See [backend and save behavior](docs/SUPABASE.md) for schema, deployment, recovery, and verification details.

## Editor layout

A full-screen canvas with floating panels:

- **Top left:** back to Projects, the project name, and the collapsible Banknotes list (double-click to rename, + to add, duplicate, delete).
- **Bottom:** play/pause, Cycle and a Playback settings popover, always. With a banknote selected, its frames follow as clips on a track: drag a frame's right edge to change its length, drag to scrub, scroll to move along, ⌘-scroll to zoom. The playhead shows where in the cycle the tilt is.
- **Right, while a banknote is selected:** name, size and orientation, background, thread (direction, width, position, repeat) and windows.

## UI

Built on shadcn (same setup as Banknote Ergo Research). Add components with `npx shadcn@latest add <name>`. Theme tokens live in `src/index.css`.

## Code layout

```
src/
  app/          project list and editor screens
  editor/       Canvas (pan, zoom, move, tilt), ProjectPanel (top left), TimelineBar (bottom),
                Inspector (right), AddNoteDialog, frame actions
  components/   ui/ = shadcn components (base-nova, Base UI), restyle these for the platform look;
                controls.tsx = playground compositions of them; NoteView = the banknote and thread
  cloud/        username selection, scoped workspace API client, local outbox and conflict recovery
  tilt/         preview tilt state and the spring-smoothed tilt loop
  lib/          types, defaults and migrations, legacy IndexedDB import, editor actions, frame maths, demo
```

## Undo and redo

Undo/redo buttons sit beside Projects in the editor. Use ⌘/Ctrl+Z to undo, ⌘/Ctrl+Shift+Z to redo, or Ctrl+Y to redo. History covers project names, banknotes, artwork, thread settings, and timeline edits. Continuous drags and scrubs are grouped into one step; text fields retain native text undo while focused. Restored edits autosave normally. Each project keeps up to 100 steps for the current session, including temporary demos.

## Checks

```bash
npm test
npm run lint
npm run build
```

Later: diagonal lenses, phone gyroscope, PNG and video export, then the Anima foil, Arc-en-Ciel and SPARK Flow PRIME as new layers.
