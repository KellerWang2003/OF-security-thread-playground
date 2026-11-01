# CLAUDE.md

Design tool for previewing lenticular security threads on banknotes (Oberthur Fiduciaire x ArtCenter studio). See README.md for what it does and the code layout.

## Commands

- `npm run dev`: dev server. From the parent folder, the `thread-playground` launch config runs it on port 5174.
- `npm run build`: type-check (TypeScript 7) and build. Run it before every commit.
- `npm run lint`: Oxlint. `src/components/ui/**` (generated shadcn code) is ignored.

## Working with Keller

- **Branches:** the app has live users, and main deploys to them through Vercel. Do all work on the `dev` branch, or a feature branch off it, and commit and push there. Merge into main or push main only when Keller explicitly says to in that conversation. The Supabase backend is shared by every branch, so treat database, function or template changes as live too, and check with Keller first.
- Plan first. Don't write code until Keller says to build. A scope change or "let's focus on X" means update the plan, not implement it.
- He iterates by giving feedback on the running app. Commit after each round, with a message that says what changed.
- Call notes "banknotes" in the UI.
- No tutorial or hint text in the UI. Keep only what's needed, and name terse field labels in a `title` tooltip instead. Where a control is hard to grasp the first time (1 → 5, Cycle), use `Explain` (`src/editor/LensVisuals.tsx`): a hover tooltip with a small picture and one line.

## UI rules

- Use shadcn components for every control (`npx shadcn@latest add <name>`, base-nova style, Base UI primitives). Don't hand-roll buttons, inputs, menus or dialogs. Compose them in `src/components/controls.tsx`. Keller will restyle `src/components/ui` and the tokens in `src/index.css` later.
- After adding a component, replace `from "cn"` with `from "@/lib/utils"` in the generated files.
- Number fields are Figma-style `ScrubField`s (drag the label to scrub), not sliders.
- Project list: a top bar with the app name, save status and an account menu (username, Sign out); a Projects heading with a New project button that opens a name dialog; a Demo button next to it. Sign-in is a single username field with Continue.
- Editor layout: full-screen canvas with floating panels.
  - **Top left:** back to Projects, the project name, and the collapsible Banknotes list.
  - **Bottom:** play/pause plus Record movement and Playback settings, always. Cycle lives only in the right panel's lens effect. A selected banknote's frames appear as clips on a track.
  - **Left edge:** the tilt pad, a square you drag in any direction to tilt every banknote (vertical = up/down, horizontal = side; it holds where you let go), with ↕ and ↔ angle fields, a lock per axis (locks also apply to canvas drag and spring-back), and a back-to-flat button. Both directions are always available, whatever the lens.
  - **Right:** properties, only while a banknote is selected, in top-level `Group`s: Banknote (size, background), Security thread (placement with the Windows card, then Artwork), Lens effect; later Intaglio, Watermark… Groups hold nested `Section`s split by thin inset dividers, with few titles. Windows is a compact card (switch, strip showing where windows sit, selected window's Start/End, full list on expand). Not collapsible for now.
  - **Export:** top right. On the banknote-name row of the right panel when a banknote is selected, otherwise a floating button beside the zoom controls. Never in the playback bar.
- `exportRender.ts` redraws NoteView on a canvas for MP4/GIF export. When you change how NoteView draws a banknote, change the export renderer to match.

## Product decisions

- It's a general tool, not tied to the Flight notes: a project is created with just a name, and banknotes can be any size. There are no built-in denomination presets.
- **Frames:** 2 to 5 per banknote. Lenticular optics are not simulated: frames are artwork shown in turn as you tilt.
- **Tilt:** flat sits at the middle of the middle frame by default (frame 3 of 5, frame 2 of 4), so one tilt direction plays on towards the last frame and the other back towards frame 1. Flat is set with the pin on the Lens effect frame strip (`FlatStrip`), snapping to half-frame steps (`tilt.flatAt` as a number; 'start' from older saves = 0); the timeline shows it read-only. Hidden frames are always the ones farthest from flat, so moving flat moves them. "1 → 5" sets whether frames run top to bottom (default for new projects; older projects stay bottom to top) or bottom to top, and left to right (default) or right to left. Both live in the ⋯ menu on the Lens effect title (`LensMenu`), since they rarely change. Tilt goes to ±90° (`TILT_LIMIT`, edge-on), not a setting: it limits manual tilt and playback (`SWEEP_MAX`) and decides hidden frames. Light and shade on the banknote still scale to full at 60° (`SHADE_DEG`). `tilt.viewDeg` from older saves is ignored. Playback is a project-wide list of moves played in order and looped (`src/lib/moves.ts`, edited in the Playback popover): preset moves (↕ Up/down, ↔ Side to side, Diagonal, Circle) go out from flat and back (up/down and side can start from any angle instead, e.g. swing −12° ↔ +12° without returning to flat; every move starts from flat and returns to flat before the next), by default through one full Cycle on each tilt they use; a recording (Record movement, then drag on the tilt pad) is saved to the project's Recordings and becomes the whole playlist on its own; it plays in its own time joined to flat. The Playback settings popover has one plain list of moves on the left (presets, then recordings; click to add to the playlist, recordings can be deleted), the Playlist on the right (reorder, remove, per-move ↕/↔ reach), and Motion (speed, hold, curve, fade) under it. The pad draws the path. Live playback and export read the same plan. Projects without a list play what the old Tilt setting chose. The timeline starts at 0° too. Tilting must read as up vs down (and left vs right), using a strong per-note perspective.
- **Lens effects:** one lens per banknote (`src/lib/lens.ts`): the effect, Cycle, flat, band, wobble and 1 → 5 directions are edited for the selected banknote only (a new banknote starts from the last one's); playback and the tilt pad follow the selected banknote, or the first. Presets Up/down, Side to side, Both ways, Reveal on one tilt, Custom (by tilt or by lens), named by their ridges: Horizontal (plays on up/down), Vertical (side to side), Diagonal 45° (same cycle on both tilts), Partial reveal on one tilt (one tilt plays every frame, the other never shows the outer ones at any tilt up to 90° (`HIDE_LIMIT`), even with the hand drifting `Wobble` degrees (default 5°) onto the fast tilt: the slow cycle is computed and the hidden count follows from it, never typed: the strip shows the slow tilt's reach as a band whose ends you drag to hide more or fewer frames (`revealLevel`, a step inwards from the widest); if the fast cycle is too short for the wobble, the panel shows the minimum fast cycle in red. This is for real banknotes, not just the prototype), Custom angle (by tilt or by lens). The dropdown shows a ridge picture and one line per option. Each tilt has its own cycle; the lens angle follows from them. The presets all store their one Cycle in `cycleDeg` (Partial reveal's slow cycle is computed); only Custom reads `cycleXDeg`. Switching effect (`src/lib/switchEffect.ts`) keeps flat, band, wobble and directions, carries the fastest playing cycle into a preset (back to the default if it's over 180°), and starts Custom from exactly what the current effect gives. No preset numbers. Hidden frames are an outcome shown with an eye-off icon and ↕/↔, never a setting. Lenticular only, no microlens arrays.
- **Timeline:** each frame has a relative `length`, and its share of the total is its share of the cycle. Cycle (`tilt.cycleDeg`) is per banknote, with the lens. `tilt.transition` (Fade), speed, curve, hold at ends and the moves list are project-wide. Fade and motion controls live in the Playback settings popover; the default is 1× speed, Smooth curve, no hold. They are stored on each note but always edited for all notes together, and must never resize the timeline. Past one cycle the frames loop. The timeline shows one cycle with no angle ruler.
- **Images:** they always stay upright, even on horizontal threads. Complete images fill the thread thickness at their own aspect ratio and repeat to the banknote edge. Image gap sets optional spacing between copies (0 mm by default); it is separate from the paper bridges between windows.
- **Threads:** they can run vertically or horizontally, with windows switched on or off (off = continuous). Windows are individual start/end sections, listed in the panel and edited directly on the canvas, with no edit mode: selecting a window (panel row, canvas, switching windows on, or +) starts editing, and clicking elsewhere on the banknote, the empty canvas or Escape ends it: draw, move, resize, or delete, snapping to 0.5 mm. Start/End fields provide precise adjustment. Editing pauses playback and shows the banknote flat with hidden artwork faintly visible. On the canvas, dragging a thread moves it across the banknote (X for vertical, Y for horizontal, 0.5 mm steps), and clicking a window selects it for editing. Legacy repeating patterns migrate to sections. There is no white surround.

## Data

- Everything is stored in the browser's IndexedDB (`src/lib/db.ts`), images as blobs, and nothing goes to a server. Projects therefore live in the browser they were made in. Use the Demo button on the project list to get sample content anywhere.
- When you change a saved shape, add a migration in `migrateProject` (`src/lib/notes.ts`) so existing projects keep working. An open tab can still hold the old shape in memory until it reloads.

## Testing in the built-in browser pane

- The pane throttles rendering while hidden, so DOM checks from JavaScript can look stale. Take a screenshot to force a render.
- Synthetic pointer events need `pointerId: 1`, or `setPointerCapture` throws.
- Test with a throwaway project and delete it afterwards. Don't edit Keller's own projects.
