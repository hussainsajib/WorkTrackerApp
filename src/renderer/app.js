let CONFIG = { taskTypes: [], priorities: [], statuses: [], doneStatus: 'Done', inProgressStatus: 'In progress' };

const POMODORO_START_ICON_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 6H9M20 21H19M19 21H5M19 21C19 18.4898 17.7877 16.1341 15.7451 14.675L12 12M5 21H4M5 21C5 18.4898 6.21228 16.1341 8.25493 14.675L12 12M20 3H19M19 3H5M19 3C19 5.51022 17.7877 7.86592 15.7451 9.32495L12 12M5 3H4M5 3C5 5.51022 6.21228 7.86592 8.25493 9.32495L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const TRASH_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
const EDIT_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';

let todayStr = null;
let lastListTab = 'todo'; // which tab to return to from task detail
let currentDetailTaskId = null;
let activityViewDate = null; // the day currently shown in the Activity tab

function pad(n) { return String(n).padStart(2, '0'); }

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function friendlyDate(dateStr) {
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function friendlyDateTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

let reminderTaskIds = new Set(); // tasks with at least one live reminder (bell icon)

// Date + optional time inputs -> {due_at, due_has_time}. A date with no time
// means "end of that day" (local 23:59).
function dueFromInputs(dateVal, timeVal) {
  if (!dateVal) return { due_at: null, due_has_time: 0 };
  const d = parseDateStr(dateVal);
  if (timeVal) {
    const [h, m] = timeVal.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(23, 59, 0, 0);
  }
  return { due_at: d.toISOString(), due_has_time: timeVal ? 1 : 0 };
}

// Label + css class for a task's deadline, or null if it has none.
function dueInfo(task) {
  if (!task.due_at) return null;
  const d = new Date(task.due_at);
  const dayDiff = Math.round((parseDateStr(toDateStr(d)) - parseDateStr(todayStr)) / 86400000);
  const timePart = task.due_has_time ? ` ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  const overdue = !task.completed_at && d.getTime() < Date.now();
  let when;
  if (dayDiff === 0) when = 'today';
  else if (dayDiff === 1) when = 'tomorrow';
  else if (dayDiff === -1) when = 'yesterday';
  else when = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (overdue) return { label: `Overdue · was due ${when}${timePart}`, cls: 'overdue' };
  return { label: `Due ${when}${timePart}`, cls: dayDiff === 0 ? 'due-today' : '' };
}

function formatDuration(totalSeconds) {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Populates a <select> from a configured list, keeping the previous
// selection if it's still valid, else defaulting to the first item.
function populateSelectSticky(selectEl, list) {
  const prev = selectEl.value;
  selectEl.innerHTML = '';
  list.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
  selectEl.value = list.includes(prev) ? prev : list[0];
}

// Populates a <select> from a configured list for an EXISTING record, adding
// the record's current value as an extra option if it's since been removed
// from the config — so editing never silently changes an unrelated field.
function populateSelectWithCurrent(selectEl, list, currentValue) {
  selectEl.innerHTML = '';
  const values = currentValue && !list.includes(currentValue) ? [currentValue, ...list] : list;
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
  selectEl.value = currentValue;
}

// ---------- Tabs ----------
function updateQuickAddVisibility() {
  const isTodo = document.getElementById('tab-todo').classList.contains('active');
  document.getElementById('quick-add-section').hidden = !isTodo;
}

async function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
  updateQuickAddVisibility();
  // The app is normally never fully restarted (tray/login-item background
  // process), so cached module-level "today" state would otherwise stay
  // frozen at whatever day the process happened to launch on. Refresh it
  // on every tab switch so date-sensitive views notice a day rollover.
  todayStr = await window.api.tasks.today();
  if (tabName === 'todo') renderTodo();
  if (tabName === 'tasks') renderTasks();
  if (tabName === 'activity') { activityViewDate = null; renderActivity(); }
  if (tabName === 'pomodoro') { refreshPomodoroTaskOptions(); syncTodayFocusCount(); checkDayResetForFocus(); }
  if (tabName === 'search') runSearch();
  if (tabName === 'recyclebin') renderRecycleBin();
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      lastListTab = btn.dataset.tab;
      activateTab(btn.dataset.tab);
    });
  });

  document.getElementById('detail-back').addEventListener('click', () => {
    activateTab(lastListTab);
  });
}

// ---------- Quick add ----------
function setupQuickAdd() {
  const form = document.getElementById('quick-add-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('qa-text').value.trim();
    if (!text) return;
    const type = document.getElementById('qa-type').value;
    const ref = document.getElementById('qa-ref').value.trim();
    const priority = document.getElementById('qa-priority').value;
    const due = dueFromInputs(document.getElementById('qa-due-date').value, document.getElementById('qa-due-time').value);
    await window.api.tasks.add({ text, type, ref, priority, ...due });
    document.getElementById('qa-text').value = '';
    document.getElementById('qa-due-date').value = '';
    document.getElementById('qa-due-time').value = '';
    document.getElementById('qa-ref').value = '';
    document.getElementById('qa-text').focus();
    await refreshAfterTaskChange();
  });
}

async function refreshAfterTaskChange() {
  await renderTodo();
  if (document.getElementById('tab-tasks').classList.contains('active')) await renderTasks();
  if (document.getElementById('tab-pomodoro').classList.contains('active')) await refreshPomodoroTaskOptions();
}

// ---------- Task row rendering ----------
function statusClass(status) {
  if (status === CONFIG.doneStatus) return 'done-status';
  if (status === 'Blocked') return 'blocked-status';
  return '';
}

function renderTaskRow(task, { showDateBadge, showPomodoroStart } = {}) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.addEventListener('click', () => openTaskDetail(task.id));

  if (task.priority && task.priority !== 'Neutral') {
    const pDot = document.createElement('span');
    pDot.className = `priority-dot ${task.priority}`;
    pDot.title = `${task.priority} priority`;
    row.appendChild(pDot);
  }

  const main = document.createElement('div');
  main.className = 'task-main';
  const textEl = document.createElement('div');
  textEl.className = 'task-text';
  textEl.textContent = task.text;
  main.appendChild(textEl);

  const metaParts = [];
  const due = dueInfo(task);
  if (due) {
    const dueEl = document.createElement('div');
    dueEl.className = `task-due ${due.cls}`;
    dueEl.textContent = (reminderTaskIds.has(task.id) ? '\u{1F514} ' : '') + due.label;
    main.appendChild(dueEl);
  } else if (reminderTaskIds.has(task.id)) {
    metaParts.push('\u{1F514} reminder set');
  }
  if (task.ref) metaParts.push(task.ref);
  if (showDateBadge && task.created_date !== todayStr) {
    metaParts.push(`from ${friendlyDate(task.created_date)}`);
  }
  if (task.pomodoro_count > 0) {
    metaParts.push(`${task.pomodoro_count} pomodoro${task.pomodoro_count === 1 ? '' : 's'} · ${formatDuration(task.pomodoro_seconds)} worked`);
  }
  if (task.comment_count > 0) {
    metaParts.push(`${task.comment_count} comment${task.comment_count === 1 ? '' : 's'}`);
  }
  if (metaParts.length) {
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = metaParts.join(' · ');
    main.appendChild(meta);
  }
  row.appendChild(main);

  const badge = document.createElement('span');
  badge.className = `type-badge ${task.type}`;
  badge.textContent = task.type;
  row.appendChild(badge);

  const select = document.createElement('select');
  populateSelectWithCurrent(select, CONFIG.statuses, task.status);
  select.className = `status-select ${statusClass(task.status)}`;
  select.addEventListener('click', (e) => e.stopPropagation());
  select.addEventListener('change', async (e) => {
    e.stopPropagation();
    await window.api.tasks.updateStatus(task.id, select.value);
    select.className = `status-select ${statusClass(select.value)}`;
    await refreshAfterTaskChange();
  });
  row.appendChild(select);

  if (showPomodoroStart) {
    row.appendChild(buildPomodoroStartButton(task));
  }

  return wrapWithSwipeToDelete(row, task);
}

// Swipe-left-to-delete: wraps a task row in a clipped container with a red
// "delete" panel behind it. Dragging the row far enough left and releasing
// soft-deletes the task (moves it to the Recycle Bin); a shorter drag springs
// back. Native <select>/<button> clicks inside the row still work normally —
// only drags past a small movement threshold suppress the row's own
// click-to-open-detail handler.
function wrapWithSwipeToDelete(row, task) {
  const wrapper = document.createElement('div');
  wrapper.className = 'task-row-wrapper';

  const bg = document.createElement('div');
  bg.className = 'task-row-swipe-bg';
  bg.innerHTML = TRASH_ICON_SVG;

  wrapper.appendChild(bg);
  wrapper.appendChild(row);

  let startX = 0;
  let dx = 0;
  let dragging = false;
  let moved = false;

  const deleteThreshold = () => Math.min(120, (wrapper.offsetWidth || 320) * 0.35);

  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Don't hijack clicks on interactive controls inside the row (status
    // select, pomodoro-start button) — setPointerCapture below also
    // retargets the resulting synthetic 'click' event to the capturing
    // element, which would swallow the control's own click and instead fire
    // the row's click-to-open-detail handler.
    if (e.target.closest('button, select, a, input, textarea')) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    dx = 0;
    row.style.transition = 'none';
    bg.style.transition = 'none';
    try { row.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });

  row.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 6) moved = true;
    dx = Math.min(0, delta);
    row.style.transform = `translateX(${dx}px)`;
    bg.style.width = `${-dx}px`;
  });

  async function endDrag() {
    if (!dragging) return;
    dragging = false;
    row.style.transition = 'transform 0.2s ease';
    bg.style.transition = 'width 0.2s ease';
    if (-dx > deleteThreshold()) {
      row.style.transform = 'translateX(-100%)';
      bg.style.width = '100%';
      setTimeout(async () => {
        await window.api.tasks.remove(task.id);
        wrapper.remove();
        await refreshAfterTaskChange();
      }, 200);
    } else {
      row.style.transform = 'translateX(0)';
      bg.style.width = '0';
    }
  }

  row.addEventListener('pointerup', endDrag);
  row.addEventListener('pointercancel', endDrag);

  // Capture phase + stopImmediatePropagation so this runs before (and can
  // cancel) the row's own bubble-phase click-to-open-detail listener.
  row.addEventListener('click', (e) => {
    if (moved) {
      e.stopImmediatePropagation();
      e.preventDefault();
      moved = false;
    }
  }, true);

  return wrapper;
}

// ---------- To Do view (all not-done tasks) ----------
async function renderTodo() {
  reminderTaskIds = new Set(await window.api.taskReminders.activeTaskIds());
  const list = document.getElementById('todo-list');
  const countLabel = document.getElementById('todo-count-label');
  const blockedDivider = document.getElementById('todo-blocked-divider');
  const blockedGroup = document.getElementById('todo-blocked-group');
  const blockedList = document.getElementById('blocked-list');
  const blockedCountLabel = document.getElementById('todo-blocked-count-label');

  const items = await window.api.tasks.activeList();
  countLabel.textContent = `${items.length} open task${items.length === 1 ? '' : 's'}`;

  const blocked = items.filter((t) => t.status === 'Blocked');
  const active = items.filter((t) => t.status !== 'Blocked');

  // activeList() already arrives priority/created_at sorted from SQL; filter()
  // preserves relative order, so splitting into in-progress/rest and concatenating
  // keeps existing secondary ordering intact within each group.
  const inProgress = active.filter((t) => t.status === CONFIG.inProgressStatus);
  const rest = active.filter((t) => t.status !== CONFIG.inProgressStatus);
  const ordered = inProgress.concat(rest);

  list.innerHTML = '';
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing open right now. Add a task above.';
    list.appendChild(empty);
  } else {
    ordered.forEach((task) => list.appendChild(renderTaskRow(task, { showDateBadge: true, showPomodoroStart: true })));
  }

  blockedList.innerHTML = '';
  if (blocked.length > 0) {
    blockedCountLabel.textContent = `(${blocked.length} task${blocked.length === 1 ? '' : 's'})`;
    blocked.forEach((task) => blockedList.appendChild(renderTaskRow(task, { showDateBadge: true, showPomodoroStart: true })));
    blockedGroup.hidden = false;
    blockedDivider.hidden = false;
  } else {
    blockedGroup.hidden = true;
    blockedDivider.hidden = true;
  }
}

// ---------- Tasks view (everything ever created) ----------
async function renderTasks() {
  const items = await window.api.tasks.allView();
  const content = document.getElementById('tasks-content');
  const countLabel = document.getElementById('tasks-count-label');
  countLabel.textContent = `${items.length} task${items.length === 1 ? '' : 's'} total`;
  content.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No tasks yet.';
    content.appendChild(empty);
    return;
  }

  const byDate = {};
  items.forEach((t) => {
    (byDate[t.created_date] = byDate[t.created_date] || []).push(t);
  });

  Object.keys(byDate).sort().reverse().forEach((dateStr) => {
    const dayTasks = byDate[dateStr];
    const group = document.createElement('div');
    group.className = 'day-group';
    const heading = document.createElement('h3');
    heading.textContent = friendlyDate(dateStr);
    const summary = document.createElement('span');
    summary.className = 'day-summary';
    summary.textContent = `(${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'})`;
    heading.appendChild(summary);
    group.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'task-list';
    dayTasks.forEach((task) => list.appendChild(renderTaskRow(task, { showDateBadge: false })));
    group.appendChild(list);
    content.appendChild(group);
  });
}

function buildTasksSummaryText(items) {
  const byDate = {};
  items.forEach((t) => {
    (byDate[t.created_date] = byDate[t.created_date] || []).push(t);
  });

  const lines = [];
  lines.push(`Work Summary — All Tasks (exported ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })})`);
  lines.push('');

  Object.keys(byDate).sort().reverse().forEach((dateStr) => {
    lines.push(`${friendlyDate(dateStr)}:`);
    byDate[dateStr].forEach((t) => {
      const ref = t.ref ? ` (${t.ref})` : '';
      lines.push(`  - [${t.type}] ${t.text}${ref} — ${t.status}`);
    });
    lines.push('');
  });

  const totals = {};
  items.forEach((t) => { totals[t.type] = (totals[t.type] || 0) + 1; });
  lines.push('Totals: ' + Object.entries(totals).map(([k, v]) => `${k}: ${v}`).join(', '));

  return lines.join('\n');
}

function setupTasksControls() {
  document.getElementById('tasks-copy-btn').addEventListener('click', async () => {
    const items = await window.api.tasks.allView();
    const text = buildTasksSummaryText(items);
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('tasks-copy-btn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

// ---------- Activity ----------
function activityActionLabel(entry) {
  if (entry.action === 'note') return `Note: ${entry.detail}`;
  return entry.detail || entry.action;
}

// Groups a day's flat entry list by task (freeform notes land in one
// taskless "Notes" group). Each group's entries are newest-first, and
// groups themselves are ordered by their own most recent entry, so
// whichever task you last touched appears at the top.
function groupActivityByTask(items) {
  const groups = new Map();
  items.forEach((entry) => {
    const key = entry.task_id != null ? entry.task_id : 'notes';
    if (!groups.has(key)) {
      groups.set(key, { taskId: entry.task_id, taskText: entry.task_text, entries: [] });
    }
    groups.get(key).entries.push(entry);
  });

  const groupList = Array.from(groups.values());
  groupList.forEach((g) => g.entries.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  groupList.sort((a, b) => b.entries[0].created_at.localeCompare(a.entries[0].created_at));
  return groupList;
}

function renderActivityEntryRow(entry) {
  const row = document.createElement('div');
  row.className = 'activity-entry-row';

  const time = document.createElement('span');
  time.className = 'activity-entry-time';
  time.textContent = friendlyDateTime(entry.created_at);
  row.appendChild(time);

  const detail = document.createElement('span');
  detail.className = 'activity-entry-detail';
  detail.textContent = activityActionLabel(entry);
  row.appendChild(detail);

  if (entry.action === 'note') {
    const editBtn = document.createElement('button');
    editBtn.className = 'secondary icon-btn activity-entry-btn';
    editBtn.title = 'Edit note';
    editBtn.innerHTML = EDIT_ICON_SVG;
    editBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'activity-entry-edit';
      input.value = entry.detail;
      detail.replaceWith(input);
      input.focus();
      let done = false;
      const finish = async (save) => {
        if (done) return;
        done = true;
        const text = input.value.trim();
        if (save && text && text !== entry.detail) {
          await window.api.activityLog.updateNote(entry.id, text);
        }
        await renderActivity();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    });
    row.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'secondary icon-btn activity-entry-btn';
    delBtn.title = 'Delete note';
    delBtn.innerHTML = TRASH_ICON_SVG;
    delBtn.addEventListener('click', async () => {
      await window.api.activityLog.remove(entry.id);
      await renderActivity();
    });
    row.appendChild(delBtn);
  }

  return row;
}

function renderActivityGroup(group) {
  const wrap = document.createElement('div');
  wrap.className = 'activity-task-group';

  const heading = document.createElement('h3');
  if (group.taskId) {
    const link = document.createElement('span');
    link.className = 'activity-task-link';
    link.textContent = group.taskText || 'Task';
    link.addEventListener('click', () => openTaskDetail(group.taskId));
    heading.appendChild(link);
  } else {
    heading.textContent = 'Notes';
  }
  wrap.appendChild(heading);

  const entries = document.createElement('div');
  entries.className = 'activity-entries';
  group.entries.forEach((entry) => entries.appendChild(renderActivityEntryRow(entry)));
  wrap.appendChild(entries);

  return wrap;
}

async function renderActivity() {
  if (!activityViewDate) {
    // Default to yesterday, unless something's already been logged today —
    // then show today instead.
    const todaysItems = await window.api.activityLog.listForDate(todayStr);
    activityViewDate = todaysItems.length > 0
      ? todayStr
      : toDateStr(new Date(parseDateStr(todayStr).getTime() - 24 * 60 * 60 * 1000));
  }

  const heading = document.getElementById('activity-date-heading');
  heading.textContent = friendlyDate(activityViewDate);
  document.getElementById('activity-next-btn').disabled = activityViewDate >= todayStr;

  const list = document.getElementById('activity-list');
  const items = await window.api.activityLog.listForDate(activityViewDate);
  list.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No activity logged for this day.';
    list.appendChild(empty);
    return;
  }

  groupActivityByTask(items).forEach((group) => list.appendChild(renderActivityGroup(group)));
}

function buildActivitySummaryText(items, dateStr) {
  const lines = [];
  lines.push(`Activity — ${friendlyDate(dateStr)}`);
  lines.push('');
  groupActivityByTask(items).forEach((group) => {
    lines.push(group.taskId ? group.taskText : 'Notes');
    group.entries.forEach((entry) => {
      lines.push(`  ${friendlyDateTime(entry.created_at)}\t${activityActionLabel(entry)}`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

function setupActivityControls() {
  document.getElementById('activity-prev-btn').addEventListener('click', async () => {
    activityViewDate = toDateStr(new Date(parseDateStr(activityViewDate).getTime() - 24 * 60 * 60 * 1000));
    await renderActivity();
  });

  document.getElementById('activity-next-btn').addEventListener('click', async () => {
    if (activityViewDate >= todayStr) return;
    activityViewDate = toDateStr(new Date(parseDateStr(activityViewDate).getTime() + 24 * 60 * 60 * 1000));
    await renderActivity();
  });

  document.getElementById('activity-today-btn').addEventListener('click', async () => {
    activityViewDate = todayStr;
    await renderActivity();
  });

  document.getElementById('activity-copy-btn').addEventListener('click', async () => {
    const items = await window.api.activityLog.listForDate(activityViewDate);
    const text = buildActivitySummaryText(items, activityViewDate);
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('activity-copy-btn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });

  document.getElementById('activity-note-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('activity-note-input');
    const text = input.value.trim();
    if (!text) return;
    await window.api.activityLog.addNote(text, activityViewDate);
    input.value = '';
    await renderActivity();
  });
}

// ---------- Task detail ----------
async function openTaskDetail(taskId) {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) {
    lastListTab = activeBtn.dataset.tab;
  } else if (document.getElementById('tab-search').classList.contains('active')) {
    lastListTab = 'search';
  }

  // The single comment editor is shared across tasks, so stash the unposted
  // draft under the task being left and restore the one for the task opening.
  if (taskId !== currentDetailTaskId) {
    saveCommentDraft();
    currentDetailTaskId = taskId;
    ensureCommentEditor();
    restoreCommentDraft();
  }
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-task-detail'));
  updateQuickAddVisibility();

  await renderTaskDetail();
}

const commentDrafts = new Map(); // taskId -> Quill Delta (unposted comment)

function saveCommentDraft() {
  if (!commentQuill || currentDetailTaskId == null) return;
  if (commentQuill.getText().trim().length === 0) commentDrafts.delete(currentDetailTaskId);
  else commentDrafts.set(currentDetailTaskId, commentQuill.getContents());
}

function restoreCommentDraft() {
  const draft = commentDrafts.get(currentDetailTaskId);
  if (draft) commentQuill.setContents(draft, 'silent');
  else commentQuill.setText('', 'silent');
}

async function renderTaskDetail() {
  ensureCommentEditor();

  const task = await window.api.tasks.get(currentDetailTaskId);
  if (!task) {
    activateTab(lastListTab);
    return;
  }

  document.getElementById('detail-type-badge').textContent = task.type;
  document.getElementById('detail-type-badge').className = `type-badge ${task.type}`;

  const prioBadge = document.getElementById('detail-priority-badge');
  prioBadge.textContent = task.priority;
  prioBadge.className = `priority-badge ${task.priority}`;

  document.getElementById('detail-text').value = task.text;
  populateSelectWithCurrent(document.getElementById('detail-type'), CONFIG.taskTypes, task.type);
  populateSelectWithCurrent(document.getElementById('detail-priority'), CONFIG.priorities, task.priority);
  populateSelectWithCurrent(document.getElementById('detail-status'), CONFIG.statuses, task.status);
  document.getElementById('detail-ref').value = task.ref || '';
  document.getElementById('detail-created').textContent = `Created ${friendlyDateTime(task.created_at)}`;

  if (task.due_at) {
    const d = new Date(task.due_at);
    document.getElementById('detail-due-date').value = toDateStr(d);
    document.getElementById('detail-due-time').value = task.due_has_time ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  } else {
    document.getElementById('detail-due-date').value = '';
    document.getElementById('detail-due-time').value = '';
  }
  currentDetailDueAt = task.due_at || null;
  await renderTaskReminders();

  document.getElementById('detail-pomo-count').textContent = task.pomodoro_count || 0;
  document.getElementById('detail-time-worked').textContent = formatDuration(task.pomodoro_seconds || 0);

  await renderComments();
}

async function saveDetailField() {
  if (!currentDetailTaskId) return;
  const text = document.getElementById('detail-text').value.trim();
  if (!text) return;
  const type = document.getElementById('detail-type').value;
  const priority = document.getElementById('detail-priority').value;
  const ref = document.getElementById('detail-ref').value.trim();
  const due = dueFromInputs(document.getElementById('detail-due-date').value, document.getElementById('detail-due-time').value);
  await window.api.tasks.update(currentDetailTaskId, { text, type, ref, priority, ...due });
  if (due.due_at !== currentDetailDueAt) {
    currentDetailDueAt = due.due_at;
    await renderTaskReminders(); // relative reminders follow the new deadline
  }

  const prioBadge = document.getElementById('detail-priority-badge');
  prioBadge.textContent = priority;
  prioBadge.className = `priority-badge ${priority}`;
  const typeBadge = document.getElementById('detail-type-badge');
  typeBadge.textContent = type;
  typeBadge.className = `type-badge ${type}`;
}

function setupTaskDetail() {
  document.getElementById('detail-text').addEventListener('blur', saveDetailField);
  document.getElementById('detail-type').addEventListener('change', saveDetailField);
  document.getElementById('detail-priority').addEventListener('change', saveDetailField);
  document.getElementById('detail-ref').addEventListener('blur', saveDetailField);
  document.getElementById('detail-due-date').addEventListener('change', saveDetailField);
  document.getElementById('detail-due-time').addEventListener('change', saveDetailField);
  document.getElementById('detail-due-clear').addEventListener('click', () => {
    document.getElementById('detail-due-date').value = '';
    document.getElementById('detail-due-time').value = '';
    saveDetailField();
  });
  setupTaskReminders();

  document.getElementById('detail-status').addEventListener('change', async () => {
    if (!currentDetailTaskId) return;
    await window.api.tasks.updateStatus(currentDetailTaskId, document.getElementById('detail-status').value);
  });
}

// ---------- Task reminders ----------
let currentDetailDueAt = null;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatOffset(min) {
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? '' : 's'}`;
  return `${min} min`;
}

function describeTaskReminder(r) {
  const p = r.params || {};
  switch (r.kind) {
    case 'absolute': return `At ${friendlyDateTime(p.at)}`;
    case 'before_deadline': return `${formatOffset(p.offsetMin || 0)} before deadline`;
    case 'recurring': {
      const rule = { daily: 'Every day', weekdays: 'Weekdays', weekly: `Every ${WEEKDAY_NAMES[p.weekday ?? 1]}`, interval: `Every ${p.n || 1} days` }[p.every] || 'Repeating';
      return `${rule} at ${p.time}${p.until ? ` until ${p.until}` : ''}`;
    }
    case 'nag': return `Every ${p.everyMin} min until done`;
    default: return r.kind;
  }
}

async function renderTaskReminders() {
  if (!currentDetailTaskId) return;
  const list = document.getElementById('task-reminder-list');
  const items = await window.api.taskReminders.list(currentDetailTaskId);
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div class="muted-note">No reminders for this task.</div>';
  }
  items.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'task-reminder-row';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!r.enabled;
    toggle.title = 'Enabled';
    toggle.addEventListener('change', async () => {
      await window.api.taskReminders.setEnabled(r.id, toggle.checked);
      await renderTaskReminders();
    });
    row.appendChild(toggle);

    const info = document.createElement('div');
    info.className = 'task-reminder-info';
    const title = document.createElement('div');
    title.textContent = describeTaskReminder(r);
    const sub = document.createElement('div');
    sub.className = 'task-meta';
    if (!r.enabled) sub.textContent = 'Paused';
    else if (r.next_fire_at) sub.textContent = `Next: ${friendlyDateTime(r.next_fire_at)}`;
    else sub.textContent = r.last_fired_at ? 'Done — already fired' : 'Not scheduled (set a deadline?)';
    info.append(title, sub);
    row.appendChild(info);

    if (r.enabled && r.next_fire_at) {
      [['+1h', 60], ['Tomorrow 9:00', 'tomorrow']].forEach(([label, v]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'secondary';
        b.textContent = `Snooze ${label}`;
        b.addEventListener('click', async () => {
          await snoozeReminder(r.id, v);
          await renderTaskReminders();
        });
        row.appendChild(b);
      });
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'secondary';
    del.title = 'Remove reminder';
    del.innerHTML = TRASH_ICON_SVG;
    del.classList.add('icon-btn');
    del.addEventListener('click', async () => {
      await window.api.taskReminders.remove(r.id);
      await renderTaskReminders();
    });
    row.appendChild(del);
    list.appendChild(row);
  });
}

// minutes (number) or 'tomorrow' (9:00 local the next day)
async function snoozeReminder(id, how) {
  if (how === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return window.api.taskReminders.snooze(id, null, d.toISOString());
  }
  return window.api.taskReminders.snooze(id, how);
}

function setupTaskReminders() {
  const kindSel = document.getElementById('tr-kind');
  const everySel = document.getElementById('tr-every');
  const syncForm = () => {
    document.querySelectorAll('#task-reminder-form [data-kind]').forEach((el) => {
      el.hidden = el.dataset.kind !== kindSel.value;
    });
    document.getElementById('tr-weekday').hidden = everySel.value !== 'weekly';
    document.getElementById('tr-n').hidden = everySel.value !== 'interval';
  };
  kindSel.addEventListener('change', syncForm);
  everySel.addEventListener('change', syncForm);
  syncForm();

  const modal = document.getElementById('reminder-modal');
  const closeModal = () => { modal.hidden = true; };
  document.getElementById('tr-open-modal').addEventListener('click', () => {
    document.getElementById('tr-error').hidden = true;
    // Default to the next whole hour so the picker starts on something valid.
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    document.getElementById('tr-at').value = `${toDateStr(d)}T${pad(d.getHours())}:00`;
    // "Before the deadline" only makes sense once a deadline exists.
    kindSel.querySelector('option[value="before_deadline"]').disabled = !currentDetailDueAt;
    if (!currentDetailDueAt && kindSel.value === 'before_deadline') kindSel.value = 'absolute';
    syncForm();
    modal.hidden = false;
    kindSel.focus();
  });
  document.getElementById('tr-cancel').addEventListener('click', closeModal);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  document.getElementById('task-reminder-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('tr-error');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    err.hidden = true;
    const kind = kindSel.value;
    let params;
    if (kind === 'absolute') {
      const at = document.getElementById('tr-at').value;
      if (!at) return fail('Pick a date and time.');
      params = { at: new Date(at).toISOString() };
    } else if (kind === 'before_deadline') {
      if (!currentDetailDueAt) return fail('Set a deadline first.');
      const n = parseInt(document.getElementById('tr-offset').value, 10);
      if (!(n > 0)) return fail('Enter how long before the deadline.');
      params = { offsetMin: n * parseInt(document.getElementById('tr-offset-unit').value, 10) };
    } else if (kind === 'recurring') {
      const time = document.getElementById('tr-time').value;
      if (!time) return fail('Pick a time of day.');
      const every = everySel.value;
      params = { every, time };
      if (every === 'weekly') params.weekday = parseInt(document.getElementById('tr-weekday').value, 10);
      if (every === 'interval') {
        params.n = Math.max(1, parseInt(document.getElementById('tr-n').value, 10) || 1);
        params.startDate = todayStr;
      }
      const until = document.getElementById('tr-until').value;
      if (until) params.until = until;
    } else {
      const everyMin = parseInt(document.getElementById('tr-nag-min').value, 10);
      if (!(everyMin > 0)) return fail('Enter a number of minutes.');
      params = { everyMin };
    }
    await window.api.taskReminders.add(currentDetailTaskId, kind, params);
    closeModal();
    await renderTaskReminders();
  });
}

// In-app banner shown when a task reminder fires: open the task or snooze.
function setupReminderEvents() {
  window.api.onNavigateTask(({ taskId }) => openTaskDetail(taskId));
  window.api.onReminderFired(({ reminderId, taskId, taskText }) => {
    const banner = document.getElementById('reminder-banner');
    banner.hidden = false;
    banner.innerHTML = '';
    const msg = document.createElement('span');
    msg.textContent = `\u{1F514} ${taskText}`;
    banner.appendChild(msg);
    const add = (label, handler) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', async () => { await handler(); banner.hidden = true; });
      banner.appendChild(b);
    };
    add('Open', () => openTaskDetail(taskId));
    add('Snooze 10 min', () => snoozeReminder(reminderId, 10));
    add('Snooze 1 hr', () => snoozeReminder(reminderId, 60));
    add('Tomorrow', () => snoozeReminder(reminderId, 'tomorrow'));
    add('Dismiss', async () => {});
    if (document.getElementById('tab-task-detail').classList.contains('active') && currentDetailTaskId === taskId) renderTaskReminders();
  });
}

// ---------- Comments ----------

// Only these tags/attributes survive into a saved comment. Applied on save
// (not just on render) since that's the actual trust boundary — anything
// pasted into the editor from elsewhere could carry scripts/styles we don't
// want persisted.
const COMMENT_ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN', 'UL', 'OL', 'LI', 'A']);

function sanitizeCommentNode(parent) {
  Array.from(parent.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      parent.removeChild(node);
      return;
    }
    const tag = node.tagName;
    if (!COMMENT_ALLOWED_TAGS.has(tag)) {
      // Unwrap: drop the element but keep its content.
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      return;
    }

    // Capture the specific safe values BEFORE stripping every attribute.
    let safeStyle = null;
    let safeHref = null;
    if (tag === 'SPAN') {
      const parts = [];
      if (node.style.color) parts.push(`color: ${node.style.color}`);
      if (node.style.backgroundColor) parts.push(`background-color: ${node.style.backgroundColor}`);
      if (parts.length) safeStyle = parts.join('; ');
    }
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(href)) safeHref = href;
    }

    Array.from(node.attributes).forEach((attr) => node.removeAttribute(attr.name));

    if (tag === 'A') {
      if (!safeHref) {
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
        return;
      }
      node.setAttribute('href', safeHref);
    }
    if (safeStyle) node.setAttribute('style', safeStyle);

    sanitizeCommentNode(node);
  });
}

function sanitizeCommentHtml(rawHtml) {
  const container = document.createElement('div');
  container.innerHTML = rawHtml;
  sanitizeCommentNode(container);
  return container.innerHTML;
}

// Comments created before this feature are plain text with no tags at all —
// render those escaped (preserving line breaks) rather than as HTML.
function renderCommentContent(container, rawText) {
  const looksLikeRichHtml = /<(p|br|strong|b|em|i|u|s|span|ul|ol|li|a)[ >]/i.test(rawText);
  if (looksLikeRichHtml) {
    container.innerHTML = sanitizeCommentHtml(rawText);
  } else {
    const escaped = rawText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    container.innerHTML = escaped.replace(/\n/g, '<br>');
  }
}

let commentQuill = null;

// Lazy — constructing Quill while its container is display:none (true
// whenever the task-detail panel hasn't been opened yet) breaks its internal
// layout measurements, so this only runs once the panel is actually visible.
function ensureCommentEditor() {
  if (commentQuill) return;
  commentQuill = new Quill('#comment-editor', {
    theme: 'snow',
    placeholder: 'Add a comment...',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
      ],
    },
  });

  // Auto-linkify a URL found in HTML clipboard content (e.g. pasting a
  // paragraph of rendered text copied from a web page).
  commentQuill.clipboard.addMatcher(Node.TEXT_NODE, (node, delta) => {
    const text = node.data;
    if (typeof text !== 'string' || !URL_PATTERN.test(text)) return delta;
    return { ops: linkifyPlainText(text) };
  });

  // Quill's matcher pipeline above only runs when the clipboard provides
  // text/html — copying a bare URL from a browser's address bar (or any
  // plain-text source) typically provides ONLY text/plain, which Quill
  // converts to a Delta without ever visiting the matcher. Handling the
  // plain-text case explicitly here is what actually makes "paste a link"
  // reliably turn into a hyperlink.
  //
  // This must be registered on an ANCESTOR (document) in the capture phase,
  // not on commentQuill.root directly — Quill's own paste listener is
  // already registered on that same root element, and a same-element
  // listener's preventDefault() does NOT stop a sibling listener on that
  // element from also firing (that needs stopPropagation, which only works
  // if this handler runs first — guaranteed here since capture-phase
  // listeners on an ancestor always run before the target's own listeners).
  document.addEventListener('paste', (e) => {
    if (!commentQuill || !commentQuill.root.contains(e.target)) return;
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    if (clipboardData.getData('text/html').trim()) return; // let the matcher above handle real HTML paste
    const text = clipboardData.getData('text/plain');
    if (!text || !URL_PATTERN.test(text)) return;
    e.preventDefault();
    e.stopPropagation();
    const range = commentQuill.getSelection(true) || { index: commentQuill.getLength(), length: 0 };
    commentQuill.deleteText(range.index, range.length, 'user');
    commentQuill.updateContents({ ops: [{ retain: range.index }, ...linkifyPlainText(text)] }, 'user');
    commentQuill.setSelection(range.index + text.length, 0, 'user');
  }, true);
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function linkifyPlainText(text) {
  URL_PATTERN.lastIndex = 0;
  const ops = [];
  let lastIndex = 0;
  let match;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) ops.push({ insert: text.slice(lastIndex, match.index) });
    ops.push({ insert: match[0], attributes: { link: match[0] } });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) ops.push({ insert: text.slice(lastIndex) });
  return ops;
}

async function renderComments() {
  const list = document.getElementById('comment-list');
  const items = await window.api.comments.list(currentDetailTaskId);
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No comments yet.';
    list.appendChild(empty);
    return;
  }
  items.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'comment-row';

    const time = document.createElement('div');
    time.className = 'comment-time';
    const timeText = document.createElement('span');
    timeText.textContent = friendlyDateTime(c.created_at);
    time.appendChild(timeText);

    const remove = document.createElement('button');
    remove.className = 'comment-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      await window.api.comments.remove(c.id);
      await renderComments();
      await renderTodo();
    });
    time.appendChild(remove);
    row.appendChild(time);

    const text = document.createElement('div');
    text.className = 'comment-text';
    renderCommentContent(text, c.text);
    row.appendChild(text);

    list.appendChild(row);
  });
}

function setupComments() {
  // Delegated: comment rows are re-created on every render, so a single
  // listener on the container covers all current and future links.
  document.getElementById('comment-list').addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    window.api.shell.openExternal(link.getAttribute('href'));
  });

  const commentForm = document.getElementById('comment-add-form');
  // Ctrl+Enter posts the comment (alternative to the "Add comment" button).
  commentForm.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // keep Quill from also inserting a newline
      commentForm.requestSubmit();
    }
  }, true);

  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentDetailTaskId || !commentQuill) return;
    if (commentQuill.getText().trim().length === 0) return;
    const html = sanitizeCommentHtml(commentQuill.root.innerHTML);
    await window.api.comments.add(currentDetailTaskId, html);
    commentQuill.setText('');
    commentDrafts.delete(currentDetailTaskId);
    await renderComments();
    await renderTodo();
  });
}

// ---------- Pomodoro ----------
const pomodoro = {
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
function checkDayResetForFocus() {
  if (pomodoro.running || pomodoro.mode === 'focus') return;
  if (mostRecentResetBoundary(pomodoro.settings.resetTime) > pomodoro.modeSetAt) {
    pomodoro.mode = 'focus';
    pomodoro.remaining = pomodoroDurationFor('focus');
    pomodoro.endAt = null;
    pomodoro.modeSetAt = Date.now();
    renderPomodoroClock();
  }
}

// Short buzzer played whenever a phase (focus or break) ends — synthesized with the
// Web Audio API so no bundled sound file/asset is needed.
async function playBuzzSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    // Chromium can auto-suspend audio contexts on hidden/backgrounded
    // documents — this is exactly when we most need the buzz to play.
    await ctx.resume();
    const now = ctx.currentTime;
    const buzzCount = 3;
    const buzzDuration = 0.14;
    const gap = 0.18;
    for (let i = 0; i < buzzCount; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 220;
      const start = now + i * gap;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, start + buzzDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + buzzDuration + 0.02);
    }
    setTimeout(() => ctx.close(), (buzzCount * gap + 0.5) * 1000);
  } catch (err) {
    console.error('Failed to play buzz sound', err);
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
async function syncTodayFocusCount() {
  pomodoro.focusCount = await window.api.pomodoro.todayCount();
  renderPomodoroClock();
}

async function refreshPomodoroTaskOptions() {
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
      if (currentDetailTaskId === pomodoro.selectedTaskId) await renderTaskDetail();
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
    if (currentDetailTaskId === taskId) await renderTaskDetail();
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

function buildPomodoroStartButton(task) {
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

function setupPomodoro() {
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

async function loadPomodoroSettings() {
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

// ---------- Reminders ----------
async function renderReminders() {
  const list = document.getElementById('reminder-list');
  const items = await window.api.reminders.list();
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No reminders set yet.';
    list.appendChild(empty);
    return;
  }
  items.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'reminder-row';

    const time = document.createElement('span');
    time.className = 'reminder-time';
    time.textContent = r.time;
    row.appendChild(time);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!r.enabled;
    toggle.addEventListener('change', async () => {
      await window.api.reminders.setEnabled(r.id, toggle.checked);
    });
    row.appendChild(toggle);

    const label = document.createElement('span');
    label.textContent = r.enabled ? 'enabled' : 'disabled';
    label.className = 'hint';
    toggle.addEventListener('change', () => { label.textContent = toggle.checked ? 'enabled' : 'disabled'; });
    row.appendChild(label);

    const remove = document.createElement('button');
    remove.className = 'remove-btn';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      await window.api.reminders.remove(r.id);
      renderReminders();
    });
    row.appendChild(remove);

    list.appendChild(row);
  });
}

function setupReminders() {
  document.getElementById('reminder-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('reminder-time-input');
    if (!input.value) return;
    await window.api.reminders.add(input.value);
    input.value = '';
    renderReminders();
  });
}

// ---------- Startup / login item ----------
async function setupLoginItem() {
  const toggle = document.getElementById('login-item-toggle');
  toggle.checked = await window.api.settings.getLoginItem();
  toggle.addEventListener('change', async () => {
    const result = await window.api.settings.setLoginItem(toggle.checked);
    toggle.checked = result;
  });
}

// ---------- Search page ----------
let checkedTypes = new Set();
let checkedPriorities = new Set();
let checkedStatuses = new Set();
let searchDebounceTimer = null;

function renderFilterCheckboxes(containerId, list, checkedSet) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  list.forEach((value) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checkedSet.has(value);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) checkedSet.add(value); else checkedSet.delete(value);
      runSearch();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(value));
    container.appendChild(label);
  });
}

// Resets filters to "everything shown" — used only when opening search fresh.
function initSearchFilters() {
  checkedTypes = new Set(CONFIG.taskTypes);
  checkedPriorities = new Set(CONFIG.priorities);
  checkedStatuses = new Set(CONFIG.statuses);
  renderFilterCheckboxes('search-filter-taskTypes', CONFIG.taskTypes, checkedTypes);
  renderFilterCheckboxes('search-filter-priorities', CONFIG.priorities, checkedPriorities);
  renderFilterCheckboxes('search-filter-statuses', CONFIG.statuses, checkedStatuses);
}

function sortSearchResults(items, sortMode) {
  const sorted = [...items];
  if (sortMode === 'date-asc') {
    sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } else if (sortMode === 'priority') {
    const rank = {};
    CONFIG.priorities.forEach((p, i) => { rank[p] = i; });
    sorted.sort((a, b) => (rank[a.priority] ?? 999) - (rank[b.priority] ?? 999));
  } else if (sortMode === 'type') {
    sorted.sort((a, b) => a.type.localeCompare(b.type));
  } else {
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at)); // date-desc (default)
  }
  return sorted;
}

async function runSearch() {
  const term = document.getElementById('search-page-input').value.trim();
  const resultsEl = document.getElementById('search-page-results');
  const countEl = document.getElementById('search-result-count');
  const sortMode = document.getElementById('search-sort-select').value;

  const items = await window.api.tasks.search(term);
  const filtered = items.filter((t) => checkedTypes.has(t.type) && checkedPriorities.has(t.priority) && checkedStatuses.has(t.status));
  const sorted = sortSearchResults(filtered, sortMode);

  resultsEl.innerHTML = '';
  countEl.textContent = `${sorted.length} result${sorted.length === 1 ? '' : 's'}`;
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No matches.';
    resultsEl.appendChild(empty);
    return;
  }
  sorted.forEach((task) => resultsEl.appendChild(renderTaskRow(task, { showDateBadge: true })));
}

// Separate from lastListTab: the search page's own "Back" target must
// survive a nested detail-view visit, which otherwise overwrites lastListTab
// with 'search' (so detail's Back correctly returns to search).
let searchReturnTab = 'todo';

function openSearchPage() {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) searchReturnTab = activeBtn.dataset.tab;
  initSearchFilters();
  activateTab('search');
  document.getElementById('search-page-input').focus();
}

function setupSearchPage() {
  document.getElementById('open-search-btn').addEventListener('click', openSearchPage);
  document.getElementById('search-back').addEventListener('click', () => activateTab(searchReturnTab));

  document.getElementById('search-page-input').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(runSearch, 250);
  });

  document.getElementById('search-filters-btn').addEventListener('click', () => {
    const panel = document.getElementById('search-filters-panel');
    panel.hidden = !panel.hidden;
  });

  document.getElementById('search-sort-select').addEventListener('change', runSearch);
}

// ---------- Recycle Bin ----------
// Separate from lastListTab, same reasoning as searchReturnTab: a nested
// detail-view visit must not clobber where the Recycle Bin's Back returns to.
let recycleBinReturnTab = 'todo';

function openRecycleBinPage() {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) recycleBinReturnTab = activeBtn.dataset.tab;
  activateTab('recyclebin');
}

function setupRecycleBinPage() {
  document.getElementById('open-recyclebin-btn').addEventListener('click', openRecycleBinPage);
  document.getElementById('recyclebin-back').addEventListener('click', () => activateTab(recycleBinReturnTab));
}

async function renderRecycleBin() {
  const list = document.getElementById('recyclebin-list');
  const countLabel = document.getElementById('recyclebin-count-label');

  const items = await window.api.tasks.deletedList();
  countLabel.textContent = `${items.length} deleted task${items.length === 1 ? '' : 's'}`;

  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing in the recycle bin.';
    list.appendChild(empty);
    return;
  }
  items.forEach((task) => list.appendChild(renderRecycleBinRow(task)));
}

function renderRecycleBinRow(task) {
  const row = document.createElement('div');
  row.className = 'task-row static';

  const main = document.createElement('div');
  main.className = 'task-main';
  const textEl = document.createElement('div');
  textEl.className = 'task-text';
  textEl.textContent = task.text;
  main.appendChild(textEl);

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  meta.textContent = `Deleted ${friendlyDateTime(task.deleted_at)}`;
  main.appendChild(meta);
  row.appendChild(main);

  const badge = document.createElement('span');
  badge.className = `type-badge ${task.type}`;
  badge.textContent = task.type;
  row.appendChild(badge);

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'secondary';
  restoreBtn.textContent = 'Restore';
  restoreBtn.addEventListener('click', async () => {
    await window.api.tasks.restore(task.id);
    await renderRecycleBin();
    await refreshAfterTaskChange();
  });
  row.appendChild(restoreBtn);

  const deleteForeverBtn = document.createElement('button');
  deleteForeverBtn.className = 'danger';
  deleteForeverBtn.textContent = 'Delete forever';
  deleteForeverBtn.addEventListener('click', async () => {
    if (confirm('Permanently delete this task? This cannot be undone.')) {
      await window.api.tasks.permanentDelete(task.id);
      await renderRecycleBin();
    }
  });
  row.appendChild(deleteForeverBtn);

  return row;
}

// ---------- Configurable lists (task types / priorities / statuses) ----------
const CONFIG_SETTERS = {
  taskTypes: (list) => window.api.config.setTaskTypes(list),
  priorities: (list) => window.api.config.setPriorities(list),
};

function renderConfigList(key, list) {
  const container = document.getElementById(`config-${key}-list`);
  container.innerHTML = '';
  list.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'config-item';

    const name = document.createElement('span');
    name.className = 'config-item-name';
    name.textContent = item;
    row.appendChild(name);

    const upBtn = document.createElement('button');
    upBtn.textContent = 'Up';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', () => reorderConfigItem(key, idx, idx - 1));
    row.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.textContent = 'Down';
    downBtn.disabled = idx === list.length - 1;
    downBtn.addEventListener('click', () => reorderConfigItem(key, idx, idx + 1));
    row.appendChild(downBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'config-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.disabled = list.length <= 1;
    removeBtn.title = list.length <= 1 ? 'At least one is required' : 'Remove';
    removeBtn.addEventListener('click', () => removeConfigItem(key, idx));
    row.appendChild(removeBtn);

    container.appendChild(row);
  });
}

async function applyConfigListChange(key, list) {
  const updated = await CONFIG_SETTERS[key](list);
  CONFIG[key] = updated;
  renderConfigList(key, updated);
  await afterConfigChange();
}

function reorderConfigItem(key, fromIdx, toIdx) {
  const list = [...CONFIG[key]];
  const [item] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, item);
  applyConfigListChange(key, list);
}

function removeConfigItem(key, idx) {
  if (CONFIG[key].length <= 1) return;
  const list = [...CONFIG[key]];
  list.splice(idx, 1);
  applyConfigListChange(key, list);
}

function addConfigItem(key, name) {
  if (CONFIG[key].includes(name)) return;
  applyConfigListChange(key, [...CONFIG[key], name]);
}

async function afterConfigChange() {
  populateSelectSticky(document.getElementById('qa-type'), CONFIG.taskTypes);
  populateSelectSticky(document.getElementById('qa-priority'), CONFIG.priorities);
  await renderTodo();
  if (document.getElementById('tab-tasks').classList.contains('active')) await renderTasks();
  if (document.getElementById('tab-pomodoro').classList.contains('active')) await refreshPomodoroTaskOptions();
}

function setupConfigForms() {
  document.querySelectorAll('.config-add-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const key = form.dataset.config;
      const input = form.querySelector('.config-add-input');
      const value = input.value.trim();
      if (!value) return;
      addConfigItem(key, value);
      input.value = '';
    });
  });
}

async function loadConfig() {
  CONFIG = await window.api.config.getAll();
  populateSelectSticky(document.getElementById('qa-type'), CONFIG.taskTypes);
  populateSelectSticky(document.getElementById('qa-priority'), CONFIG.priorities);
  renderConfigList('taskTypes', CONFIG.taskTypes);
  renderConfigList('priorities', CONFIG.priorities);
}

// ---------- Data management ----------
function setupDataActions() {
  document.getElementById('export-data-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('data-action-status');
    statusEl.textContent = 'Exporting...';
    const result = await window.api.data.export();
    if (result.canceled) { statusEl.textContent = ''; return; }
    statusEl.textContent = result.ok ? `Exported to ${result.path}` : 'Export failed.';
  });

  document.getElementById('reset-data-btn').addEventListener('click', async () => {
    if (!confirm('This will permanently delete ALL tasks, comments, and pomodoro session history. This cannot be undone. Continue?')) return;
    const alsoSettings = confirm(
      'Also reset settings back to defaults?\n\nThis includes task types, priorities, reminders, and pomodoro durations.\n\nClick Cancel to keep your current settings.'
    );
    await window.api.data.reset(alsoSettings);
    alert('Database reset complete. The app will now reload.');
    window.location.reload();
  });
}

// ---------- Init ----------
async function init() {
  todayStr = await window.api.tasks.today();
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
