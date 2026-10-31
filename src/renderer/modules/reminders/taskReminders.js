import { friendlyDateTime, pad, toDateStr } from '../core/format.js';
import { TRASH_ICON_SVG } from '../core/icons.js';
import { state } from '../core/state.js';
import { openTaskDetail } from '../tasks/detail.js';

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

export async function renderTaskReminders() {
  if (!state.currentDetailTaskId) return;
  const list = document.getElementById('task-reminder-list');
  const items = await window.api.taskReminders.list(state.currentDetailTaskId);
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

export function setupTaskReminders() {
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
    kindSel.querySelector('option[value="before_deadline"]').disabled = !state.currentDetailDueAt;
    if (!state.currentDetailDueAt && kindSel.value === 'before_deadline') kindSel.value = 'absolute';
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
      if (!state.currentDetailDueAt) return fail('Set a deadline first.');
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
        params.startDate = state.todayStr;
      }
      const until = document.getElementById('tr-until').value;
      if (until) params.until = until;
    } else {
      const everyMin = parseInt(document.getElementById('tr-nag-min').value, 10);
      if (!(everyMin > 0)) return fail('Enter a number of minutes.');
      params = { everyMin };
    }
    await window.api.taskReminders.add(state.currentDetailTaskId, kind, params);
    closeModal();
    await renderTaskReminders();
  });
}

// In-app banner shown when a task reminder fires: open the task or snooze.
export function setupReminderEvents() {
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
    if (document.getElementById('tab-task-detail').classList.contains('active') && state.currentDetailTaskId === taskId) renderTaskReminders();
  });
}
