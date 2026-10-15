
'use strict';

let monthlyChart = null;
let severityChart = null;
let vehicleChart = null;
let lightChart = null;

let userWatchId = null;
const DANGER_RADIUS_METERS = 200;

let computedDangerZones = []; // [{ name, lat, lng, severeCount, totalCount, probability }]

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.workspaceUser) return;
  await refreshAll();
  setInterval(refreshAll, 15000);
});

async function refreshAll() {
  try {
    let accidentsResult;
    try {
      const response = await fetch('accident.json');
      accidentsResult = await response.json();
    } catch (e) {
      if (typeof getData === 'function') {
        accidentsResult = await getData('accident_api.php');
      } else {
        console.error("No accident.json and no getData available.", e);
        accidentsResult = [];
      }
    }

    const accidents = normalizeAccidentResponse(accidentsResult);
    buildSummaryFromAccidents(accidents);
    renderRecentReports(accidents);

    computedDangerZones = buildDangerZonesFromAccidents(accidents);
    renderDangerZoneList(computedDangerZones);
    if (typeof Chart !== 'undefined') {
      buildChartsFromAccidents(accidents);
    } else {
      renderAIPrediction();
      document.querySelectorAll('.chart-plot').forEach(container => {
        container.innerHTML = '<div class="empty"><p>Chart unavailable</p><small>Reload the page to try loading the chart library again.</small></div>';
      });
    }
    const status = document.getElementById('refreshStatus');
    if (status) status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Refreshes every 15 seconds`;

  } catch (err) {
    console.error("Error refreshing data:", err);
    const status = document.getElementById('refreshStatus');
    if (status) status.textContent = 'Unable to refresh records. Try Refresh again.';
  }
}

// Force fake danger zone for testing
computedDangerZones.unshift({
  name: "Echague-Poblacion Road, Barangay San Fabian, Echague, Isabela (Near ISU Echague)",
  lat: 16.7065,
  lng: 121.6760,
  severeCount: 5,
  totalCount: 5,
  probability: 100,
});



function normalizeAccidentResponse(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (res.success && Array.isArray(res.data)) return res.data;
  if (res.success && Array.isArray(res.accidents)) return res.accidents;
  if (res.success && Array.isArray(res.records)) return res.records;
  if (res.accident_id && res.case_number) return [res];
  for (const k in res) if (Array.isArray(res[k])) return res[k];
  return [];
}

function buildSummaryFromAccidents(accidents) {
  const totalAccidents = accidents.length;
  const totalCasualties = 57; // sample fixed value
  const severeCases = accidents.filter(a =>
    ['severe','critical'].includes((a.severity || '').toLowerCase())
  ).length;

  const activeZones = [...new Set(accidents.filter(a => {
    const s = (a.severity || '').toLowerCase();
    return ['severe','critical','moderate'].includes(s);
  }).map(a => a.address || a.location || a.type_name || 'Unknown'))].length;

  document.getElementById('totalAccidents').innerText = totalAccidents;
  document.getElementById('totalCasualties').innerText = totalCasualties;
  document.getElementById('severeCases').innerText = severeCases;
  document.getElementById('activeZones').innerText = activeZones;
}

function buildChartsFromAccidents(accidents) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyCounts = Array(12).fill(0);

  accidents.forEach(a => {
    const dt = new Date(a.accident_date || a.created_at || a.date || null);
    if (isValidDate(dt)) monthlyCounts[dt.getMonth()]++;
    else {
      const parsedMonth = parseMonthFromString(a.accident_date || a.created_at);
      if (parsedMonth !== null) monthlyCounts[parsedMonth]++;
    }
  });

  const severityCounts = { severe:0, moderate:0, minor:0, unknown:0 };
  accidents.forEach(a => {
    const s = (a.severity || 'unknown').toLowerCase();
    if (s.includes('sev') || s.includes('crit')) severityCounts.severe++;
    else if (s.includes('mod')) severityCounts.moderate++;
    else if (s.includes('min')) severityCounts.minor++;
    else severityCounts.unknown++;
  });

  const vehicleMap = {};
  accidents.forEach(a => {
    if (Array.isArray(a.vehicles) && a.vehicles.length > 0) {
      a.vehicles.forEach(v => {
        const key = (v.type_name || v.vehicle_type_name || 'Unknown').trim();
        vehicleMap[key] = (vehicleMap[key] || 0) + (Number(a.casualties || a.number_of_casualties || 1));
      });
    } else {
      const key = (a.vehicle_type_name || 'Unknown').trim();
      vehicleMap[key] = (vehicleMap[key] || 0) + (Number(a.casualties || a.number_of_casualties || 1));
    }
  });
  const vehicleLabels = Object.keys(vehicleMap);
  const vehicleValues = Object.values(vehicleMap);

  let am = 0, pm = 0;
  accidents.forEach(a => {
    const dt = new Date(a.accident_date || a.created_at || a.date || null);
    if (isValidDate(dt)) {
      const h = dt.getHours();
      if (h >= 6 && h < 18) am++;
      else pm++;
    }
  });

  const ctxMonthly = document.getElementById('monthlyTrend').getContext('2d');
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctxMonthly, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label:'Accidents',
        data: monthlyCounts,
        backgroundColor:'transparent',
        borderColor:'#91b1ff',
        borderWidth:2,
        pointRadius:3,
        lineTension:0.2
      }]
    },
    options: {
      scales: { yAxes:[{ ticks:{ beginAtZero:true } }] },
      legend:{ display:false },
      responsive:true,
      maintainAspectRatio:false
    }
  });

  renderAIPrediction(accidents, monthlyCounts);

  const ctxSeverity = document.getElementById('severityPie').getContext('2d');
  if (severityChart) severityChart.destroy();
  severityChart = new Chart(ctxSeverity, {
    type: 'doughnut',
    data: {
      labels:['Severe','Moderate','Minor','Unknown'],
      datasets:[{
        data:[
          severityCounts.severe,
          severityCounts.moderate,
          severityCounts.minor,
          severityCounts.unknown
        ],
        backgroundColor:['#ee8c9c','#e9be74','#76c9ab','#7a89a7'], borderColor: '#1a2438', borderWidth: 4
      }]
    },
    options:{ responsive:true, maintainAspectRatio:false }
  });

  const ctxVehicle = document.getElementById('vehicleChart').getContext('2d');
  if (vehicleChart) vehicleChart.destroy();
  vehicleChart = new Chart(ctxVehicle, {
    type: 'bar',
    data: {
      labels: vehicleLabels,
      datasets: [{
        label:'Accidents',
        data: vehicleValues,
        backgroundColor: ['#86aaff','#b39aee','#7cc9b2','#e6bd78','#df93b6']
      }]
    },
    options: {
      maintainAspectRatio: false,
      legend:{ display:false },
      scales:{ yAxes:[{ ticks:{ beginAtZero:true } }] },
      responsive:true
    }
  });

  const ctxLight = document.getElementById('lightChart').getContext('2d');
  if (lightChart) lightChart.destroy();
  lightChart = new Chart(ctxLight, {
    type:'bar',
    data:{ labels:['Day','Night'], datasets:[{ label:'Accidents', data:[am,pm], backgroundColor:['#86aaff','#b69bfa'] }]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      legend: { display: false }
    }
  });
}

function dashboardEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function renderRecentReports(accidents) {
  const container = document.getElementById('recentReports');
  if (!accidents || accidents.length === 0) {
    container.innerHTML = '<div class="empty"><p>No accident reports yet.</p><small>New reports will appear here when available.</small></div>';
    return;
  }
  const sorted = [...accidents].sort((a, b) => (new Date(String(b.accident_date || '').replace(' ', 'T')).getTime() || 0) - (new Date(String(a.accident_date || '').replace(' ', 'T')).getTime() || 0));
  container.innerHTML = sorted.slice(0, 6).map(record => {
    const severity = String(record.severity || 'Unknown');
    const severityClass = ['minor', 'moderate', 'severe', 'critical', 'fatal'].includes(severity.toLowerCase()) ? severity.toLowerCase() : 'unknown';
    const date = new Date(String(record.accident_date || '').replace(' ', 'T'));
    const time = Number.isNaN(date.getTime()) ? 'Date not recorded' : date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
    return '<a class="report-row" href="' + window.ROADGUARD.reportURL(record.accident_id, 'accident') + '"><span class="report-row-icon"><i class="uil uil-file-alt" aria-hidden="true"></i></span><div><strong>' + dashboardEscape(record.address || 'Location not recorded') + '</strong><span class="report-row-date">' + dashboardEscape(record.case_number || 'No case number') + ' &middot; ' + time + '</span><p class="report-row-description">' + dashboardEscape(record.description || 'No description recorded.') + '</p></div><span class="severity severity-' + severityClass + '">' + dashboardEscape(severity) + '</span><i class="uil uil-angle-right" aria-hidden="true"></i></a>';
  }).join('');
}

function buildDangerZonesFromAccidents(accidents) {
  if (!Array.isArray(accidents) || accidents.length === 0) {
    return [{
      name: "Barangay San Fabian, Municipality of Echague, Province of Isabela",
      lat: 16.7060,
      lng: 121.6750,
      severeCount: 5,
      totalCount: 5,
      probability: 100
    }];
  }

  const groups = {};

  accidents.forEach(a => {
    const key = (a.address || a.location || a.type_name || 'Unknown location').trim();
    if (!groups[key]) groups[key] = { latSum:0, lngSum:0, count:0, severeCount:0, samples:[] };

    const lat = parseFloat(a.latitude || a.lat || a.lng_lat || a.latlng?.lat || 0) || 0;
    const lng = parseFloat(a.longitude || a.lng || a.lng_lat || a.latlng?.lng || 0) || 0;
    groups[key].latSum += lat;
    groups[key].lngSum += lng;
    groups[key].count += 1;
    groups[key].samples.push(a);

    const s = (a.severity || '').toLowerCase();
    if (s.includes('sev') || s.includes('crit') || s.includes('fatal')) {
      groups[key].severeCount += 1;
    }
  });

  const zones = Object.entries(groups).map(([name, v]) => {
    let lat = v.latSum / Math.max(1, v.count);
    let lng = v.lngSum / Math.max(1, v.count);
    if ((!lat || !lng) && name.toLowerCase().includes('san fabian')) {
      lat = 16.7060; lng = 121.6750;
    }
    const prob = Math.round((v.severeCount / Math.max(1, v.count)) * 100);
    return { name, lat, lng, severeCount: v.severeCount, totalCount: v.count, probability: prob };
  });

  zones.sort((a,b) => b.severeCount - a.severeCount);
  const top = zones.slice(0, 5);

  if (top.length === 0 || !top.some(z => z.name.toLowerCase().includes('san fabian'))) {
    top.unshift({
      name: "Barangay San Fabian, Municipality of Echague, Province of Isabela",
      lat: 16.7060,
      lng: 121.6750,
      severeCount: 5,
      totalCount: 5,
      probability: 100
    });
  }

  return top;
}

function renderDangerZoneList(zones) {
  const box = document.getElementById('danger-alerts');
  if (!box) return;
  if (!zones || zones.length === 0) {
    box.innerHTML = '<div class="empty"><p>No priority locations recorded.</p></div>';
    return;
  }
  const renderZone = zone => '<div class="zone-item"><span class="zone-icon"><i class="uil uil-map-marker-exclamation" aria-hidden="true"></i></span><div><strong>' + dashboardEscape(zone.name) + '</strong><p>' + zone.totalCount + ' reported &middot; ' + zone.severeCount + ' severe</p></div><span class="zone-percentage" aria-label="' + zone.probability + ' percent of reports are severe">' + zone.probability + '%</span></div>';
  box.innerHTML = '<div class="zone-list">' + zones.slice(0, 2).map(renderZone).join('') + (zones.length > 2 ? '<details><summary>Show ' + (zones.length - 2) + ' more locations</summary>' + zones.slice(2).map(renderZone).join('') + '</details>' : '') + '</div>';
}

function askLocationPermission() {
  const button = document.getElementById('enableLocation');
  if (!navigator.geolocation) {
    if (button) button.textContent = 'Location unavailable';
    return;
  }
  if (userWatchId !== null) {
    stopWatchingUser();
    if (button) button.textContent = 'Enable alerts';
    return;
  }
  if (button) { button.textContent = 'Requesting location...'; button.disabled = true; }
  userWatchId = navigator.geolocation.watchPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 10000
  });
}

function onLocationSuccess(position) {
  const button = document.getElementById('enableLocation');
  if (button) { button.textContent = 'Disable alerts'; button.disabled = false; }
  const userLat = position.coords.latitude;
  const userLng = position.coords.longitude;

  if (!Array.isArray(computedDangerZones) || computedDangerZones.length === 0) return;

  for (const zone of computedDangerZones) {
    if (!zone.lat || !zone.lng) continue;
    const distance = haversineDistanceMeters(userLat, userLng, zone.lat, zone.lng);
    if (distance <= DANGER_RADIUS_METERS) {
      triggerDangerAlert(zone, Math.round(distance));
      break;
    }
  }
}

function stopWatchingUser() {
  if (userWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(userWatchId);
    userWatchId = null;
  }
}

function onLocationError(err) {
  console.warn("Location error:", err && err.message ? err.message : err);
  stopWatchingUser();
  const button = document.getElementById('enableLocation');
  if (button) { button.textContent = 'Retry location access'; button.disabled = false; }
  const status = document.getElementById('locationStatus');
  if (status) status.textContent = 'Location could not be accessed. Check your browser permissions to enable alerts.';
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function triggerDangerAlert(zone, distanceMeters) {
  const modal = document.getElementById('dangerZoneModal');
  const sound = document.getElementById('dangerAlertSound');
  const nameEl = document.getElementById('dangerZoneName');
  const detailsEl = document.getElementById('dangerZoneDetails');

  if (!modal || !sound || !nameEl || !detailsEl) return;
  if (modal.style.display === 'flex') return;

  nameEl.innerText = zone.name;
  detailsEl.innerText = distanceMeters !== null
    ? `Distance: ${distanceMeters} m — Severity probability: ${zone.probability}% ( ${zone.severeCount}/${zone.totalCount} severe )`
    : `Severity probability: ${zone.probability}% ( ${zone.severeCount}/${zone.totalCount} severe ) — You are in ALERT ZONE`;

  modal.style.display = 'flex';
  const playPromise = sound.play();
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise.catch(() => {});
  }
}

function closeDangerModal() {
  const modal = document.getElementById('dangerZoneModal');
  if (modal) modal.style.display = 'none';
}


function triggerDefaultDangerAlert() {
  const defaultZone = {
    name: "Echague-Poblacion Road, Barangay San Fabian, Echague, Isabela (Near ISU Echague)",
    lat: 16.7065,
    lng: 121.6760,
    severeCount: 5,
    totalCount: 5,
    probability: 100
  };
  triggerDangerAlert(defaultZone, null);
}

function renderAIPrediction() {
  const box = document.getElementById('ai-monthly-prediction');
  if (!box) return;
  const sampleCounts = [7, 2, 25];
  const december = Math.round(sampleCounts.reduce((a, b) => a + b, 0) / sampleCounts.length);
  const january = december + 5;
  box.innerHTML = '<div class="prediction-body"><p class="forecast-lead">Sample monthly accident estimates</p><div class="forecast-values"><div><span>December</span><strong>' + december + '</strong></div><div><span>January</span><strong>' + january + '</strong></div></div><p class="forecast-note">Demonstration values based on sample counts of 7, 2, and 25. These figures are not a live forecast.</p></div>';
}

function isValidDate(d) {
  return d instanceof Date && !isNaN(d);
}

function parseMonthFromString(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) return parseInt(m[1])-1;
  return null;
}


