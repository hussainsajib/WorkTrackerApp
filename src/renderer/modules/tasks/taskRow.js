import { populateSelectWithCurrent } from '../core/dom.js';
import { dueInfo, formatDuration, friendlyDate } from '../core/format.js';
import { TRASH_ICON_SVG } from '../core/icons.js';
import { CONFIG, state } from '../core/state.js';
import { buildPomodoroStartButton } from '../pomodoro/pomodoro.js';
import { openTaskDetail } from './detail.js';
import { refreshAfterTaskChange } from './refresh.js';

function statusClass(status) {
  if (status === CONFIG.doneStatus) return 'done-status';
  if (status === 'Blocked') return 'blocked-status';
  return '';
}

export function renderTaskRow(task, { showDateBadge, showPomodoroStart } = {}) {
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
    dueEl.textContent = (state.reminderTaskIds.has(task.id) ? '\u{1F514} ' : '') + due.label;
    main.appendChild(dueEl);
  } else if (state.reminderTaskIds.has(task.id)) {
    metaParts.push('\u{1F514} reminder set');
  }
  if (task.ref) metaParts.push(task.ref);
  if (showDateBadge && task.created_date !== state.todayStr) {
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
