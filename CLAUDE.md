# CLAUDE.md

Design tool for previewing lenticular security threads on banknotes (Oberthur Fiduciaire x ArtCenter studio). See README.md for what it does and the code layout.

## Commands

- `npm run dev`: dev server. From the parent folder, the `thread-playground` launch config runs it on port 5174.
- `npm run build`: type-check (TypeScript 7) and build. Run it before every commit.
- `npm run lint`: Oxlint. `src/components/ui/**` (generated shadcn code) is ignored.

## Working with Keller

- Plan first. Don't write code until Keller says to build. A scope change or "let's focus on X" means update the plan, not implement it.
- He iterates by giving feedback on the running app. Commit after each round, with a message that says what changed.
- Call notes "banknotes" in the UI.
- No tutorial or hint text in the UI. Keep only what's needed, and name terse field labels in a `title` tooltip instead.

## UI rules

- Use shadcn components for every control (`npx shadcn@latest add <name>`, base-nova style, Base UI primitives). Don't hand-roll buttons, inputs, menus or dialogs. Compose them in `src/components/controls.tsx`. Keller will restyle `src/components/ui` and the tokens in `src/index.css` later.
- After adding a component, replace `from "cn"` with `from "@/lib/utils"` in the generated files.
- Number fields are Figma-style `ScrubField`s (drag the label to scrub), not sliders.
- Project list: a top bar with the app name, save status and an account menu (username, Sign out); a Projects heading with a New project button that opens a name dialog; the demo in a side card. Sign-in is a single username field with Continue.
- Editor layout: full-screen canvas with floating panels.
  - **Top left:** back to Projects, the project name, and the collapsible Banknotes list.
  - **Bottom:** play/pause plus Cycle and Playback settings, always. A selected banknote's frames appear as clips on a track.
  - **Right:** properties, only while a banknote is selected.

## Product decisions

- It's a general tool, not tied to the Flight notes: a project is created with just a name, and banknotes can be any size. There are no built-in denomination presets.
- **Frames:** 2 to 5 per banknote. Lenticular optics are not simulated: frames are artwork shown in turn as you tilt.
- **Tilt:** only back-and-forth (up/down) tilt animates. Manual dragging is limited to ±60° (`TILT_LIMIT`). Default playback starts flat at 0°, tilts upward through the full Cycle angle, and returns to flat; it never splits the cycle above and below flat. The timeline starts at 0° too. Side to side only matters for diagonal lenses, which are planned for later. Tilting must read as up vs down, using a strong per-note perspective.
- **Timeline:** each frame has a relative `length`, and its share of the total is its share of the cycle. `tilt.cycleDeg` (Cycle), `tilt.transition` (Fade), speed, curve, and hold at ends are project-wide. Fade and motion controls live in the Playback settings popover; the default is 1× speed, Smooth curve, no hold. They are stored on each note but always edited for all notes together, and must never resize the timeline. Past one cycle the frames loop. The timeline shows one cycle with no angle ruler.
- **Images:** they always stay upright, even on horizontal threads. Complete images fill the thread thickness at their own aspect ratio and repeat to the banknote edge. Image gap sets optional spacing between copies (0 mm by default); it is separate from the paper bridges between windows.
- **Threads:** they can run vertically or horizontally, with Continuous or Windowed visibility. Windows are individual start/end sections edited directly on the canvas: draw, move, resize, or delete, snapping to 0.5 mm. Start/End fields provide precise adjustment. Editing pauses playback and shows the banknote flat with hidden artwork faintly visible. Legacy repeating patterns migrate to sections. There is no white surround.

## Data

- Everything is stored in the browser's IndexedDB (`src/lib/db.ts`), images as blobs, and nothing goes to a server. Projects therefore live in the browser they were made in. Use the Demo button on the project list to get sample content anywhere.
- When you change a saved shape, add a migration in `migrateProject` (`src/lib/notes.ts`) so existing projects keep working. An open tab can still hold the old shape in memory until it reloads.

## Testing in the built-in browser pane

- The pane throttles rendering while hidden, so DOM checks from JavaScript can look stale. Take a screenshot to force a render.
- Synthetic pointer events need `pointerId: 1`, or `setPointerCapture` throws.
- Test with a throwaway project and delete it afterwards. Don't edit Keller's own projects.
