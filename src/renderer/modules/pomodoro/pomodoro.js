import { pad } from '../core/format.js';
import { POMODORO_START_ICON_SVG } from '../core/icons.js';
import { CONFIG, state } from '../core/state.js';
import { playBuzzSound } from './sound.js';
import { renderTaskDetail } from '../tasks/detail.js';
import { refreshAfterTaskChange } from '../tasks/refresh.js';

export const pomodoro = {
  mode: 'focus',
  remaining: 25 * 60,
  running: false,
  timerId: null,
  // Epoch ms marking when the current running phase should hit zero. Ticks
  // recompute `remaining` from this wall-clock target rather than trusting
  // that every tick fires exactly 1s apart — renderer timers can be delayed
  // or coalesced while the window is hidden/unfocused, and this keeps the
  // countdown (and completion detection) accurate regardless.
  endAt: null,
  // Sessions completed *and logged* today — display-only, seeded from the
  // database (see syncTodayFocusCount) so it survives restarts and never
  // gets inflated by a Skip (which doesn't log anything).
  focusCount: 0,
  // Separate from focusCount: drives the short-vs-long break alternation.
  // Incremented by both a real completion and a Skip, since either way a
  // focus slot has passed for cycle-counting purposes.
  cyclePosition: 0,
  // When the current idle mode was set (real completion, Reset, or Skip) —
  // used to detect "a configured daily reset time passed since then" so a
  // break left sitting unstarted overnight doesn't greet you the next day.
  modeSetAt: Date.now(),
  sessionDuration: 25 * 60,
  selectedTaskId: null,
  settings: { focusMin: 25, shortMin: 5, longMin: 15, cycle: 4, resetTime: '00:00' },
};

// Returns the epoch ms of the most recent occurrence of `resetTimeStr`
// (HH:MM, local time) that is not in the future.
function mostRecentResetBoundary(resetTimeStr) {
  const [hh, mm] = (resetTimeStr || '00:00').split(':').map(Number);
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (candidate.getTime() > now.getTime()) candidate.setDate(candidate.getDate() - 1);
  return candidate.getTime();
}

// If idle in a break that was left unstarted since before today's
// configured reset time, snap back to Focus instead of showing yesterday's
// leftover break.
export function checkDayResetForFocus() {
  if (pomodoro.running || pomodoro.mode === 'focus') return;
  if (mostRecentResetBoundary(pomodoro.settings.resetTime) > pomodoro.modeSetAt) {
    pomodoro.mode = 'focus';
    pomodoro.remaining = pomodoroDurationFor('focus');
    pomodoro.endAt = null;
    pomodoro.modeSetAt = Date.now();
    renderPomodoroClock();
  }
}

function pomodoroDurationFor(mode) {
  if (mode === 'focus') return pomodoro.settings.focusMin * 60;
  if (mode === 'short') return pomodoro.settings.shortMin * 60;
  return pomodoro.settings.longMin * 60;
}

function renderPomodoroClock() {
  const m = Math.floor(pomodoro.remaining / 60);
  const s = pomodoro.remaining % 60;
  document.getElementById('pomo-clock').textContent = `${pad(m)}:${pad(s)}`;
  const modeLabel = { focus: 'Focus', short: 'Short Break', long: 'Long Break' }[pomodoro.mode];
  document.getElementById('pomo-mode').textContent = modeLabel;
  document.getElementById('pomo-count').textContent = pomodoro.focusCount;
}

// focusCount is seeded from the database (not just incremented in memory)
// so it reflects the true count for today and survives app restarts —
// otherwise a reload wipes it back to 0 even if sessions ran earlier today.
export async function syncTodayFocusCount() {
  pomodoro.focusCount = await window.api.pomodoro.todayCount();
  renderPomodoroClock();
}

export async function refreshPomodoroTaskOptions() {
  const select = document.getElementById('pomo-task-select');
  const previousValue = select.value;
  const items = await window.api.tasks.activeList();
  select.innerHTML = '<option value="">Select a task...</option>';
  items.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    const ref = t.ref ? ` (${t.ref})` : '';
    opt.textContent = `[${t.type}] ${t.text}${ref}`;
    select.appendChild(opt);
  });
  if (previousValue && items.some((t) => String(t.id) === previousValue)) {
    select.value = previousValue;
  } else {
    pomodoro.selectedTaskId = null;
  }
  updatePomodoroStartAvailability();
}

function updatePomodoroStartAvailability() {
  const select = document.getElementById('pomo-task-select');
  const startBtn = document.getElementById('pomo-start');
  if (!pomodoro.running) {
    startBtn.disabled = !select.value;
  }
}

async function pomodoroTick() {
  if (pomodoro.endAt != null) {
    pomodoro.remaining = Math.max(0, Math.round((pomodoro.endAt - Date.now()) / 1000));
  }
  if (pomodoro.remaining <= 0) {
    await pomodoroComplete();
  }
  renderPomodoroClock();
}

// Never auto-starts the next phase — every phase (focus or break) requires
// an explicit Start click, by design.
async function pomodoroComplete() {
  clearInterval(pomodoro.timerId);
  pomodoro.running = false;

  playBuzzSound();

  let notifyTitle, notifyBody;
  if (pomodoro.mode === 'focus') {
    pomodoro.focusCount += 1;
    pomodoro.cyclePosition += 1;
    if (pomodoro.selectedTaskId) {
      await window.api.pomodoro.recordSession(pomodoro.selectedTaskId, pomodoro.sessionDuration);
      await refreshAfterTaskChange();
      if (state.currentDetailTaskId === pomodoro.selectedTaskId) await renderTaskDetail();
    }
    const isLongBreak = pomodoro.cyclePosition % pomodoro.settings.cycle === 0;
    pomodoro.mode = isLongBreak ? 'long' : 'short';
    notifyTitle = 'Pomodoro complete';
    notifyBody = 'Nice work. Time for a break.';
  } else {
    pomodoro.mode = 'focus';
    notifyTitle = 'Break over';
    notifyBody = 'Back to focus time.';
  }

  // Settle all UI state synchronously (no pending awaits) before the mode
  // flip is visible anywhere else — otherwise there's a window where mode
  // already reads as the new phase but Start/the task select are still
  // disabled from the phase that just ended.
  pomodoro.remaining = pomodoroDurationFor(pomodoro.mode);
  pomodoro.endAt = null;
  pomodoro.modeSetAt = Date.now();
  document.getElementById('pomo-pause').disabled = true;
  document.getElementById('pomo-task-select').disabled = false;
  updatePomodoroStartAvailability();
  renderPomodoroClock();

  // Fire-and-forget: nothing downstream needs to wait on the notification.
  window.api.notify(notifyTitle, notifyBody);
}

// Called when a focus session starts. Fire-and-forget (not awaited by the
// Start click handler) so the countdown timer begins immediately regardless
// of how long this IPC round-trip takes.
async function markTaskInProgressIfNeeded(taskId) {
  const task = await window.api.tasks.get(taskId);
  if (task && task.status !== CONFIG.inProgressStatus) {
    await window.api.tasks.updateStatus(taskId, CONFIG.inProgressStatus);
    await refreshAfterTaskChange();
    if (state.currentDetailTaskId === taskId) await renderTaskDetail();
  }
}

// Shared by the Pomodoro tab's own Start button and the quick-start button
// on task rows — begins a focus/break countdown for the given task.
function startPomodoroForTask(taskId) {
  pomodoro.selectedTaskId = taskId;
  pomodoro.running = true;
  pomodoro.endAt = Date.now() + pomodoro.remaining * 1000;
  if (pomodoro.mode === 'focus') {
    pomodoro.sessionDuration = pomodoro.remaining;
    markTaskInProgressIfNeeded(taskId);
  }
  document.getElementById('pomo-start').disabled = true;
  document.getElementById('pomo-pause').disabled = false;
  document.getElementById('pomo-task-select').disabled = true;
  pomodoro.timerId = setInterval(pomodoroTick, 1000);
}

// Row-level "quick start" — selects the task in the Pomodoro tab's picker,
// starts its timer (unless one is already running, matching the Start
// button's own guard), and switches to the Pomodoro tab. A pending or
// running break is skipped so the timer always starts in focus mode; a
// running focus timer is left alone and the user is told which task it's on.
async function quickStartPomodoro(task) {
  if (pomodoro.running && pomodoro.mode === 'focus') {
    const select = document.getElementById('pomo-task-select');
    const opt = select.selectedOptions[0];
    const name = opt && opt.value ? opt.textContent : task.text;
    alert(`A focus timer is already running on "${name}".`);
    document.querySelector('.tab-btn[data-tab="pomodoro"]').click();
    return;
  }
  if (pomodoro.mode !== 'focus') {
    clearInterval(pomodoro.timerId);
    pomodoro.running = false;
    pomodoro.mode = 'focus';
    pomodoro.remaining = pomodoroDurationFor('focus');
    pomodoro.endAt = null;
    pomodoro.modeSetAt = Date.now();
    renderPomodoroClock();
  }
  await refreshPomodoroTaskOptions();
  const select = document.getElementById('pomo-task-select');
  select.value = String(task.id);
  startPomodoroForTask(task.id);
  document.querySelector('.tab-btn[data-tab="pomodoro"]').click();
}

export function buildPomodoroStartButton(task) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'row-action-btn';
  btn.title = 'Start pomodoro for this task';
  btn.innerHTML = POMODORO_START_ICON_SVG;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await quickStartPomodoro(task);
  });
  return btn;
}

export function setupPomodoro() {
  const taskSelect = document.getElementById('pomo-task-select');
  taskSelect.addEventListener('change', () => {
    pomodoro.selectedTaskId = taskSelect.value ? Number(taskSelect.value) : null;
    updatePomodoroStartAvailability();
  });

  document.getElementById('pomo-start').addEventListener('click', () => {
    if (pomodoro.running || !taskSelect.value) return;
    startPomodoroForTask(Number(taskSelect.value));
  });

  document.getElementById('pomo-pause').addEventListener('click', () => {
    clearInterval(pomodoro.timerId);
    pomodoro.running = false;
    pomodoro.endAt = null;
    updatePomodoroStartAvailability();
    document.getElementById('pomo-pause').disabled = true;
    taskSelect.disabled = false;
  });

  document.getElementById('pomo-reset').addEventListener('click', () => {
    clearInterval(pomodoro.timerId);
    pomodoro.running = false;
    pomodoro.mode = 'focus';
    pomodoro.remaining = pomodoroDurationFor('focus');
    pomodoro.endAt = null;
    pomodoro.modeSetAt = Date.now();
    document.getElementById('pomo-pause').disabled = true;
    taskSelect.disabled = false;
    updatePomodoroStartAvailability();
    renderPomodoroClock();
  });

  // Ends the current stage immediately without crediting/logging it, and
  // moves to the next stage without auto-starting it.
  document.getElementById('pomo-skip').addEventListener('click', () => {
    clearInterval(pomodoro.timerId);
    pomodoro.running = false;
    pomodoro.endAt = null;

    if (pomodoro.mode === 'focus') {
      pomodoro.cyclePosition += 1;
      const isLongBreak = pomodoro.cyclePosition % pomodoro.settings.cycle === 0;
      pomodoro.mode = isLongBreak ? 'long' : 'short';
    } else {
      pomodoro.mode = 'focus';
    }
    pomodoro.remaining = pomodoroDurationFor(pomodoro.mode);
    pomodoro.modeSetAt = Date.now();

    document.getElementById('pomo-pause').disabled = true;
    taskSelect.disabled = false;
    updatePomodoroStartAvailability();
    renderPomodoroClock();
  });

  const focusInput = document.getElementById('pomo-focus-min');
  const shortInput = document.getElementById('pomo-short-min');
  const longInput = document.getElementById('pomo-long-min');
  const cycleInput = document.getElementById('pomo-cycle');

  async function persistSettings() {
    await window.api.settings.set('pomodoro', pomodoro.settings);
  }

  [
    [focusInput, 'focusMin'],
    [shortInput, 'shortMin'],
    [longInput, 'longMin'],
    [cycleInput, 'cycle'],
  ].forEach(([el, key]) => {
    el.addEventListener('change', () => {
      const val = Math.max(1, parseInt(el.value, 10) || 1);
      pomodoro.settings[key] = val;
      el.value = val;
      if (!pomodoro.running && pomodoro.mode === 'focus' && key === 'focusMin') {
        pomodoro.remaining = pomodoroDurationFor('focus');
        renderPomodoroClock();
      }
      persistSettings();
    });
  });

  document.getElementById('pomo-reset-time').addEventListener('change', (e) => {
    pomodoro.settings.resetTime = e.target.value || '00:00';
    persistSettings();
    checkDayResetForFocus();
  });

  renderPomodoroClock();
}

export async function loadPomodoroSettings() {
  const saved = await window.api.settings.get('pomodoro', null);
  if (saved) {
    pomodoro.settings = { ...pomodoro.settings, ...saved };
    document.getElementById('pomo-focus-min').value = pomodoro.settings.focusMin;
    document.getElementById('pomo-short-min').value = pomodoro.settings.shortMin;
    document.getElementById('pomo-long-min').value = pomodoro.settings.longMin;
    document.getElementById('pomo-cycle').value = pomodoro.settings.cycle;
    document.getElementById('pomo-reset-time').value = pomodoro.settings.resetTime || '00:00';
    pomodoro.remaining = pomodoroDurationFor(pomodoro.mode);
    renderPomodoroClock();
  }
}
