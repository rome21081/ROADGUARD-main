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
  let records = [], visible = [], map, markers, markerList = [], zoneLayers = [];
  let riskModel = window.MapSafety.buildRiskModel([]);
  const severityKey = value => {
    const key = String(value || '').toLowerCase();
    if (['high','severe','critical','fatal'].includes(key)) return 'severe';
    return ({low:'minor',minor:'minor',medium:'moderate',moderate:'moderate'})[key] || 'unknown';
  };
  const reportLink = record => record.accident_id != null && String(record.accident_id).trim() !== '' ? '<a class="button" href="' + escape(window.ROADGUARD.reportURL(record.accident_id, record.recordType.toLowerCase()) + '&from=map') + '">View full details</a>' : '';
  const coordinates = window.MapSafety.coordinates;
  const areaColors = {caution:'#3a79a9',moderate:'#aa6900',high:'#dc2626',critical:'#dc2626'};
  // Province-wide overview (Isabela, Cagayan Valley), independent of report locations.
  const isabelaBounds = [[16.393952,121.404204],[17.545914,122.526253]];
  let overview = true, fittingOverview = false;
  const fit = () => {
    if (!map) return;
    overview = true;
    fittingOverview = true;
    try {
      map.fitBounds(isabelaBounds, {...window.MapGuidance.fitPadding(map.getSize(),40),animate:false});
    } finally { fittingOverview = false; }
  };
  if (typeof L !== 'undefined') {
    try {
      map = L.map('accidentMap', { zoomControl: false });
      map.on('movestart zoomstart', () => { if (!fittingOverview) overview = false; });
      map.on('resize', () => { if (overview) fit(); });
      fit();
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror', () => {status.textContent='Map tiles could not be loaded. You can still browse the reports.';});
      L.control.zoom({ position: 'topright' }).addTo(map);
      markers = L.layerGroup().addTo(map);
      map.scrollWheelZoom.enable();
      const updatePopupHeight = () => document.getElementById('accidentMap').style.setProperty('--map-stage-height', map.getSize().y + 'px');
      map.on('resize', updatePopupHeight);
      updatePopupHeight();
    } catch { map = null; }
  }
  if (!map) document.getElementById('accidentMap').innerHTML = '<div class="state"><h2>Map unavailable</h2><p>The map could not be loaded. Recorded locations are still listed alongside it.</p></div>';
  const journeyUpdated = window.initializeMapJourney(map, () => records, () => riskModel);
  window.initializeMapNews(map);
  const render = (useDefault = false) => {
    const term = query.value.trim().toLowerCase();
    visible = records.filter(record => coordinates(record) && (severity.value === 'all' || severityKey(record.severity) === severity.value) && [record.address,record.case_number,record.description].some(value => String(value || '').toLowerCase().includes(term)));
    count.textContent = visible.length + ' location' + (visible.length === 1 ? '' : 's') + ' shown';
    document.getElementById('zoneCount').textContent = riskModel.areas.length ? riskModel.zones.length + ' accident-prone areas; ' + (riskModel.areas.length - riskModel.zones.length) + ' caution or moderate areas' : 'No areas have eligible crash history';
    document.getElementById('browseAreasLabel').textContent = 'Road risk areas (' + riskModel.areas.length + ')';
    document.getElementById('areaResults').innerHTML = riskModel.areas.length ? riskModel.areas.map((zone, index) => window.MapAreaUI.card(zone, index, riskModel.now, !!map)).join('') : '<div class="empty"><p>No eligible risk areas</p><small>Crash history may be incomplete. Keep checking your route and road conditions.</small></div>';
    const areaTag = record => {
      const area = riskModel.membership.get(record);
      return area ? '<span class="area-tag area-' + area.tier + '">' + escape(area.label) + '</span>' : '';
    };
    results.innerHTML = visible.length ? visible.map((record,index) => '<article class="map-result"><div class="map-result-heading"><small>' + escape(record.recordType) + ' &middot; ' + escape(record.case_number || 'No case number') + '</small><span class="severity severity-' + severityKey(record.severity) + '">' + escape(record.severity || 'Unknown') + '</span></div><h3>' + escape(record.address || 'Address not recorded') + '</h3>' + areaTag(record) + '<p>' + escape(record.accident_date || 'Date not recorded') + '</p><div class="result-actions">' + (map ? '<button type="button" class="button" data-map-index="' + index + '">Locate on map</button>' : '') + reportLink(record) + '</div></article>').join('') : '<div class="empty"><p>No matching locations</p><small>Try another search or severity filter.</small></div>';
    if (!map) return;
    markers.clearLayers();
    zoneLayers = [];
    if (showZones.checked) {
      // Zones always use the complete dataset; display filters never reclassify them.
      riskModel.areas.forEach(zone => {
        const popup = window.MapAreaUI.popup(zone, riskModel.now);
        const popupOptions = {className:'area-popup-container',maxWidth:310,minWidth:220,autoPanPaddingTopLeft:[12,12],autoPanPaddingBottomRight:[72,90]};
        const area = L.circle(zone.center, {radius:zone.radius,color:areaColors[zone.tier],weight:1.5,fillOpacity:zone.tier === 'critical' ? .22 : zone.qualifies ? .14 : .07})
          .addTo(markers).bindPopup(popup, popupOptions);
        zoneLayers.push(area);
      });
    }
    const sameLocation = new Map();
    records.filter(record => coordinates(record)).forEach(record => {
      const key = coordinates(record).join(',');
      if (!sameLocation.has(key)) sameLocation.set(key, []);
      sameLocation.get(key).push(record);
    });
    markerList = visible.map(record => {
      const coordinate = coordinates(record);
      const point = L.marker(coordinate, {
        icon:L.divIcon({className:'record-marker-icon',html:'<span class="record-marker-dot record-marker-' + severityKey(record.severity) + '" aria-hidden="true"></span>',iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-10]}),
        keyboard:true, riseOnHover:true, zIndexOffset:650,
        title:record.recordType + ': ' + (record.case_number || record.address || 'Recorded event') + ' - select for details',
        alt:record.recordType + ': ' + (record.case_number || record.address || 'Recorded event')
      }).addTo(markers);
      point.bindPopup(window.MapAreaUI.recordPopup(record, sameLocation.get(coordinate.join(',')), window.ROADGUARD.reportURL), {className:'record-popup-container',maxWidth:310,minWidth:220,autoPanPaddingTopLeft:[12,12],autoPanPaddingBottomRight:[72,90]});
      return point;
    });
    // Updating reports/filters must not pull the camera away from a route, pin, or GPS.
    if (overview && !window.mapJourney?.hasRoute()) fit();
  };
  const load = async () => {
    refresh.disabled = true;
    results.setAttribute('aria-busy','true');
    document.getElementById('areaResults').setAttribute('aria-busy','true');
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
      riskModel = window.MapSafety.buildRiskModel(records);
      render(true);
      journeyUpdated();
      const omitted = records.filter(record=>!coordinates(record)).length;
      status.textContent = 'Updated ' + new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' | Historical reports; rule-based analysis uses eligible incidents within 36 calendar months. ' + riskModel.quality.duplicates + ' duplicates ignored; ' + riskModel.quality.undated + ' undated records excluded; ' + riskModel.quality.unknownSeverity + ' records with unknown severity excluded; ' + riskModel.quality.unreliable + ' unreliable records excluded. Use Refresh to check for changes.' + (omitted ? ' ' + omitted + ' reports have no valid coordinates.' : '');
    } catch {
      status.textContent = 'Reports could not be refreshed. Check your connection and try again.';
      if (!records.length) {
        document.getElementById('zoneCount').textContent = 'Area history could not be loaded';
        document.getElementById('browseAreasLabel').textContent = 'Area data unavailable';
        document.getElementById('areaResults').innerHTML = '<div class="empty"><p>Unable to check accident-prone areas</p><small>Use Refresh to try again.</small></div>';
        results.innerHTML = '<div class="empty"><p>Unable to load reports</p><small>Use Refresh to try again.</small></div>';count.textContent='Reports unavailable';}
    } finally {refresh.disabled=false;results.setAttribute('aria-busy','false');document.getElementById('areaResults').setAttribute('aria-busy','false');}
  };
  results.addEventListener('click', event => {
    const button=event.target.closest('[data-map-index]');
    if (!button || !map) return;
    const index=Number(button.dataset.mapIndex);
    if (!visible[index]) return;
    window.mapJourney?.pauseFollowing();
    window.mapJourney?.minimize();
    map.invalidateSize({pan:false});
    map.setView(coordinates(visible[index]),15);
    markerList[index].openPopup();
    document.getElementById('accidentMap').focus({preventScroll:true});
  });
  document.getElementById('browseAreas').addEventListener('click', () => {
    document.getElementById('showEvents').click();
    document.getElementById('areasHeading').focus({preventScroll:true});
    document.getElementById('areasHeading').scrollIntoView({block:'nearest'});
  });
  document.getElementById('areaResults').addEventListener('click', event => {
    const button = event.target.closest('[data-area-index]');
    if (!button || !map) return;
    const index = Number(button.dataset.areaIndex), zone = riskModel.areas[index];
    if (!zone) return;
    if (!showZones.checked) { showZones.checked = true; render(); }
    window.mapJourney?.pauseFollowing();
    window.mapJourney?.minimize();
    requestAnimationFrame(() => {
      map.invalidateSize({pan:false});
      map.setView(zone.center,15,{animate:false});
      zoneLayers[index]?.openPopup();
      document.getElementById('accidentMap').focus({preventScroll:true});
    });
  });
  query.addEventListener('input',()=>render());
  severity.addEventListener('change',()=>render());
  showZones.addEventListener('change',()=>render());
  document.getElementById('resetMap').addEventListener('click', () => {
    window.mapJourney?.pauseFollowing();
    if (!window.mapJourney?.fitRoute()) fit();
  });
  refresh.addEventListener('click',load);
  load();
});
