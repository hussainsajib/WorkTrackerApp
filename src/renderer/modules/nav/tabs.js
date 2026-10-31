import { renderActivity } from '../activity/activity.js';
import { state } from '../core/state.js';
import { checkDayResetForFocus, refreshPomodoroTaskOptions, syncTodayFocusCount } from '../pomodoro/pomodoro.js';
import { renderTasks } from '../tasks/allTasks.js';
import { renderRecycleBin } from '../tasks/recycleBin.js';
import { runSearch } from '../tasks/search.js';
import { renderTodo } from '../tasks/todo.js';

export function updateQuickAddVisibility() {
  const isTodo = document.getElementById('tab-todo').classList.contains('active');
  document.getElementById('quick-add-section').hidden = !isTodo;
}

export async function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
  updateQuickAddVisibility();
  // The app is normally never fully restarted (tray/login-item background
  // process), so cached module-level "today" state would otherwise stay
  // frozen at whatever day the process happened to launch on. Refresh it
  // on every tab switch so date-sensitive views notice a day rollover.
  state.todayStr = await window.api.tasks.today();
  if (tabName === 'todo') renderTodo();
  if (tabName === 'tasks') renderTasks();
  if (tabName === 'activity') { state.activityViewDate = null; renderActivity(); }
  if (tabName === 'pomodoro') { refreshPomodoroTaskOptions(); syncTodayFocusCount(); checkDayResetForFocus(); }
  if (tabName === 'search') runSearch();
  if (tabName === 'recyclebin') renderRecycleBin();
}

export function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lastListTab = btn.dataset.tab;
      activateTab(btn.dataset.tab);
    });
  });

  document.getElementById('detail-back').addEventListener('click', () => {
    activateTab(state.lastListTab);
  });
}
