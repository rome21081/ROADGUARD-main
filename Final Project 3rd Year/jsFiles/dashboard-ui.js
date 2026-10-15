'use strict';

if (typeof Chart !== 'undefined') {
  Chart.defaults.global.defaultFontColor = '#b1bfd6';
  Chart.defaults.global.defaultFontFamily = "'DM Sans', system-ui, sans-serif";
  Chart.defaults.global.defaultFontSize = 11;
  Chart.defaults.global.legend.position = 'bottom';
  Chart.defaults.global.legend.labels.usePointStyle = true;
  Chart.defaults.global.legend.labels.padding = 18;
  Chart.defaults.global.tooltips.backgroundColor = '#0f1829';
  Chart.defaults.global.tooltips.titleFontColor = '#edf2fc';
  Chart.defaults.global.tooltips.bodyFontColor = '#c1cfe7';
  Chart.defaults.scale.gridLines.color = '#2a364d';
  Chart.defaults.scale.gridLines.zeroLineColor = '#3a4861';
  Chart.defaults.scale.ticks.padding = 10;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.workspaceUser) return;
  const sidebar = document.getElementById('sidebar');
  const workspace = document.querySelector('.workspace');
  const setMenu = () => window.closeWorkspaceMenu?.();

  const modal = document.getElementById('dangerZoneModal');
  const dismiss = document.getElementById('dismissDanger');
  const dismissAlert = () => {
    closeDangerModal();
    document.querySelector('.workspace').inert = false;
    sidebar.inert = window.innerWidth <= 980;
    document.getElementById('enableLocation').focus();
  };
  dismiss.addEventListener('click', dismissAlert);
  new MutationObserver(() => {
    if (modal.style.display === 'flex') {
      setMenu(false);
      workspace.inert = true;
      sidebar.inert = true;
      dismiss.focus();
    }
  }).observe(modal, {attributes: true, attributeFilter: ['style']});

  document.addEventListener('keydown', event => {
    if (modal.style.display === 'flex') {
      if (event.key === 'Escape') dismissAlert();
      if (event.key === 'Tab') { event.preventDefault(); dismiss.focus(); }
      return;
    }

  });

  document.getElementById('enableLocation').addEventListener('click', askLocationPermission);
  document.getElementById('refreshDashboard').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    document.getElementById('refreshStatus').textContent = 'Refreshing records...';
    try { await refreshAll(); } finally { button.disabled = false; button.setAttribute('aria-busy', 'false'); }
  });
});
