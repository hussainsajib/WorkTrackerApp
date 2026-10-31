export async function setupDbLocation() {
  const pathEl = document.getElementById('db-path');
  const statusEl = document.getElementById('db-location-status');
  const defaultBtn = document.getElementById('db-default-btn');

  const info = await window.api.dbLocation.get();
  pathEl.textContent = info.path;
  defaultBtn.disabled = info.isDefault;

  // On success the main process relaunches the app, so the page just goes away.
  async function run(action, pendingText) {
    statusEl.textContent = pendingText;
    const result = await action();
    if (result.ok) {
      statusEl.textContent = 'Restarting...';
    } else {
      statusEl.textContent = result.canceled ? '' : (result.error || 'Failed.');
    }
  }

  document.getElementById('db-move-btn').addEventListener('click', () => {
    if (!confirm('Your data will be copied to the folder you choose and the app will restart using the copy. The current file is left in place as a backup. Continue?')) return;
    run(() => window.api.dbLocation.move(), 'Choose a folder...');
  });

  document.getElementById('db-existing-btn').addEventListener('click', () => {
    run(() => window.api.dbLocation.useExisting(), 'Choose a database file...');
  });

  defaultBtn.addEventListener('click', () => {
    if (!confirm(`Switch back to the default location?\n\n${info.defaultPath}\n\nThe app will restart. Data in the current file is not copied.`)) return;
    run(() => window.api.dbLocation.useDefault(), 'Switching...');
  });
}
