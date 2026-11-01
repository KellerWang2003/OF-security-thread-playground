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
- **Tilt:** drag a banknote (both ways) to tilt it up to ±60°, the fixed viewing range, or press Play (Space toggles play/pause) to sweep from flat (0°) through the full Cycle angle and back to flat. Frame 1 is always flat; **1 → 5** sets whether the frames play tilting down (the default for new projects) or up. **Cycle** (degrees for one full pass through the frames) and **Playback settings** (fade between frames, speed, motion curve, and a hold at each end) are shared by every banknote in the project. Past one cycle the frames loop.
- **Lens effect** (one per project, in the right panel): Horizontal, Vertical, Diagonal 45°, Partial reveal, or Custom angle, named by the lens ridges. A lens plays one sequence of frames; each tilt runs through it at its own cycle, and the lens angle follows from the two (tan angle = ↕ cycle ÷ ↔ cycle, `src/lib/lens.ts`). Partial reveal computes the slow tilt's cycle so the outer frames stay out of reach within ±60° (flat shows the middle frame). Custom sets each tilt's cycle, or the lens angle and lens cycle. Frames a tilt never reaches get an eye-off badge with ↕ or ↔ on the timeline and in the panel, and a tilt map shows the frame at every tilt. When side tilt responds, Playback can sweep ↕, ↔ or both.
- **Export:** the Export button (top right of the canvas, or beside the banknote's name when one is selected) saves one playback loop as MP4 or GIF: Banknotes are ticked in a list, side by side by default with an option for separate files; resolution (720p to 4K for MP4, 360p to 1080p for GIF), frame rate, loops (MP4) and background (transparent for GIF) are adjustable. It uses the current Cycle and Playback settings. The banknotes are redrawn on a canvas (`src/lib/exportRender.ts`) to match the live view, then encoded in the browser (`src/lib/exportMedia.ts`, loaded only when exporting).
- **Canvas:** every banknote sits on one canvas. Scroll, drag the empty canvas, or middle-drag to pan, pinch or ⌘-scroll to zoom (100% is about true size), drag a banknote's label to move it.

## Cloud setup and Vercel

The backend is deployed to **General playground** (`swovjhbaoxlxodakauxo`). No email setup or Supabase Auth accounts are required. Use the same username on another device to open the same projects. Usernames ignore case and accept 2–32 letters, numbers, hyphens, or underscores.

For Vercel, import this repo, keep the Vite preset, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local`. Build with `npm run build`; output is `dist`. Set the variables for each Vercel environment you intend to use and redeploy after changing them. No database password or service-role key belongs in Vercel or the browser.

Existing browser projects appear under **Import browser projects** in the workspace's project list. Import them from the same browser and origin where they were created; the original copies are retained.

See [backend and save behavior](docs/SUPABASE.md) for schema, deployment, recovery, and verification details.

## Editor layout

A full-screen canvas with floating panels:

- **Left edge:** the tilt pad. Drag anywhere on it to tilt every banknote: up/down vertically, side to side horizontally, with the centre flat; it stays where you let go. The ↕ and ↔ fields take exact angles, each lock keeps the pad and canvas drag off that axis, and ↺ or a double-click returns to flat. Arrow keys nudge it when focused (Shift for 5°).
- **Top left:** back to Projects, the project name, and the collapsible Banknotes list (double-click to rename, + to add, duplicate, delete).
- **Bottom:** play/pause, Cycle and a Playback settings popover, always. With a banknote selected, its frames follow as clips on a track: drag a frame's right edge to change its length, drag to scrub, scroll to move along, ⌘-scroll to zoom. The playhead shows where in the cycle the tilt is.
- **Right, while a banknote is selected:** name and Export, then one group per part of the banknote: **Banknote** (size, background), **Security thread** (placement with a compact Windows card, then artwork) and **Lens effect**. Later features such as intaglio or a watermark get their own group.

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
  lib/          types, defaults and migrations, lens maths (lens.ts), legacy IndexedDB import, editor actions, frame maths, demo
```

## Undo and redo

Undo/redo buttons sit beside Projects in the editor. Use ⌘/Ctrl+Z to undo, ⌘/Ctrl+Shift+Z to redo, or Ctrl+Y to redo. History covers project names, banknotes, artwork, thread settings, and timeline edits. Continuous drags and scrubs are grouped into one step; text fields retain native text undo while focused. Restored edits autosave normally. Each project keeps up to 100 steps for the current session, including temporary demos.

## Checks

```bash
npm test
npm run lint
npm run build
```

Later: phone gyroscope, PNG and video export, then the Anima foil, Arc-en-Ciel and SPARK Flow PRIME as new layers.
