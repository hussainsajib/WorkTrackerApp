import { populateSelectSticky } from '../core/dom.js';
import { CONFIG } from '../core/state.js';
import { refreshPomodoroTaskOptions } from '../pomodoro/pomodoro.js';
import { renderTasks } from '../tasks/allTasks.js';
import { renderTodo } from '../tasks/todo.js';

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

export function setupConfigForms() {
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

export async function loadConfig() {
  Object.assign(CONFIG, await window.api.config.getAll());
  populateSelectSticky(document.getElementById('qa-type'), CONFIG.taskTypes);
  populateSelectSticky(document.getElementById('qa-priority'), CONFIG.priorities);
  renderConfigList('taskTypes', CONFIG.taskTypes);
  renderConfigList('priorities', CONFIG.priorities);
}
