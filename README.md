# Security thread playground

A design tool for previewing a lenticular security thread on a banknote. You upload 2 to 5 frames and tilt the note; the tilt range is split into equal slices, one frame per slice.

```bash
npm install
npm run dev
```

## What it does

- **Projects:** create (just a name), open, rename, duplicate and delete. Everything autosaves to the browser's IndexedDB, including uploaded images; nothing leaves your machine.
- **Notes:** a project holds any number of notes, like pages in a document. Each has its own name, size in mm, colour, optional face artwork, thread, frames and tilt settings. Add, duplicate and delete them from the left panel.
- **Thread:** width 3 to 6 mm, position from the left edge, frames stretched full length or repeated as a tile.
- **Frames:** upload, reorder, replace, rename and delete; colour frames as placeholders. Drop images on the note to add them.
- **Canvas:** every note of a project sits on one canvas. Scroll or space-drag to pan, pinch or ⌘-scroll to zoom (100% is about true size), drag a note's label to move it, and use the zoom controls to fit everything.
- **Tilt:** drag on a note, auto-wobble or an angle slider; back and forth or side to side; range, crossfade, perspective and a moving highlight.

## Layout of the editor

A full-screen canvas with floating panels. Top left: back to Projects, the project name and a collapsible Banknotes list (double-click a name to rename). Bottom: play/pause, the selected note's frames as a timeline with a draggable playhead and a + card (up to 5 frames). Right, while a note is selected: size, background (solid colour or uploaded design), thread width and position, and the frame cycle (direction, full-cycle angle, crossfade).

## UI

The UI is built on shadcn (same setup as Banknote Ergo Research). Add components with `npx shadcn@latest add <name>`; theme tokens live in `src/index.css`.

## Layout

```
src/
  app/          project list and editor screens
  editor/       Canvas (pan, zoom, move, tilt), ProjectPanel (top left), TimelineBar (bottom),
                Inspector (right), AddNoteDialog, frame actions
  components/   ui/ = shadcn components (base-nova, Base UI), restyle these for the platform look;
                controls.tsx = playground compositions of them; NoteView = the note and thread
  tilt/         preview tilt state and the spring-smoothed tilt loop
  lib/          types, note presets, IndexedDB, project store, frame maths
```

Later: phone gyroscope, PNG and video export, diagonal lenses, then the Anima foil, Arc-en-Ciel and SPARK Flow PRIME as new layers.
