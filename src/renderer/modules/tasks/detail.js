import { ensureCommentEditor, renderComments, restoreCommentDraft, saveCommentDraft } from '../comments/comments.js';
import { populateSelectWithCurrent } from '../core/dom.js';
import { dueFromInputs, formatDuration, friendlyDateTime, pad, toDateStr } from '../core/format.js';
import { CONFIG, state } from '../core/state.js';
import { activateTab, updateQuickAddVisibility } from '../nav/tabs.js';
import { renderTaskReminders, setupTaskReminders } from '../reminders/taskReminders.js';

export async function openTaskDetail(taskId) {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) {
    state.lastListTab = activeBtn.dataset.tab;
  } else if (document.getElementById('tab-search').classList.contains('active')) {
    state.lastListTab = 'search';
  }

  // The single comment editor is shared across tasks, so stash the unposted
  // draft under the task being left and restore the one for the task opening.
  if (taskId !== state.currentDetailTaskId) {
    saveCommentDraft();
    state.currentDetailTaskId = taskId;
    ensureCommentEditor();
    restoreCommentDraft();
  }
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-task-detail'));
  updateQuickAddVisibility();

  await renderTaskDetail();
}

export async function renderTaskDetail() {
  ensureCommentEditor();

  const task = await window.api.tasks.get(state.currentDetailTaskId);
  if (!task) {
    activateTab(state.lastListTab);
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
  state.currentDetailDueAt = task.due_at || null;
  await renderTaskReminders();

  document.getElementById('detail-pomo-count').textContent = task.pomodoro_count || 0;
  document.getElementById('detail-time-worked').textContent = formatDuration(task.pomodoro_seconds || 0);

  await renderComments();
}

async function saveDetailField() {
  if (!state.currentDetailTaskId) return;
  const text = document.getElementById('detail-text').value.trim();
  if (!text) return;
  const type = document.getElementById('detail-type').value;
  const priority = document.getElementById('detail-priority').value;
  const ref = document.getElementById('detail-ref').value.trim();
  const due = dueFromInputs(document.getElementById('detail-due-date').value, document.getElementById('detail-due-time').value);
  await window.api.tasks.update(state.currentDetailTaskId, { text, type, ref, priority, ...due });
  if (due.due_at !== state.currentDetailDueAt) {
    state.currentDetailDueAt = due.due_at;
    await renderTaskReminders(); // relative reminders follow the new deadline
  }

  const prioBadge = document.getElementById('detail-priority-badge');
  prioBadge.textContent = priority;
  prioBadge.className = `priority-badge ${priority}`;
  const typeBadge = document.getElementById('detail-type-badge');
  typeBadge.textContent = type;
  typeBadge.className = `type-badge ${type}`;
}

export function setupTaskDetail() {
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
    if (!state.currentDetailTaskId) return;
    await window.api.tasks.updateStatus(state.currentDetailTaskId, document.getElementById('detail-status').value);
  });
}
