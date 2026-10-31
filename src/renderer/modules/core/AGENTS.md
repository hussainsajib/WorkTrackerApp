# modules/core/

Shared leaf modules. They must not import from any feature folder (`tasks/`, `pomodoro/`, and so on), which keeps the import graph acyclic at the bottom.

- `state.js` — `CONFIG` (task types, priorities, statuses, done/in-progress status names; mutated in place) and `state` (`todayStr`, `lastListTab`, `currentDetailTaskId`, `activityViewDate`, `reminderTaskIds`, `currentDetailDueAt`). Add new cross-module mutable values to `state`, not as exported `let`s.
- `format.js` — date and duration helpers (`toDateStr`, `parseDateStr`, `friendlyDate`, `friendlyDateTime`, `dueFromInputs`, `dueInfo`, `formatDuration`, `pad`). Dates are local `YYYY-MM-DD` strings. A deadline with no time means 23:59 local.
- `dom.js` — `<select>` population helpers. `populateSelectWithCurrent` keeps a record's current value even if it was since removed from the configured list.
- `icons.js` — inline SVG strings.
