export async function renderReminders() {
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

export function setupReminders() {
  document.getElementById('reminder-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('reminder-time-input');
    if (!input.value) return;
    await window.api.reminders.add(input.value);
    input.value = '';
    renderReminders();
  });
}
