'use strict';

window.ROADGUARD = (() => {
  const protectedPages = ['main.html', 'map.html', 'report.html', 'accidentlist.html', 'accident_view.html', 'management.html', 'spreedsheet.html', 'users.html', 'settings.html'];
  const session = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      return user && typeof user === 'object' && !Array.isArray(user) && (user.user_id != null || user.username || user.full_name) ? user : null;
    } catch { return null; }
  };
  const destination = value => {
    try {
      const url = new URL(value || 'main.html', window.location.href);
      const file = url.pathname.split('/').pop();
      const directory = new URL('.', window.location.href).pathname;
      if (url.origin !== window.location.origin || url.pathname !== directory + file || !protectedPages.includes(file)) return 'main.html';
      return file + url.search + url.hash;
    } catch { return 'main.html'; }
  };
  const currentPage = () => window.location.pathname.split('/').pop();
  const loginURL = target => 'login.html?next=' + encodeURIComponent(destination(target));
  const requireSession = () => {
    const user = session();
    if (!user) window.location.replace(loginURL(currentPage() + window.location.search + window.location.hash));
    return user;
  };
  const reportURL = (id, type = 'accident') => 'accident_view.html?id=' + encodeURIComponent(id) + '&type=' + (type === 'incident' ? 'incident' : 'accident');
  const logout = () => { localStorage.removeItem('user'); window.location.replace('login.html'); };
  return { session, destination, currentPage, loginURL, requireSession, reportURL, logout };
})();
