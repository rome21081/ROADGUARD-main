'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (!window.workspaceUser) return;
  const user = window.workspaceUser;
  const escape = window.workspaceEscape;
  const rows = document.getElementById('userRows');
  const search = document.getElementById('userSearch');
  const notice = document.getElementById('usersNotice');
  const status = document.getElementById('usersStatus');
  const reload = document.getElementById('reloadUsers');
  let users = [];
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = users.filter(item => [item.full_name, item.username, item.email, item.role].some(value => String(value || '').toLowerCase().includes(query)));
    rows.innerHTML = filtered.map(item => {
      const name = item.full_name || item.username || 'Unnamed account';
      const isCurrent = (user.user_id != null && String(item.user_id) === String(user.user_id)) || item === user;
      return '<tr><td><div class="user-identity"><span class="profile-initial">' + escape(String(name).trim().slice(0,1).toUpperCase()) + '</span><div>' + escape(name) + (isCurrent ? '<small>Your account</small>' : '') + '</div></div></td><td>' + escape(item.email || 'Not provided') + '</td><td><span class="role-tag">' + escape(item.role || 'Team member') + '</span></td><td>' + escape(item.user_id ?? 'Not provided') + '</td></tr>';
    }).join('');
    document.getElementById('userCount').textContent = String(filtered.length);
    document.getElementById('usersEmpty').hidden = filtered.length > 0;
  };
  const load = async () => {
    reload.disabled = true;
    rows.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading accounts...';
    users = [];
    notice.textContent = '';
    try {
      if (String(user.role).toLowerCase() !== 'admin') {
        users = [user];
        notice.textContent = 'You can view your own account. The full directory is available to administrators.';
      } else {
        const response = await getData('Signup.php');
        if (!response?.success || !Array.isArray(response.data)) throw new Error('Directory unavailable');
        users = response.data.filter(item => item && typeof item === 'object');
      }
      status.textContent = users.length + ' account' + (users.length === 1 ? '' : 's') + ' available';
    } catch {
      users = [user];
      status.textContent = 'Showing your signed-in account';
      notice.textContent = 'The team directory is unavailable. Your current account is shown below; try refreshing later.';
    } finally {
      render();
      reload.disabled = false;
      rows.setAttribute('aria-busy', 'false');
    }
  };
  search.addEventListener('input', render);
  reload.addEventListener('click', load);
  load();
});
