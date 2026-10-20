'use strict';
if (window.ROADGUARD.session()) {
  const login = document.getElementById('loginLink');
  login.href = 'main.html';
  login.textContent = 'Dashboard';
  const start = document.getElementById('startLink');
  start.href = 'map.html';
  start.textContent = 'Public safety map';
}
