# Security thread playground

A design tool for previewing a lenticular security thread on a banknote. You upload 2 to 5 frames and tilt the note; the tilt range is split into equal slices, one frame per slice.

```bash
npm install
npm run dev
```

## What it does

- **Projects:** create, open, rename, duplicate and delete. Everything autosaves to the browser's IndexedDB, including uploaded images; nothing leaves your machine.
- **Note:** Flight presets (0.2 at 68 × 120, 25 at 68 × 134, 10,000 at 68 × 148 mm) or a custom size, colour, optional face artwork.
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
