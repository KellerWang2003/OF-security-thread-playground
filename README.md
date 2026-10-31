# Security thread playground

A design tool for previewing a lenticular security thread on a banknote. You upload 2 to 5 frames and tilt the note; the tilt range is split into equal slices, one frame per slice.

```bash
npm install
npm run dev
```

## What it does

- **Projects:** create (just a name), open, rename, duplicate and delete. Everything autosaves to the browser's IndexedDB, including uploaded images; nothing leaves your machine.
- **Notes:** a project holds any number of notes, like pages in a document. Each has its own name, size in mm, colour, optional face artwork, thread, frames and tilt settings. Add, duplicate and delete them from the left panel.
- **Thread:** width 3 to 6 mm, position from the left edge, white surround, frames stretched full length or repeated as a tile.
- **Frames:** upload, reorder, replace, rename and delete; colour frames as placeholders. Drop images on the note to add them.
- **Tilt:** drag on the note, auto-wobble or an angle slider; back and forth or side to side; range, crossfade, perspective and a moving highlight.

## UI

The UI is built on shadcn (same setup as Banknote Ergo Research). Add components with `npx shadcn@latest add <name>`; theme tokens live in `src/index.css`.

## Layout

```
src/
  app/          project list and editor screens
  editor/       Stage (note + drag), FrameStrip, Inspector (side panel), frame actions
  components/   ui/ = shadcn components (base-nova, Base UI), restyle these for the platform look;
                controls.tsx = playground compositions of them; NoteView = the note and thread
  tilt/         preview tilt state and the spring-smoothed tilt loop
  lib/          types, note presets, IndexedDB, project store, frame maths
```

Later: phone gyroscope, PNG and video export, diagonal lenses, then the Anima foil, Arc-en-Ciel and SPARK Flow PRIME as new layers.
