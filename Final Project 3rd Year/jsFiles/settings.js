'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (!window.workspaceUser) return;
  const user = window.workspaceUser;
  const escape = window.workspaceEscape;
  document.getElementById('accountDetails').innerHTML = [
    ['Name', user.full_name || user.username || 'Not provided'],
    ['Email', user.email || 'Not provided'], ['Role', user.role || 'Team member']
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('');
  const compact = document.getElementById('compactLayout');
  const motion = document.getElementById('reduceMotion');
  const map = document.getElementById('defaultMapView');
  const status = document.getElementById('settingsStatus');
  const fill = preferences => { compact.checked = preferences.compact; motion.checked = preferences.reduceMotion; map.value = preferences.mapView; };
  fill(window.readWorkspacePreferences());
  const save = preferences => {
    try {
      localStorage.setItem('roadguard.preferences', JSON.stringify(preferences));
      window.applyWorkspacePreferences(preferences);
      fill(preferences);
      status.textContent = 'Preferences saved for this browser.';
    } catch { status.textContent = 'Preferences could not be saved. Browser storage may be unavailable.'; }
  };
  document.getElementById('preferencesForm').addEventListener('submit', event => {
    event.preventDefault();
    save({compact: compact.checked, reduceMotion: motion.checked, mapView: map.value});
  });
  document.getElementById('resetPreferences').addEventListener('click', () => save({compact: false, reduceMotion: false, mapView: 'reports'}));
});

