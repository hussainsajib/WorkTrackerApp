# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, Cursor, etc.) working with code in this repository. Claude Code reads it directly (v2.1.277+) as long as no `CLAUDE.md` exists in this repo or above it, so do not add one: it would hide every `AGENTS.md`, including the per-folder ones under `src/`.

## What this is

Personal Windows desktop task tracker (Electron 32 + `better-sqlite3`, vanilla HTML/CSS/JS renderer, no bundler/build step). `work-tracker-spec.md` is the original spec; the app has since grown beyond it (configurable reminders, pomodoro timers, activity log, recycle bin, auto-launch on login, tray icon).

No test suite or linter is configured.

## Commands

- `npm start` — run the app in dev (`electron .`).
- `npm run dist` — build with electron-builder; output in `dist/`. If it fails with `ENOENT ... elevate.exe` / "Access is denied", it's a transient AV file lock: clear `%LOCALAPPDATA%\electron-builder\Cache\nsis` and retry.
- `better-sqlite3` is a native module compiled for Electron's ABI (via `@electron/rebuild`). It will NOT load under plain system Node. To inspect a DB from a script, use `node:sqlite` (`DatabaseSync`), opened `{ readOnly: true }` first.

## Distribution

The single-file portable exe is unreliable on this machine (self-extracts to a random `%TEMP%` folder on every launch and crashes on an AV file-lock race). The working distributable is the **`dist\win-unpacked` folder copied to `app\`** (gitignored; run `app\WorkTracker.exe`). To update: close the running app, then re-copy `dist\win-unpacked\*` over `app\`. The org blocks installing software, so keep everything portable/no-admin.

**Build + deploy steps** (run manually from the project root in PowerShell; there is no automatic deploy hook):

1. Fully quit the app. It hides to the tray and holds a single-instance lock, so closing the window isn't enough: right-click the tray icon → Quit, or `Get-Process WorkTracker -ErrorAction SilentlyContinue | Stop-Process`. Otherwise the copy fails or the old version keeps showing.
2. `npm run dist`
3. `Copy-Item .\dist\win-unpacked\* .\app -Recurse -Force`
4. Launch `app\WorkTracker.exe`.

Edits to `src/renderer/*` and `main.js` only reach `app\` after steps 2-3. `npm start` runs the working tree directly (also on the real DB, and the single-instance lock applies there too).

If a session's strict sandbox blocks shell commands, Claude can't run these; give the user the commands (or `! npm run dist`) to run themselves.

## Commits & releases

- **Commit messages must follow Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, etc.; `!` or a `BREAKING CHANGE:` footer for majors). `.githooks/commit-msg` rejects anything else, and `npm install` enables it via the `prepare` script (`core.hooksPath .githooks`). Don't use `--no-verify`. Old-style messages like `Add: ...` are rejected.
- **Versioning is automated by release-please** (`.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json`). Don't hand-edit `version` in `package.json`, `CHANGELOG.md`, or tags. Pushes to `main` keep a release PR open (`feat` = minor, `fix` = patch). Merging it tags `vX.Y.Z`, creates the GitHub Release, and the same workflow builds `dist/win-unpacked` and attaches `WorkTracker-vX.Y.Z-win.zip`.
- The workflow is also runnable manually (`workflow_dispatch`) for a dev build that only uploads a `WorkTracker-dev-win.zip` artifact, with no release. There is intentionally no `push: tags` trigger, because tags created by `GITHUB_TOKEN` don't start other workflows.
- Repo setting required: Actions → "Allow GitHub Actions to create and approve pull requests".

## Architecture

- `main.js` — Electron main process: window, tray (app hides to tray rather than quitting; single-instance lock), all `ipcMain.handle` handlers (namespaced `tasks:*`, `comments:*`, `pomodoro:*`, `activity:*`, `reminders:*`, `settings:*`, `config:*`, `data:export|reset`, `notify:show`, `shell:openExternal`), and DB/store wiring in `app.whenReady`.
- `preload.js` — `contextBridge` exposing `window.api.*`; mirrors the IPC channels. `contextIsolation` on, `nodeIntegration` off. Adding a feature = handler in `main.js` + wrapper in `preload.js` + call from the renderer.
- `src/db.js` — schema, migrations, and store classes (`TaskStore`, `CommentStore`, `PomodoroStore`, `ActivityStore`, `ReminderStore`, `SettingsStore`, `ConfigStore`). Schema versioning uses a `getSchemaVersion`/`setSchemaVersion` chain of `if (version < N)` blocks (currently v4); add new migrations to the end of that chain. Task types/priorities/statuses are user-configurable and stored via `ConfigStore` on top of `SettingsStore` (no CHECK constraints). Tasks are soft-deleted (`deleted_at`). `activity_log` is an append-only record of task events feeding the Activity tab.
- `src/dbLocation.js` — DB file location. A pointer file `db-location.json` in `userData` (not the DB itself) holds the user's chosen path; absent = default `userData\work-tracker.db`. Missing custom file falls back to the default with an error box (never silently creates an empty DB). Settings → "Database location" uses `dbLocation:*` IPC: move (copy via `db.backup`), use existing file (validated for a `tasks` table), use default. Every switch writes the pointer and relaunches; the old file is left as a backup.
- `src/reminders.js` — `ReminderScheduler` polls every 30s and fires at most once per HH:MM slot.
- `src/renderer/` — `index.html`, `styles.css`, and `app.js`, a thin ES-module entry (`<script type="module">`) that imports the feature modules under `modules/` and runs `init()`. Folders: `core/` (shared `state`/`CONFIG`, icons, date/format helpers, select helpers), `nav/` (tabs), `tasks/` (task rows, To-do, All tasks, detail, search, recycle bin, quick add), `activity/`, `comments/` (Quill editor vendored under `vendor/quill`, plus `sanitize.js` for comment HTML), `reminders/` (per-task and daily), `pomodoro/`, `settings/` (theme, login item, config lists, DB location, data actions). Mutable cross-module values live on `state` in `core/state.js` (importers can't reassign module bindings); `CONFIG` is mutated in place. Cross-module imports are cyclic by design but only used inside function bodies, so don't call another module's exports at module top level.
- `scripts/generate-icons.js` — generates assets in `assets/`.
- Each folder under `src/` has its own `AGENTS.md` with folder-scoped context (purpose, rules, gotchas). Read the one nearest the code you're changing, and keep it in sync when you change that folder's behaviour or structure.

## Gotchas

- **Login item path:** `app.setLoginItemSettings` must use `process.env.PORTABLE_EXECUTABLE_FILE || process.execPath` (see `settings:setLoginItem` in `main.js`). `process.execPath` is an ephemeral temp path in the portable build. Preserve that fallback.
- **Real user data in dev:** unless `db-location.json` redirects it, `userData` resolves to `%APPDATA%\work-tracker\work-tracker.db` (from package.json `name`, not `productName`), which is the user's live production data. There is no test isolation. Any automated/scripted launch (e.g. Playwright `_electron.launch`) MUST pass `--user-data-dir=<temp-dir>`, or writes will pollute the real DB.
- **Schema migrations that recreate `tasks`:** `comments`/`pomodoro_sessions` reference `tasks` with `ON DELETE CASCADE`. The v2 migration disables `foreign_keys` and swaps via a temp table + DROP + RENAME to avoid cascade-wiping them — follow that pattern for any future table rebuild.
- Renderer timers must keep running while hidden (pomodoro), hence `backgroundThrottling: false`.
