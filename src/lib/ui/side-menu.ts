// Component 43 – the one side menu for hosts and superadmin (SideMenu.astro): a column on the left on larger
// screens; on phones "Menu" opens it as a panel from the left. One open/close code path for both.
const $ = (id: string) => document.getElementById(id) as HTMLElement;

export function setSideOpen(on: boolean) {
  const side = $('admin-side');
  if (!side) return;
  side.classList.toggle('open', on);
  $('side-backdrop').hidden = !on;
  $('side-open').setAttribute('aria-expanded', String(on));
  document.documentElement.classList.toggle('side-locked', on);
  // The focus goes into the panel (on the panel itself – no ring on an item before the person moves)
  if (on) { side.tabIndex = -1; side.focus({ preventScroll: true }); }
}

/** Shows the menu (it is hidden until the person may see it), with the signed-in email in its foot */
export function initSideMenu(email: string, onSignOut: () => void) {
  if ($('admin-side').dataset.ready) return;
  $('admin-side').dataset.ready = '1';
  $('admin-side').hidden = false;
  $('me').textContent = email;
  // The menu sticks just below the site header on larger screens
  const header = document.querySelector<HTMLElement>('.site-header');
  if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  $('side-open').hidden = false;
  $('side-open').addEventListener('click', () => setSideOpen(true));
  $('side-close').addEventListener('click', () => { setSideOpen(false); $('side-open').focus(); });
  $('side-backdrop').addEventListener('click', () => setSideOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('admin-side').classList.contains('open')) { setSideOpen(false); $('side-open').focus(); }
  });
  $('side-logout').addEventListener('click', onSignOut);
}
