// Shared renderer state. ES module bindings can't be reassigned by importers,
// so mutable globals live as properties on `state`; CONFIG is mutated in place.
export const CONFIG = { taskTypes: [], priorities: [], statuses: [], doneStatus: 'Done', inProgressStatus: 'In progress' };

export const state = {
  todayStr: null,
  lastListTab: 'todo', // which tab to return to from task detail
  currentDetailTaskId: null,
  activityViewDate: null, // the day currently shown in the Activity tab
  reminderTaskIds: new Set(), // tasks with at least one live reminder (bell icon)
  currentDetailDueAt: null,
};
