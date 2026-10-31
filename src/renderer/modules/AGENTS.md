# src/renderer/modules/

Feature code for the renderer, as ES modules grouped by area. `../app.js` imports from here and calls the `setup*` functions at startup.

| Folder | Area |
|---|---|
| `core/` | Shared state, constants and pure helpers; imported by everything |
| `nav/` | Tab switching |
| `tasks/` | Task rows, To-do, All tasks, task detail, search, recycle bin, quick add |
| `activity/` | Activity tab |
| `comments/` | Task comments and the Quill editor |
| `reminders/` | Per-task reminders and the daily reminders in Settings |
| `pomodoro/` | Pomodoro timer |
| `settings/` | Settings tab blocks |

Conventions
- Each feature file exposes `render*` functions (build DOM from data) and a `setup*` function (wires event listeners once, called from `init()` in `../app.js`).
- Cross-module values that change at runtime live on the `state` object in `core/state.js`, because importers cannot reassign a module's bindings. `CONFIG` is mutated in place (`Object.assign`), never reassigned.
- Imports are cyclic by design (for example `tasks/taskRow.js`, `tasks/detail.js` and `nav/tabs.js`). That is safe only while every cross-module call happens inside a function body. Never call another module's export at module top level.
- Import with explicit relative paths and the `.js` extension.
- Code was moved from the old single `app.js` unchanged. Keep behaviour changes separate from moves.
