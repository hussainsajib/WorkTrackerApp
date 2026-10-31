function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export async function setupTheme() {
  const select = document.getElementById('theme-select');
  const theme = await window.api.settings.get('theme', 'system');
  select.value = theme;
  applyTheme(theme);
  select.addEventListener('change', async () => {
    applyTheme(select.value);
    await window.api.settings.set('theme', select.value);
  });
}
