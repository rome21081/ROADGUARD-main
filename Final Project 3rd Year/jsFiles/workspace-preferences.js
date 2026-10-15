'use strict';

window.readWorkspacePreferences = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('roadguard.preferences')) || {};
    return { compact: saved.compact === true, reduceMotion: saved.reduceMotion === true, mapView: saved.mapView === 'isabela' ? 'isabela' : 'reports' };
  } catch { return { compact: false, reduceMotion: false, mapView: 'reports' }; }
};
window.applyWorkspacePreferences = preferences => {
  document.documentElement.classList.toggle('compact-layout', preferences.compact);
  document.documentElement.classList.toggle('reduce-motion', preferences.reduceMotion);
};
window.applyWorkspacePreferences(window.readWorkspacePreferences());

