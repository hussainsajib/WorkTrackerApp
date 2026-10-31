# Work Tracker

A personal Windows desktop task tracker built with Electron and SQLite. It runs entirely offline and keeps all data in a local database.

## Features

- **To-do and Tasks tabs:** configurable task types, priorities and statuses; drag to reorder; soft-delete with a recycle bin.
- **Comments:** rich-text comments on each task (Quill editor).
- **Pomodoro timer:** focus/break cycles per task, with a quick-start button on each task row and per-task time tracking.
- **Activity tab:** an automatic daily log of task events, plus freeform notes you can add, edit and delete for any day.
- **Reminders:** configurable daily and per-task reminders with desktop notifications.
- **Tray icon and auto-launch:** hides to the system tray and can start on login.
- **Export/reset:** export all data as JSON or reset the app.
- **Themes:** match Windows, or force light or dark.
- **Database location:** move the database to another folder, or switch to an existing database file to import or restore it.

## Download

Get the latest `WorkTracker-vX.Y.Z-win.zip` from the [Releases](../../releases) page, extract it, and run `WorkTracker.exe`. No installer or admin rights are needed.

The build is not yet code-signed, so Windows SmartScreen may show "Windows protected your PC". Right-click the zip, choose **Properties**, tick **Unblock** before extracting, or click **More info → Run anyway**.

## Requirements

- Windows
- Node.js and npm

## Getting started

```powershell
npm install
npm start
```

`better-sqlite3` is a native module compiled for Electron's ABI. If it fails to load after `npm install`, rebuild it with `npx electron-rebuild`.

## Building

```powershell
npm run dist
```

Output goes to `dist\`. The `dist\win-unpacked` folder is a portable, no-install build: copy it anywhere and run `WorkTracker.exe`.

## Data

The database is stored at `%APPDATA%\work-tracker\work-tracker.db` by default; change it under Settings → Database location. When running in development (`npm start`) this is the same file the packaged app uses, so be careful with test data. To run a scripted or experimental launch against a throwaway database, pass `--user-data-dir=<temp-dir>`.

## Privacy

Work Tracker runs entirely offline. It has no accounts, telemetry or network calls, and it only opens links you click inside comments in your own browser. Your data stays in the local database file.

## Project layout

| Path | Purpose |
|------|---------|
| `main.js` | Electron main process: window, tray, IPC handlers |
| `preload.js` | `contextBridge` API exposed to the renderer |
| `src/db.js` | SQLite schema, migrations and data stores |
| `src/dbLocation.js` | Resolves and switches the database file location |
| `src/reminders.js` | Reminder scheduler |
| `src/renderer/` | UI (HTML, CSS, vanilla JS) |
| `scripts/generate-icons.js` | Generates the icons in `assets/` |

## License

[MIT](LICENSE)
