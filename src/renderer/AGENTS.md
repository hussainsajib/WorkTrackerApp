# src/renderer/

The UI. Plain HTML, CSS and JavaScript with no bundler and no build step.

- `index.html` — all markup (tabs, forms, modals). Loads Quill as a classic script, then `app.js` as `<script type="module">`.
- `app.js` — thin entry point: imports the feature modules and runs `init()`. Keep it free of feature logic.
- `styles.css` — all styles. Colors come from CSS variables on `:root`; the dark palette is defined twice (`:root[data-theme="dark"]` and the `prefers-color-scheme` media query), so change both.
- `modules/` — the feature code, split by area. See `modules/AGENTS.md`.
- `vendor/` — third-party code copied in as-is. See `vendor/AGENTS.md`.

Rules
- CSP is `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`: no inline scripts, no inline event handlers, no remote resources.
- The renderer only talks to the main process through `window.api.*` (defined in `../../preload.js`). `nodeIntegration` is off and `contextIsolation` is on.
- Renderer timers must keep running while the window is hidden (pomodoro), so the window uses `backgroundThrottling: false`.
- Launching the app for tests uses the user's real database unless you pass `--user-data-dir=<temp-dir>`.
