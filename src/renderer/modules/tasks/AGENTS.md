# modules/tasks/

Everything about tasks and the lists that show them.

- `taskRow.js` — `renderTaskRow` and swipe-to-delete (`wrapWithSwipeToDelete`). Shared by To-do, All tasks and Search.
- `refresh.js` — `refreshAfterTaskChange()`: re-renders To-do, plus All tasks and the pomodoro task picker if their tabs are active. Call it after any task mutation.
- `quickAdd.js` — the add-task form on the To-do tab.
- `todo.js` — open tasks; in-progress first, Blocked in a separate group.
- `allTasks.js` — every task grouped by created date, and the "copy summary" text.
- `detail.js` — task detail panel: edits save on blur/change (`saveDetailField`).
- `search.js` — search page, filter checkboxes, sorting.
- `recycleBin.js` — soft-deleted tasks, restore and delete forever.

Rules
- Tasks are soft-deleted; "delete forever" is the only hard delete.
- Task types, priorities and statuses are user-configurable (`CONFIG` in `../core/state.js`). Never hard-code them except `Blocked`, which the UI treats specially.
- Use `populateSelectWithCurrent` when editing an existing task so a removed config value isn't silently replaced.
- A pointer click on a row opens the detail view; interactive children (select, button) must call `stopPropagation`, and swipe handling ignores them.
