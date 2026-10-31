# modules/reminders/

Two separate reminder systems. Don't confuse them.

- `dailyReminders.js` — Settings tab: times of day (HH:MM) that fire a generic "log your work" notification every day.
- `taskReminders.js` — per-task reminders on the task detail panel, plus the in-app banner shown when one fires.

Task reminder kinds (stored with `params`): `absolute` (`at`), `before_deadline` (`offsetMin`), `recurring` (`every`: daily/weekdays/weekly/interval, `time`, optional `until`), `nag` (`everyMin`, until the task is done). `before_deadline` needs a deadline, so it is disabled in the form when none is set and `state.currentDetailDueAt` is tracked to re-render when the deadline changes.

Snoozing: `snoozeReminder(id, how)` takes minutes (a number) or `'tomorrow'` (09:00 local the next day).

Scheduling and firing happen in the main process (`../../../reminders.js`, polling every 30s). This folder is only the UI and the `window.api.reminders.*` / `window.api.taskReminders.*` calls.
