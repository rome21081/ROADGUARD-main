'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (!window.workspaceUser) return;
  const escape = window.workspaceEscape;
  const query = document.getElementById('mapQuery');
  const severity = document.getElementById('mapSeverity');
  const results = document.getElementById('mapResults');
  const count = document.getElementById('mapCount');
  const status = document.getElementById('mapStatus');
  const refresh = document.getElementById('refreshMap');
  const showZones = document.getElementById('showMapZones');
  let records = [], visible = [], map, markers, markerList = [];
  const severityKey = value => {
    const key = String(value || '').toLowerCase();
    if (['severe','critical','fatal'].includes(key)) return 'severe';
    return ['minor','moderate'].includes(key) ? key : 'unknown';
  };
  const colors = {minor:'#76c9ab',moderate:'#e9be74',severe:'#ee8c9c',unknown:'#94a1bb'};
  const coordinates = record => {
    const lat = Number.parseFloat(record.latitude), lng = Number.parseFloat(record.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat,lng] : null;
  };
  const fit = () => {
    if (!map) return;
    const points = visible.map(coordinates);
    if (points.length) map.fitBounds(points, {padding:[35,35],maxZoom:14});
    else map.setView([16.70509,121.67633],11);
  };
  if (typeof L !== 'undefined') {
    try {
      map = L.map('accidentMap').setView([16.70509,121.67633],11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror', () => {status.textContent='Map tiles could not be loaded. You can still browse the reports.';});
      markers = L.layerGroup().addTo(map);
      map.scrollWheelZoom.disable();
    } catch { map = null; }
  }
  if (!map) document.getElementById('accidentMap').innerHTML = '<div class="state"><h2>Map unavailable</h2><p>The map could not be loaded. Recorded locations are still listed alongside it.</p></div>';
  const render = (useDefault = false) => {
    const term = query.value.trim().toLowerCase();
    visible = records.filter(record => coordinates(record) && (severity.value === 'all' || severityKey(record.severity) === severity.value) && [record.address,record.case_number,record.description].some(value => String(value || '').toLowerCase().includes(term)));
    count.textContent = visible.length + ' location' + (visible.length === 1 ? '' : 's') + ' shown';
    results.innerHTML = visible.length ? visible.map((record,index) => '<article class="map-result"><div class="map-result-heading"><small>' + escape(record.recordType) + ' &middot; ' + escape(record.case_number || 'No case number') + '</small><span class="severity severity-' + severityKey(record.severity) + '">' + escape(record.severity || 'Unknown') + '</span></div><h3>' + escape(record.address || 'Address not recorded') + '</h3><p>' + escape(record.accident_date || 'Date not recorded') + '</p><div class="result-actions">' + (map ? '<button type="button" class="button" data-map-index="' + index + '">Locate on map</button>' : '') + '<a class="button" href="' + window.ROADGUARD.reportURL(record.accident_id, record.recordType.toLowerCase()) + '">View report</a></div></article>').join('') : '<div class="empty"><p>No matching locations</p><small>Try another search or severity filter.</small></div>';
    if (!map) return;
    markers.clearLayers();
    if (showZones.checked) {
      const clusters = [];
      const distance = (first, second) => {
        const rad = value => value * Math.PI / 180;
        const a = Math.sin(rad(second[0] - first[0]) / 2) ** 2 + Math.cos(rad(first[0])) * Math.cos(rad(second[0])) * Math.sin(rad(second[1] - first[1]) / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
      };
      visible.forEach(record => {
        const point = coordinates(record);
        const cluster = clusters.find(item => distance(point, item.point) <= 300);
        if (cluster) cluster.records.push(record);
        else clusters.push({point, records: [record]});
      });
      clusters.forEach(cluster => {
        const severities = cluster.records.map(record => severityKey(record.severity));
        const key = severities.includes('severe') ? 'severe' : severities.includes('moderate') ? 'moderate' : severities.includes('minor') ? 'minor' : 'unknown';
        L.circle(cluster.point, {radius:300,color:colors[key],weight:1,fillOpacity:.12,interactive:false}).addTo(markers);
      });
    }
    markerList = visible.map(record => {
      const point = L.circleMarker(coordinates(record), {radius:8,fillColor:colors[severityKey(record.severity)],color:'#ffffff',weight:2,fillOpacity:.9}).addTo(markers);
      point.bindPopup('<strong>' + escape(record.address || 'Event location') + '</strong><br>' + escape(record.severity || 'Unknown') + ' &middot; ' + escape(record.recordType) + '<br><a href="' + window.ROADGUARD.reportURL(record.accident_id, record.recordType.toLowerCase()) + '">View full report</a>');
      return point;
    });
    if (useDefault && window.readWorkspacePreferences().mapView === 'isabela') map.setView([16.70509,121.67633],11);
    else fit();
  };
  const load = async () => {
    refresh.disabled = true;
    results.setAttribute('aria-busy','true');
    status.textContent = 'Refreshing recorded locations...';
    try {
      const responses = await Promise.all(['accident.json','incident.json'].map(async file => {
        const response = await fetch(file,{cache:'no-store'});
        if (!response.ok) throw new Error('Unable to load records');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid records');
        return data;
      }));
      records = [...responses[0].map(item=>({...item,recordType:'Accident'})),...responses[1].map(item=>({...item,accident_id:item.incident_id,accident_date:item.incident_date,recordType:'Incident'}))];
      render(true);
      const omitted = records.filter(record=>!coordinates(record)).length;
      status.textContent = 'Updated ' + new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' ? Based on recorded reports. Use Refresh to check for changes.' + (omitted ? ' ' + omitted + ' reports have no valid coordinates.' : '');
    } catch {
      status.textContent = 'Reports could not be refreshed. Check your connection and try again.';
      if (!records.length) {results.innerHTML = '<div class="empty"><p>Unable to load reports</p><small>Use Refresh to try again.</small></div>';count.textContent='Reports unavailable';}
    } finally {refresh.disabled=false;results.setAttribute('aria-busy','false');}
  };
  results.addEventListener('click', event => {
    const button=event.target.closest('[data-map-index]');
    if (!button || !map) return;
    const index=Number(button.dataset.mapIndex);
    if (!visible[index]) return;
    map.setView(coordinates(visible[index]),15);
    markerList[index].openPopup();
    document.getElementById('accidentMap').scrollIntoView({block:'nearest'});
  });
  query.addEventListener('input',()=>render());
  severity.addEventListener('change',()=>render());
  showZones.addEventListener('change',()=>render());
  document.getElementById('resetMap').addEventListener('click',fit);
  refresh.addEventListener('click',load);
  load();
});
