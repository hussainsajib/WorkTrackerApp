import { friendlyDate } from '../core/format.js';
import { renderTaskRow } from './taskRow.js';

export async function renderTasks() {
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

export function setupTasksControls() {
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
