import { friendlyDate, friendlyDateTime, parseDateStr, toDateStr } from '../core/format.js';
import { EDIT_ICON_SVG, TRASH_ICON_SVG } from '../core/icons.js';
import { state } from '../core/state.js';
import { openTaskDetail } from '../tasks/detail.js';

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

export async function renderActivity() {
  if (!state.activityViewDate) {
    // Default to yesterday, unless something's already been logged today —
    // then show today instead.
    const todaysItems = await window.api.activityLog.listForDate(state.todayStr);
    state.activityViewDate = todaysItems.length > 0
      ? state.todayStr
      : toDateStr(new Date(parseDateStr(state.todayStr).getTime() - 24 * 60 * 60 * 1000));
  }

  const heading = document.getElementById('activity-date-heading');
  heading.textContent = friendlyDate(state.activityViewDate);
  document.getElementById('activity-next-btn').disabled = state.activityViewDate >= state.todayStr;

  const list = document.getElementById('activity-list');
  const items = await window.api.activityLog.listForDate(state.activityViewDate);
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

export function setupActivityControls() {
  document.getElementById('activity-prev-btn').addEventListener('click', async () => {
    state.activityViewDate = toDateStr(new Date(parseDateStr(state.activityViewDate).getTime() - 24 * 60 * 60 * 1000));
    await renderActivity();
  });

  document.getElementById('activity-next-btn').addEventListener('click', async () => {
    if (state.activityViewDate >= state.todayStr) return;
    state.activityViewDate = toDateStr(new Date(parseDateStr(state.activityViewDate).getTime() + 24 * 60 * 60 * 1000));
    await renderActivity();
  });

  document.getElementById('activity-today-btn').addEventListener('click', async () => {
    state.activityViewDate = state.todayStr;
    await renderActivity();
  });

  document.getElementById('activity-copy-btn').addEventListener('click', async () => {
    const items = await window.api.activityLog.listForDate(state.activityViewDate);
    const text = buildActivitySummaryText(items, state.activityViewDate);
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
    await window.api.activityLog.addNote(text, state.activityViewDate);
    input.value = '';
    await renderActivity();
  });
}
