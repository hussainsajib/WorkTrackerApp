# modules/settings/

One file per block on the Settings tab. Each has a `setup*` function called from `init()` in `../../app.js`.

- `theme.js` — System/Light/Dark. Sets `data-theme` on `<html>` (removed for System) and saves the `theme` setting. The matching CSS lives in `../../styles.css`.
- `loginItem.js` — launch at Windows login. The main process must register `PORTABLE_EXECUTABLE_FILE || process.execPath`; don't try to work out the path here.
- `configLists.js` — user-editable task types and priorities (`CONFIG` in `../core/state.js`), plus `loadConfig()`. Statuses are not editable here.
- `dbLocation.js` — shows the database path and triggers move / use existing / use default. Each choice restarts the app via the main process (`dbLocation:*` IPC; logic in `../../../dbLocation.js`).
- `dataActions.js` — export to JSON and reset the database.

Adding a setting
1. Add the markup in `../../index.html` (`#tab-settings`).
2. Persist with `window.api.settings.get(key, fallback)` / `.set(key, value)`.
3. Add a `setup*` here and call it from `init()`.
