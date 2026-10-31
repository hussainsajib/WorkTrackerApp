import { friendlyDateTime } from '../core/format.js';
import { activateTab } from '../nav/tabs.js';
import { refreshAfterTaskChange } from './refresh.js';

// Separate from state.lastListTab, same reasoning as searchReturnTab: a nested
// detail-view visit must not clobber where the Recycle Bin's Back returns to.
let recycleBinReturnTab = 'todo';

function openRecycleBinPage() {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) recycleBinReturnTab = activeBtn.dataset.tab;
  activateTab('recyclebin');
}

export function setupRecycleBinPage() {
  document.getElementById('open-recyclebin-btn').addEventListener('click', openRecycleBinPage);
  document.getElementById('recyclebin-back').addEventListener('click', () => activateTab(recycleBinReturnTab));
}

export async function renderRecycleBin() {
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
