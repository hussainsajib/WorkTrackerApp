# modules/activity/

- `activity.js` — the Activity tab: a per-day log of task events plus freeform notes.

Notes
- Data comes from `window.api.activityLog.*`. The log is append-only for task events; only freeform notes (`action === 'note'`) can be edited or deleted.
- Entries are grouped by task; groups are ordered by their most recent entry, entries newest-first. Notes without a task go in one "Notes" group.
- The tab opens on yesterday, unless something is already logged today. `state.activityViewDate` holds the day being viewed and is reset to `null` on every tab activation.
- Day navigation cannot go past `state.todayStr`.
