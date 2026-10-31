export function setupDataActions() {
  document.getElementById('export-data-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('data-action-status');
    statusEl.textContent = 'Exporting...';
    const result = await window.api.data.export();
    if (result.canceled) { statusEl.textContent = ''; return; }
    statusEl.textContent = result.ok ? `Exported to ${result.path}` : 'Export failed.';
  });

  document.getElementById('reset-data-btn').addEventListener('click', async () => {
    if (!confirm('This will permanently delete ALL tasks, comments, and pomodoro session history. This cannot be undone. Continue?')) return;
    const alsoSettings = confirm(
      'Also reset settings back to defaults?\n\nThis includes task types, priorities, reminders, and pomodoro durations.\n\nClick Cancel to keep your current settings.'
    );
    await window.api.data.reset(alsoSettings);
    alert('Database reset complete. The app will now reload.');
    window.location.reload();
  });
}
