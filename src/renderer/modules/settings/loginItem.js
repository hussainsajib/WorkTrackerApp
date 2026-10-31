export async function setupLoginItem() {
  const toggle = document.getElementById('login-item-toggle');
  toggle.checked = await window.api.settings.getLoginItem();
  toggle.addEventListener('change', async () => {
    const result = await window.api.settings.setLoginItem(toggle.checked);
    toggle.checked = result;
  });
}
