import { setupActivityControls } from './modules/activity/activity.js';
import { setupComments } from './modules/comments/comments.js';
import { state } from './modules/core/state.js';
import { setupTabs, updateQuickAddVisibility } from './modules/nav/tabs.js';
import { checkDayResetForFocus, loadPomodoroSettings, pomodoro, refreshPomodoroTaskOptions, setupPomodoro, syncTodayFocusCount } from './modules/pomodoro/pomodoro.js';
import { renderReminders, setupReminders } from './modules/reminders/dailyReminders.js';
import { setupReminderEvents } from './modules/reminders/taskReminders.js';
import { loadConfig, setupConfigForms } from './modules/settings/configLists.js';
import { setupDataActions } from './modules/settings/dataActions.js';
import { setupDbLocation } from './modules/settings/dbLocation.js';
import { setupLoginItem } from './modules/settings/loginItem.js';
import { setupTheme } from './modules/settings/theme.js';
import { setupTasksControls } from './modules/tasks/allTasks.js';
import { setupTaskDetail } from './modules/tasks/detail.js';
import { setupQuickAdd } from './modules/tasks/quickAdd.js';
import { setupRecycleBinPage } from './modules/tasks/recycleBin.js';
import { setupSearchPage } from './modules/tasks/search.js';
import { renderTodo } from './modules/tasks/todo.js';

async function init() {
  await setupTheme();
  state.todayStr = await window.api.tasks.today();
  await loadConfig();
  setupTabs();
  setupQuickAdd();
  setupTasksControls();
  setupActivityControls();
  setupTaskDetail();
  setupReminderEvents();
  setupComments();
  setupPomodoro();
  setupReminders();
  setupSearchPage();
  setupRecycleBinPage();
  setupConfigForms();
  setupDataActions();
  await setupDbLocation();
  await setupLoginItem();
  await loadPomodoroSettings();
  await renderTodo();
  await renderReminders();
  await refreshPomodoroTaskOptions();
  await syncTodayFocusCount();
  // Only on the initial load — not on later tab-activation resyncs, which
  // would otherwise clobber cyclePosition after a same-session Skip.
  pomodoro.cyclePosition = pomodoro.focusCount;
  checkDayResetForFocus();
  updateQuickAddVisibility();
  document.getElementById('qa-text').focus();
}

init();
