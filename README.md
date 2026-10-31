# Security thread playground

A design tool for previewing lenticular security threads on banknotes. Upload 2 to 5 frames per banknote and tilt it back and forth to see the thread animate.

```bash
npm install
npm run dev
```

## What it does

- **Projects:** create (just a name), open, rename, duplicate and delete. **Demo** builds a ready-made flapping-bird project. Everything autosaves to the browser's IndexedDB, uploaded images included, so projects live in the browser they were made in.
- **Banknotes:** a project holds any number of banknotes, like artboards. Each has its own name, size in mm (portrait or landscape), background (solid colour or an uploaded design), thread and frames.
- **Thread:** vertical or horizontal, width 3 to 6 mm, position across the note, and windows (open length, gap, offset). Frame images stay upright, keep their aspect ratio at the thread's thickness and repeat along it with no gaps. One repeat length applies to every frame of a banknote: it can crop the image, never stretch it, and is set from the first upload.
- **Frames:** up to 5 per banknote, images or colours. Each frame has a length on the timeline; its share of the total is its share of the cycle. Replace, recolour, reorder or delete from a frame's ⋯ menu, or drop images on a banknote.
- **Tilt:** back and forth only (horizontal lenses), up to ±60°. Drag a banknote to tilt it, or press play to wobble through one cycle. **Cycle** (degrees for one full pass through the frames) and **Fade** (crossfade between frames) are shared by every banknote in the project. Past one cycle the frames loop.
- **Canvas:** every banknote sits on one canvas. Scroll or space-drag to pan, pinch or ⌘-scroll to zoom (100% is about true size), drag a banknote's label to move it.

## Editor layout

A full-screen canvas with floating panels:

- **Top left:** back to Projects, the project name, and the collapsible Banknotes list (double-click to rename, + to add, duplicate, delete).
- **Bottom:** play/pause, Cycle and Fade, always. With a banknote selected, its frames follow as clips on a track: drag a frame's right edge to change its length, drag to scrub, scroll to move along, ⌘-scroll to zoom. The playhead shows where in the cycle the tilt is.
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
  tilt/         preview tilt state and the spring-smoothed tilt loop
  lib/          types, defaults and migrations, IndexedDB, project store, frame maths, demo
```

Later: diagonal lenses, phone gyroscope, PNG and video export, then the Anima foil, Arc-en-Ciel and SPARK Flow PRIME as new layers.
