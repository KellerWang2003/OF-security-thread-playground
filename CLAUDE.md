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
- No tutorial or hint text in the UI. Keep only what's needed, and name terse field labels in a `title` tooltip instead.

## UI rules

- Use shadcn components for every control (`npx shadcn@latest add <name>`, base-nova style, Base UI primitives). Don't hand-roll buttons, inputs, menus or dialogs. Compose them in `src/components/controls.tsx`. Keller will restyle `src/components/ui` and the tokens in `src/index.css` later.
- After adding a component, replace `from "cn"` with `from "@/lib/utils"` in the generated files.
- Number fields are Figma-style `ScrubField`s (drag the label to scrub), not sliders.
- Project list: a top bar with the app name, save status and an account menu (username, Sign out); a Projects heading with a New project button that opens a name dialog; a Demo button next to it. Sign-in is a single username field with Continue.
- Editor layout: full-screen canvas with floating panels.
  - **Top left:** back to Projects, the project name, and the collapsible Banknotes list.
  - **Bottom:** play/pause plus Cycle and Playback settings, always. A selected banknote's frames appear as clips on a track.
  - **Left edge:** the tilt pad, a square you drag in any direction to tilt every banknote (vertical = up/down, horizontal = side; it holds where you let go), with ↕ and ↔ angle fields, a lock per axis (locks also apply to canvas drag and spring-back), and a back-to-flat button. Both directions are always available, whatever the lens.
  - **Right:** properties, only while a banknote is selected, in top-level `Group`s: Banknote (size, background), Security thread (placement with the Windows card, then Artwork), Lens effect; later Intaglio, Watermark… Groups hold nested `Section`s split by thin inset dividers, with few titles. Windows is a compact card (switch, strip showing where windows sit, selected window's Start/End, full list on expand). Not collapsible for now.
  - **Export:** top right. On the banknote-name row of the right panel when a banknote is selected, otherwise a floating button beside the zoom controls. Never in the playback bar.
- `exportRender.ts` redraws NoteView on a canvas for MP4/GIF export. When you change how NoteView draws a banknote, change the export renderer to match.

## Product decisions

- It's a general tool, not tied to the Flight notes: a project is created with just a name, and banknotes can be any size. There are no built-in denomination presets.
- **Frames:** 2 to 5 per banknote. Lenticular optics are not simulated: frames are artwork shown in turn as you tilt.
- **Tilt:** frame 1 is always flat. "1 → 5" sets whether frames play tilting down (default for new projects; older projects stay Up) or up, and left/right for side tilt. Manual dragging is limited to the project's Viewing range (`tilt.viewDeg`, default ±60°, `TILT_LIMIT`). Playback is a project-wide list of moves played in order and looped (`src/lib/moves.ts`, edited in the Playback popover): preset moves (↕ Up/down, ↔ Side to side, Diagonal, Circle) go out from flat and back, by default through one full Cycle on each tilt they use; a gesture recorded on the tilt pad plays in its own time, joined to flat. The pad draws the path. Live playback and export read the same plan. Projects without a list play what the old Tilt setting chose. The timeline starts at 0° too. Tilting must read as up vs down (and left vs right), using a strong per-note perspective.
- **Lens effects:** one lens per project (`src/lib/lens.ts`), presets Up/down, Side to side, Both ways, Reveal on one tilt, Custom (by tilt or by lens). Each tilt has its own cycle; the lens angle follows from them. No preset numbers. Hidden frames are an outcome shown with an eye-off icon and ↕/↔, never a setting. Lenticular only, no microlens arrays.
- **Timeline:** each frame has a relative `length`, and its share of the total is its share of the cycle. `tilt.cycleDeg` (Cycle), `tilt.transition` (Fade), speed, curve, and hold at ends are project-wide. Fade and motion controls live in the Playback settings popover; the default is 1× speed, Smooth curve, no hold. They are stored on each note but always edited for all notes together, and must never resize the timeline. Past one cycle the frames loop. The timeline shows one cycle with no angle ruler.
- **Images:** they always stay upright, even on horizontal threads. Complete images fill the thread thickness at their own aspect ratio and repeat to the banknote edge. Image gap sets optional spacing between copies (0 mm by default); it is separate from the paper bridges between windows.
- **Threads:** they can run vertically or horizontally, with windows switched on or off (off = continuous). Windows are individual start/end sections, listed in the panel and edited directly on the canvas, with no edit mode: selecting a window (panel row, canvas, switching windows on, or +) starts editing, and clicking elsewhere on the banknote, the empty canvas or Escape ends it: draw, move, resize, or delete, snapping to 0.5 mm. Start/End fields provide precise adjustment. Editing pauses playback and shows the banknote flat with hidden artwork faintly visible. On the canvas, dragging a thread moves it across the banknote (X for vertical, Y for horizontal, 0.5 mm steps), and clicking a window selects it for editing. Legacy repeating patterns migrate to sections. There is no white surround.

## Data

- Everything is stored in the browser's IndexedDB (`src/lib/db.ts`), images as blobs, and nothing goes to a server. Projects therefore live in the browser they were made in. Use the Demo button on the project list to get sample content anywhere.
- When you change a saved shape, add a migration in `migrateProject` (`src/lib/notes.ts`) so existing projects keep working. An open tab can still hold the old shape in memory until it reloads.

## Testing in the built-in browser pane

- The pane throttles rendering while hidden, so DOM checks from JavaScript can look stale. Take a screenshot to force a render.
- Synthetic pointer events need `pointerId: 1`, or `setPointerCapture` throws.
- Test with a throwaway project and delete it afterwards. Don't edit Keller's own projects.
