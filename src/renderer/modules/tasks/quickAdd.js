import { dueFromInputs } from '../core/format.js';
import { refreshAfterTaskChange } from './refresh.js';

export function setupQuickAdd() {
  const form = document.getElementById('quick-add-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('qa-text').value.trim();
    if (!text) return;
    const type = document.getElementById('qa-type').value;
    const ref = document.getElementById('qa-ref').value.trim();
    const priority = document.getElementById('qa-priority').value;
    const due = dueFromInputs(document.getElementById('qa-due-date').value, document.getElementById('qa-due-time').value);
    await window.api.tasks.add({ text, type, ref, priority, ...due });
    document.getElementById('qa-text').value = '';
    document.getElementById('qa-due-date').value = '';
    document.getElementById('qa-due-time').value = '';
    document.getElementById('qa-ref').value = '';
    document.getElementById('qa-text').focus();
    await refreshAfterTaskChange();
  });
}
