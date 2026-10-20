'use strict';

window.workspaceEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
window.workspaceUser = window.ROADGUARD.requireSession();
window.addEventListener('pageshow', event => {
  if (event.persisted && !window.ROADGUARD.session()) window.ROADGUARD.requireSession();
});

document.addEventListener('DOMContentLoaded', () => {
  const user = window.workspaceUser;
  if (!user) return;
  if (user.guest) {
    const signOut = document.getElementById('signOut');
    signOut.textContent = 'Sign in';
    signOut.addEventListener('click', () => window.location.assign('login.html'));
  }
  const name = String(user.full_name || user.username || 'User');
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileRole').textContent = user.role || 'Team member';
  document.getElementById('profileInitial').textContent = name.trim().slice(0, 1).toUpperCase();
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('menuToggle');
  const close = document.getElementById('closeMenu');
  const backdrop = document.getElementById('sidebarBackdrop');
  const workspace = document.querySelector('.workspace');
  const setMenu = open => {
    sidebar.classList.toggle('is-open', open);
    sidebar.inert = !open && window.innerWidth <= 980;
    workspace.inert = open;
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    if (open) close.focus();
  };
  const closeMenu = () => { setMenu(false); toggle.focus(); };
  window.closeWorkspaceMenu = () => setMenu(false);
  if (!user.guest) document.getElementById('signOut')?.addEventListener('click', window.ROADGUARD.logout);
  sidebar.inert = window.innerWidth <= 980;
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  close.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') closeMenu();
    if (event.key === 'Tab') {
      const items = sidebar.querySelectorAll('button, a');
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) setMenu(false);
    else sidebar.inert = toggle.getAttribute('aria-expanded') !== 'true';
  });
});

