# index.html Knowledge

## Purpose
`index.html` hosts the AlphaTab score viewer UI. It loads AlphaTab, accepts local files,
renders a score, and provides playback/printing controls.

## Layout
- `main.page` is full width (no max-width).
- `.alpha-tab` is an unstyled container for AlphaTab with extra bottom padding (`50vh`)
  to keep content visible above the floating control bar.

## Floating Control Bar
- `.controls` is fixed at bottom-left, always visible.
- Light yellow-brown theme with rounded border and shadow.
- All buttons and status elements live inside the control bar.
- `[hidden]` inside `.controls` is forced to `display: none` to avoid overrides.

## Controls and Status
- File picker label (`.file-label`) triggers `#file-input`.
- `#print-button` is hidden until a score finishes rendering.
- `#play-pause` uses SVG icons and toggles Play/Pause.
- `#stop` uses an SVG "back" icon and sits left of Play/Pause.
- `#status` shows loading/errors; hidden after successful render.
- `#player-status` is hidden by default and only shown on soundfont load error.
- `#player-time` is hidden until a score renders; hidden again on new load.

## Behavior
- `alphaTab.AlphaTabApi` is initialized on `#alpha-tab` with player enabled and
  `scrollElement` set to the container.
- Score load flow:
  - On file select, status shows "Loading..." and `#print-button`/`#player-time` hide.
  - On render start, status shows "Rendering..." and stays visible.
  - On render finish, status hides and `#print-button`/`#player-time` show.
  - On errors, status shows an error message.
- `#print-button` calls `api.print()`.
- Spacebar toggles play/pause unless typing in an input/textarea/contenteditable.

## External Dependencies
- AlphaTab is loaded from jsDelivr:
  `https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.7.1/dist/alphaTab.min.js`
