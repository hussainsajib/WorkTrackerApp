const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  tasks: {
    add: (payload) => ipcRenderer.invoke('tasks:add', payload),
    updateStatus: (id, status) => ipcRenderer.invoke('tasks:updateStatus', { id, status }),
    update: (id, payload) => ipcRenderer.invoke('tasks:update', { id, payload }),
    remove: (id) => ipcRenderer.invoke('tasks:softDelete', { id }),
    permanentDelete: (id) => ipcRenderer.invoke('tasks:delete', { id }),
    restore: (id) => ipcRenderer.invoke('tasks:restore', { id }),
    deletedList: () => ipcRenderer.invoke('tasks:deletedList'),
    allView: () => ipcRenderer.invoke('tasks:allView'),
    search: (term) => ipcRenderer.invoke('tasks:search', { term }),
    today: () => ipcRenderer.invoke('tasks:today'),
    get: (id) => ipcRenderer.invoke('tasks:get', { id }),
    activeList: () => ipcRenderer.invoke('tasks:activeList'),
  },
  comments: {
    list: (taskId) => ipcRenderer.invoke('comments:list', { taskId }),
    add: (taskId, text) => ipcRenderer.invoke('comments:add', { taskId, text }),
    remove: (id) => ipcRenderer.invoke('comments:remove', { id }),
  },
  pomodoro: {
    recordSession: (taskId, durationSeconds) => ipcRenderer.invoke('pomodoro:recordSession', { taskId, durationSeconds }),
    taskStats: (taskId) => ipcRenderer.invoke('pomodoro:taskStats', { taskId }),
    todayCount: () => ipcRenderer.invoke('pomodoro:todayCount'),
  },
  activityLog: {
    listForDate: (dateStr) => ipcRenderer.invoke('activity:listForDate', { dateStr }),
    datesWithActivity: () => ipcRenderer.invoke('activity:datesWithActivity'),
    addNote: (text, dateStr) => ipcRenderer.invoke('activity:addNote', { text, dateStr }),
    updateNote: (id, text) => ipcRenderer.invoke('activity:updateNote', { id, text }),
    remove: (id) => ipcRenderer.invoke('activity:remove', { id }),
  },
  reminders: {
    list: () => ipcRenderer.invoke('reminders:list'),
    add: (time) => ipcRenderer.invoke('reminders:add', { time }),
    remove: (id) => ipcRenderer.invoke('reminders:remove', { id }),
    setEnabled: (id, enabled) => ipcRenderer.invoke('reminders:setEnabled', { id, enabled }),
  },
  taskReminders: {
    list: (taskId) => ipcRenderer.invoke('taskReminders:list', { taskId }),
    activeTaskIds: () => ipcRenderer.invoke('taskReminders:activeTaskIds'),
    add: (taskId, kind, params) => ipcRenderer.invoke('taskReminders:add', { taskId, kind, params }),
    setEnabled: (id, enabled) => ipcRenderer.invoke('taskReminders:setEnabled', { id, enabled }),
    remove: (id) => ipcRenderer.invoke('taskReminders:remove', { id }),
    snooze: (id, minutes, untilIso) => ipcRenderer.invoke('taskReminders:snooze', { id, minutes, untilIso }),
  },
  onNavigateTask: (cb) => ipcRenderer.on('navigate:task', (_e, p) => cb(p)),
  onReminderFired: (cb) => ipcRenderer.on('reminder:fired', (_e, p) => cb(p)),
  settings: {
    get: (key, fallback) => ipcRenderer.invoke('settings:get', { key, fallback }),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    getLoginItem: () => ipcRenderer.invoke('settings:getLoginItem'),
    setLoginItem: (enabled) => ipcRenderer.invoke('settings:setLoginItem', { enabled }),
  },
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  config: {
    getAll: () => ipcRenderer.invoke('config:getAll'),
    setTaskTypes: (list) => ipcRenderer.invoke('config:setTaskTypes', { list }),
    setPriorities: (list) => ipcRenderer.invoke('config:setPriorities', { list }),
  },
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    reset: (alsoResetSettings) => ipcRenderer.invoke('data:reset', { alsoResetSettings }),
  },
  dbLocation: {
    get: () => ipcRenderer.invoke('dbLocation:get'),
    move: () => ipcRenderer.invoke('dbLocation:move'),
    useExisting: () => ipcRenderer.invoke('dbLocation:useExisting'),
    useDefault: () => ipcRenderer.invoke('dbLocation:useDefault'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url }),
  },
});
