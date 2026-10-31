import { CONFIG, state } from '../core/state.js';
import { renderTaskRow } from './taskRow.js';

export async function renderTodo() {
  state.reminderTaskIds = new Set(await window.api.taskReminders.activeTaskIds());
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
