# src/

Application code. Electron's main-process modules live here; the UI is in `renderer/`.

- `db.js` — SQLite schema, migrations (`if (version < N)` chain, currently v4; append new ones at the end) and the store classes (`TaskStore`, `CommentStore`, `PomodoroStore`, `ActivityStore`, `ReminderStore`, `TaskReminderStore`, `SettingsStore`, `ConfigStore`). `openDatabase(dbPath)` takes a full file path.
- `dbLocation.js` — resolves which database file to open. A pointer file `db-location.json` in `userData` holds a custom path; if that file is missing it falls back to the default with a warning instead of creating an empty DB.
- `reminders.js` — `ReminderScheduler`, polls every 30s and fires at most once per HH:MM slot.
- `renderer/` — everything that runs in the browser window. See `renderer/AGENTS.md`.

Rules
- `better-sqlite3` is compiled for Electron's ABI and will not load under plain Node. Inspect a DB from scripts with `node:sqlite`, opened read-only first.
- Tasks are soft-deleted (`deleted_at`). Migrations that rebuild `tasks` must disable `foreign_keys` and swap via temp table + DROP + RENAME, or `ON DELETE CASCADE` wipes comments and pomodoro sessions.
- Main-process code is reached from the renderer only through IPC handlers in `../main.js` and wrappers in `../preload.js`.
