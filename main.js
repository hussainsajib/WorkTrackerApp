const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { openDatabase, TaskStore, CommentStore, PomodoroStore, ActivityStore, ReminderStore, TaskReminderStore, SettingsStore, ConfigStore, todayStr, localDayRangeIso } = require('./src/db');
const { ReminderScheduler } = require('./src/reminders');

// Without this, Windows falls back to Electron's default AppUserModelID
// ("electron.app.Electron"), which shows up as the notification popup's
// title/attribution instead of the app's actual name.
app.setAppUserModelId('WorkTracker');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let scheduler = null;

let db, tasks, comments, pomodoro, activity, reminders, taskReminders, settings, config;

function formatMinutes(totalSeconds) {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function createWindow() {
  // No File/Edit/View/Window/Help menu bar — this app has no use for it, and
  // the tray icon's context menu already covers Open/Quit.
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    title: 'Work Tracker',
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The app hides to the tray instead of quitting, and the pomodoro
      // countdown must keep ticking accurately while hidden/unfocused —
      // Electron's default throttles renderer timers once the window isn't
      // visible/focused, which stalls the countdown almost completely.
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Closing the window hides it to the tray instead of quitting, so
  // reminders/pomodoro keep running in the background.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('Work Tracker');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Work Tracker',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function fireNotification(title, body, { taskId } = {}) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') });
  n.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
    if (taskId) sendToRenderer('navigate:task', { taskId });
  });
  n.show();
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function describeDue(dueAt, hasTime) {
  if (!dueAt) return '';
  const d = new Date(dueAt);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return hasTime ? `${date} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : date;
}

function fireTaskReminder(r) {
  const due = describeDue(r.task_due_at, r.task_due_has_time);
  fireNotification('Task reminder', due ? `${r.task_text}\nDue ${due}` : r.task_text, { taskId: r.task_id });
  // Windows toasts can't carry action buttons in Electron, so snooze lives in
  // an in-app banner (and on the task's detail page).
  sendToRenderer('reminder:fired', { reminderId: r.id, taskId: r.task_id, taskText: r.task_text, kind: r.kind });
}

function fireTaskReminderBatch(list) {
  const first = list[0];
  fireNotification('Task reminders', `${list.length} reminders came due (e.g. ${first.task_text})`, { taskId: first.task_id });
}

function setupIpc() {
  ipcMain.handle('tasks:add', (_e, payload) => {
    const result = tasks.addTask({
      ...payload,
      status: payload.status || config.getDefaultStatus(),
    });
    activity.record(result.id, 'created', 'Task created', result.text);
    return result;
  });
  ipcMain.handle('tasks:updateStatus', (_e, { id, status }) => {
    const before = tasks.getTask(id);
    const result = tasks.updateStatus(id, status, { doneStatus: config.getDoneStatus() });
    if (before && before.status !== status) {
      activity.record(id, 'status_changed', `Status: ${before.status} → ${status}`, result.text);
    }
    return result;
  });
  ipcMain.handle('tasks:update', (_e, { id, payload }) => {
    const before = tasks.getTask(id);
    const result = tasks.updateTask(id, payload);
    if (before) {
      const changes = [];
      if (payload.text !== undefined && payload.text !== before.text) changes.push(`text: "${before.text}" → "${payload.text}"`);
      if (payload.type !== undefined && payload.type !== before.type) changes.push(`type: ${before.type} → ${payload.type}`);
      if ((payload.ref || null) !== (before.ref || null)) changes.push(`ref: ${before.ref || '(none)'} → ${payload.ref || '(none)'}`);
      if (payload.priority !== undefined && payload.priority !== before.priority) changes.push(`priority: ${before.priority} → ${payload.priority}`);
      if (payload.due_at !== undefined && (payload.due_at || null) !== (before.due_at || null)) {
        changes.push(`deadline: ${describeDue(before.due_at, before.due_has_time) || '(none)'} → ${describeDue(payload.due_at, payload.due_has_time) || '(none)'}`);
        taskReminders.recomputeForDeadline(id);
      }
      if (changes.length) {
        activity.record(id, 'edited', `Edited — ${changes.join(', ')}`, result.text);
      }
    }
    return result;
  });
  ipcMain.handle('tasks:delete', (_e, { id }) => {
    tasks.deleteTask(id);
    return true;
  });
  ipcMain.handle('tasks:softDelete', (_e, { id }) => tasks.softDeleteTask(id));
  ipcMain.handle('tasks:restore', (_e, { id }) => tasks.restoreTask(id));
  ipcMain.handle('tasks:deletedList', () => tasks.getDeletedTasks());
  ipcMain.handle('tasks:allView', () => tasks.getAllTasksView({
    priorities: config.getPriorities(),
  }));
  ipcMain.handle('tasks:search', (_e, { term }) => tasks.searchTasks(term));
  ipcMain.handle('tasks:today', () => todayStr());
  ipcMain.handle('tasks:get', (_e, { id }) => tasks.getTask(id));
  ipcMain.handle('tasks:activeList', () => tasks.getActiveTasks({
    priorities: config.getPriorities(),
    doneStatus: config.getDoneStatus(),
  }));

  ipcMain.handle('config:getAll', () => config.getAll());
  ipcMain.handle('config:setTaskTypes', (_e, { list }) => { config.setTaskTypes(list); return config.getTaskTypes(); });
  ipcMain.handle('config:setPriorities', (_e, { list }) => { config.setPriorities(list); return config.getPriorities(); });

  ipcMain.handle('comments:list', (_e, { taskId }) => comments.list(taskId));
  ipcMain.handle('comments:add', (_e, { taskId, text }) => {
    const result = comments.add(taskId, text);
    const task = tasks.getTask(taskId);
    activity.record(taskId, 'comment_added', 'Comment added', task ? task.text : null);
    return result;
  });
  ipcMain.handle('comments:remove', (_e, { id }) => {
    comments.remove(id);
    return true;
  });

  ipcMain.handle('pomodoro:recordSession', (_e, { taskId, durationSeconds }) => {
    pomodoro.recordSession(taskId, durationSeconds);
    const task = taskId ? tasks.getTask(taskId) : null;
    activity.record(taskId || null, 'pomodoro_completed', `Pomodoro completed (${formatMinutes(durationSeconds)})`, task ? task.text : null);
    return true;
  });
  ipcMain.handle('pomodoro:taskStats', (_e, { taskId }) => pomodoro.getStatsForTask(taskId));
  ipcMain.handle('pomodoro:todayCount', () => pomodoro.getTodaySessionCount(localDayRangeIso()));

  ipcMain.handle('activity:listForDate', (_e, { dateStr }) => activity.listForDate(dateStr));
  ipcMain.handle('activity:datesWithActivity', () => activity.listDatesWithActivity());
  ipcMain.handle('activity:addNote', (_e, { text, dateStr }) => {
    activity.addNote(text, dateStr);
    return true;
  });
  ipcMain.handle('activity:updateNote', (_e, { id, text }) => {
    activity.updateNote(id, text);
    return true;
  });
  ipcMain.handle('activity:remove', (_e, { id }) => {
    activity.remove(id);
    return true;
  });

  ipcMain.handle('reminders:list', () => reminders.list());
  ipcMain.handle('reminders:add', (_e, { time }) => reminders.add(time));
  ipcMain.handle('reminders:remove', (_e, { id }) => {
    reminders.remove(id);
    return true;
  });
  ipcMain.handle('reminders:setEnabled', (_e, { id, enabled }) => {
    reminders.setEnabled(id, enabled);
    return true;
  });

  ipcMain.handle('taskReminders:list', (_e, { taskId }) => taskReminders.listForTask(taskId));
  ipcMain.handle('taskReminders:activeTaskIds', () => taskReminders.taskIdsWithActive());
  ipcMain.handle('taskReminders:add', (_e, { taskId, kind, params }) => taskReminders.add(taskId, kind, params));
  ipcMain.handle('taskReminders:setEnabled', (_e, { id, enabled }) => taskReminders.setEnabled(id, enabled));
  ipcMain.handle('taskReminders:remove', (_e, { id }) => {
    taskReminders.remove(id);
    return true;
  });
  ipcMain.handle('taskReminders:snooze', (_e, { id, minutes, untilIso }) => {
    const until = untilIso || new Date(Date.now() + (minutes || 10) * 60000).toISOString();
    return taskReminders.snooze(id, until);
  });

  ipcMain.handle('settings:get', (_e, { key, fallback }) => settings.get(key, fallback));
  ipcMain.handle('settings:set', (_e, { key, value }) => {
    settings.set(key, value);
    return true;
  });

  ipcMain.handle('settings:getLoginItem', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('settings:setLoginItem', (_e, { enabled }) => {
    // The portable build self-extracts to a fresh %TEMP% folder on every
    // launch, so process.execPath is ephemeral. electron-builder's portable
    // target exposes the stable original exe path via this env var instead.
    const stablePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({ openAtLogin: enabled, path: stablePath });
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('notify:show', (_e, { title, body }) => {
    fireNotification(title, body);
    return true;
  });

  // Links inside rich-text comments must open in the user's real browser,
  // not navigate this app's own window. Protocol allowlist guards against
  // a pasted javascript:/file: URI being invoked.
  ipcMain.handle('shell:openExternal', (_e, { url }) => {
    if (typeof url === 'string' && /^(https?|mailto):/i.test(url)) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('data:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Work Tracker data',
      defaultPath: `work-tracker-export-${todayStr()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    const allTasks = db.prepare('SELECT * FROM tasks ORDER BY created_date ASC, created_at ASC').all();
    const allComments = db.prepare('SELECT * FROM comments ORDER BY task_id ASC, created_at ASC').all();
    const allSessions = db.prepare('SELECT * FROM pomodoro_sessions ORDER BY task_id ASC, completed_at ASC').all();
    const allActivity = db.prepare('SELECT * FROM activity_log ORDER BY created_date ASC, created_at ASC').all();

    const commentsByTask = {};
    allComments.forEach((c) => {
      (commentsByTask[c.task_id] = commentsByTask[c.task_id] || []).push({ text: c.text, createdAt: c.created_at });
    });
    const sessionsByTask = {};
    allSessions.forEach((s) => {
      (sessionsByTask[s.task_id] = sessionsByTask[s.task_id] || []).push({ durationSeconds: s.duration_seconds, completedAt: s.completed_at });
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      config: config.getAll(),
      tasks: allTasks.map((t) => ({
        text: t.text,
        type: t.type,
        priority: t.priority,
        status: t.status,
        ref: t.ref,
        createdDate: t.created_date,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        completedAt: t.completed_at,
        dueAt: t.due_at,
        dueHasTime: !!t.due_has_time,
        reminders: taskReminders.listForTask(t.id).map((r) => ({ kind: r.kind, params: r.params, enabled: !!r.enabled })),
        comments: commentsByTask[t.id] || [],
        pomodoroSessions: sessionsByTask[t.id] || [],
      })),
      reminders: reminders.list().map((r) => ({ time: r.time, enabled: !!r.enabled })),
      pomodoroSettings: settings.get('pomodoro', null),
      activityLog: allActivity.map((a) => ({
        taskId: a.task_id,
        taskText: a.task_text,
        action: a.action,
        detail: a.detail,
        createdAt: a.created_at,
      })),
    };

    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle('data:reset', (_e, { alsoResetSettings }) => {
    db.prepare('DELETE FROM tasks').run(); // cascades to comments + pomodoro_sessions
    // activity_log doesn't cascade from tasks (task_id is ON DELETE SET NULL,
    // not CASCADE), and freeform notes have no task_id at all — clear it explicitly.
    db.prepare('DELETE FROM activity_log').run();
    if (alsoResetSettings) {
      db.prepare('DELETE FROM reminders').run();
      // Keep _schemaVersion so the one-time migration doesn't needlessly re-run.
      db.prepare("DELETE FROM settings WHERE key != '_schemaVersion'").run();
    }
    return true;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  db = openDatabase(app.getPath('userData'));
  tasks = new TaskStore(db);
  comments = new CommentStore(db);
  pomodoro = new PomodoroStore(db);
  activity = new ActivityStore(db);
  reminders = new ReminderStore(db);
  taskReminders = new TaskReminderStore(db);
  settings = new SettingsStore(db);
  config = new ConfigStore(settings);

  setupIpc();
  createWindow();
  createTray();

  scheduler = new ReminderScheduler({
    reminderStore: reminders,
    taskReminderStore: taskReminders,
    doneStatus: config.getDoneStatus(),
    onFire: () => {
      fireNotification('Work Tracker', "Reminder: log today's work.");
    },
    onTaskReminder: fireTaskReminder,
    onTaskReminderBatch: fireTaskReminderBatch,
  });
  scheduler.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (scheduler) scheduler.stop();
  if (db) db.close();
});

app.on('window-all-closed', () => {
  // Keep running in the tray on all platforms for this app.
});
