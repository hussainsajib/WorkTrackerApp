import { state } from './state.js';

export function pad(n) { return String(n).padStart(2, '0'); }

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function friendlyDate(dateStr) {
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function friendlyDateTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Date + optional time inputs -> {due_at, due_has_time}. A date with no time
// means "end of that day" (local 23:59).
export function dueFromInputs(dateVal, timeVal) {
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
export function dueInfo(task) {
  if (!task.due_at) return null;
  const d = new Date(task.due_at);
  const dayDiff = Math.round((parseDateStr(toDateStr(d)) - parseDateStr(state.todayStr)) / 86400000);
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

export function formatDuration(totalSeconds) {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
