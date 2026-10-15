'use strict';

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const formatDate = (value) => {
  if (!value) return 'Date not recorded';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return 'Date not recorded';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
    ' · ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const emptyState = (icon, message, detail = '') => `<div class="empty"><i class="uil uil-${icon}" aria-hidden="true"></i><p>${message}</p>${detail ? `<small>${detail}</small>` : ''}</div>`;

const panelHeader = (icon, title, count) => `<div class="panel-header"><span class="section-icon"><i class="uil uil-${icon}" aria-hidden="true"></i></span><h2>${title}</h2>${count === undefined ? '' : `<span class="count">${count}</span>`}</div>`;

const imagePath = (value) => {
  const path = String(value || '').replace(/\\/g, '/');
  if (!path.startsWith('uploads/') || path.split('/').some(part => part === '..') || /[?#]/.test(path)) return '';
  return '../' + path.split('/').map(encodeURIComponent).join('/');
};

const renderAccidentDetails = (record) => {
  const container = document.getElementById('accidentDetail');
  const date = formatDate(record.accident_date);
  const severity = String(record.severity || 'Unknown');
  const severityClass = ['minor', 'moderate', 'severe', 'critical', 'fatal'].includes(severity.toLowerCase()) ? severity.toLowerCase() : 'unknown';
  const vehicles = Array.isArray(record.vehicles) ? record.vehicles : [];
  const images = Array.isArray(record.images) ? record.images : [];
  const lat = Number.parseFloat(record.latitude);
  const lng = Number.parseFloat(record.longitude);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const coordinates = hasCoordinates ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '';
  const vehicleHTML = vehicles.map((vehicle, index) => {
    const name = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || `Vehicle ${index + 1}`;
    const fields = [['Type', vehicle.type_name], ['Year', vehicle.year], ['Color', vehicle.color], ['Brand', vehicle.brand], ['Model', vehicle.model]];
    return `<article class="vehicle-card"><div class="vehicle-title"><i class="uil uil-car-sideview" aria-hidden="true"></i><h3>${escapeHTML(name)}</h3><span class="plate">${escapeHTML(vehicle.plate_number || 'No plate')}</span></div><dl class="vehicle-info">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHTML(value || 'Not recorded')}</dd></div>`).join('')}</dl>${vehicle.notes ? `<p class="vehicle-notes">${escapeHTML(vehicle.notes)}</p>` : ''}</article>`;
  }).join('');
  const photosHTML = images.map((image, index) => {
    const source = imagePath(image.file_path);
    return `<figure>${source ? `<a href="${escapeHTML(source)}" target="_blank" rel="noopener" aria-label="Open report photo ${index + 1}"><img src="${escapeHTML(source)}" alt="Report photo ${index + 1}" loading="lazy" data-report-photo></a>` : '<div class="photo-error">Photo unavailable</div>'}<figcaption>Photo ${String(index + 1).padStart(2, '0')}</figcaption></figure>`;
  }).join('');

  container.innerHTML = `
    <section class="panel report-summary" aria-label="Report summary">
      <div class="report-title"><span class="event-icon"><i class="uil uil-file-alt" aria-hidden="true"></i></span><div class="report-identity"><div class="eyebrow">${escapeHTML(record.recordType || 'Accident')} report</div><div class="reference-row"><h2>${escapeHTML(record.case_number || 'No case number')}</h2>${record.case_number ? '<button class="icon-button" id="copyReference" aria-label="Copy case number" title="Copy case number"><i class="uil uil-copy" aria-hidden="true"></i></button>' : ''}</div></div><div class="severity-group"><span class="eyebrow">Severity level</span><span class="severity severity-${severityClass}">${escapeHTML(severity)}</span></div></div>
      <dl class="summary-grid"><div class="summary-item"><dt><i class="uil uil-calendar-alt" aria-hidden="true"></i>Date &amp; time</dt><dd>${escapeHTML(date)}</dd></div><div class="summary-item"><dt><i class="uil uil-map-marker" aria-hidden="true"></i>Location</dt><dd>${escapeHTML(record.address || 'Location not recorded')}</dd></div><div class="summary-item"><dt><i class="uil uil-car-sideview" aria-hidden="true"></i>Vehicles involved</dt><dd>${vehicles.length ? `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} recorded` : 'None recorded'}</dd></div></dl>
    </section>
    <div class="details-grid">
      <div class="detail-column">
        <section class="panel overview-panel" id="overview" tabindex="-1">${panelHeader('align-left', 'Event overview')}<div class="panel-body"><div class="field-label">Description</div><p class="description">${escapeHTML(record.description || 'No description has been recorded for this event.')}</p></div></section>
        <section class="panel vehicles-panel" id="vehicles" tabindex="-1">${panelHeader('car-sideview', 'Vehicles involved', vehicles.length)}${vehicleHTML || emptyState('car-sideview', 'No vehicles recorded', 'No vehicle details were attached to this report.')}</section>
        <section class="panel photos-panel" id="photos" tabindex="-1">${panelHeader('image', 'Report photos', images.length)}${photosHTML ? `<div class="photo-grid">${photosHTML}</div><p class="photo-hint">Select a photo to open the full image in a new tab.</p>` : emptyState('image', 'No photos attached', 'This report does not include supporting images.')}</section>
      </div>
      <div class="detail-column">
        <section class="panel location-panel" id="location" tabindex="-1">${panelHeader('map-marker', 'Event location')}${hasCoordinates ? '<div id="map" role="region" aria-label="Map showing the event location"></div>' : emptyState('map-marker-slash', 'Location unavailable', 'Map coordinates have not been recorded.')}<div class="map-address"><div class="field-label">Recorded address</div><p>${escapeHTML(record.address || 'Address not recorded')}</p>${hasCoordinates ? `<small><i class="uil uil-crosshair" aria-hidden="true"></i> ${coordinates}</small>` : ''}</div>${hasCoordinates ? `<a class="map-link" href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lng}#map=16/${lat}/${lng}" target="_blank" rel="noopener">View larger map<span class="sr-only"> in OpenStreetMap (opens in a new tab)</span><i class="uil uil-external-link-alt" aria-hidden="true"></i></a>` : ''}</section>
        <section class="panel metadata-panel">${panelHeader('file-info-alt', 'Record information')}<dl class="record-info"><div><dt>Report type</dt><dd>${escapeHTML(record.recordType || 'Accident')}</dd></div><div><dt>Recorded on</dt><dd>${escapeHTML(formatDate(record.created_at))}</dd></div><div><dt>Attachments</dt><dd>${images.length} photo${images.length === 1 ? '' : 's'}</dd></div></dl></section>
      </div>
    </div><div class="action-status" id="actionStatus" role="status" aria-live="polite"></div>`;

  document.getElementById('sectionNav').hidden = false;
  document.getElementById('printReport').hidden = false;
  const copyButton = document.getElementById('copyReference');
  if (copyButton) copyButton.addEventListener('click', async () => {
    const status = document.getElementById('actionStatus');
    try {
      await navigator.clipboard.writeText(String(record.case_number));
      status.textContent = 'Case number copied to clipboard.';
    } catch {
      status.textContent = 'Could not copy automatically. Select the case number above to copy it.';
    }
    clearTimeout(copyButton.statusTimer);
    copyButton.statusTimer = setTimeout(() => { status.textContent = ''; }, 5000);
  });

  container.querySelectorAll('[data-report-photo]').forEach(image => {
    image.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'photo-error';
      fallback.textContent = 'Photo unavailable';
      image.parentElement.replaceWith(fallback);
    }, { once: true });
  });

  if (hasCoordinates) {
    const mapElement = document.getElementById('map');
    if (typeof L === 'undefined') {
      mapElement.innerHTML = emptyState('map', 'Map could not be loaded', 'Use the link below to view this location.');
    } else {
      try {
        const map = L.map('map').setView([lat, lng], 15);
        const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
        map.scrollWheelZoom.disable();
        const mapHint = document.createElement('p');
        mapHint.className = 'map-hint';
        mapHint.textContent = 'Use + and - to zoom. Drag to explore.';
        mapElement.insertAdjacentElement('afterend', mapHint);
        tiles.on('tileerror', () => { mapHint.textContent = 'Map tiles are unavailable. Use View larger map below.'; });
        const popup = document.createElement('div');
        popup.textContent = record.address || 'Event location';
        L.marker([lat, lng]).addTo(map).bindPopup(popup);
      } catch (error) {
        console.error('Unable to display the map:', error);
        mapElement.innerHTML = emptyState('map', 'Map could not be loaded', 'Use the link below to view this location.');
      }
    }
  }
};

const showReportState = (title, message, retry = false) => {
  document.getElementById('sectionNav').hidden = true;
  document.getElementById('printReport').hidden = true;
  document.getElementById('accidentDetail').innerHTML = `<div class="panel state"><span class="section-icon" style="margin:auto"><i class="uil uil-file-search-alt" aria-hidden="true"></i></span><h2>${title}</h2><p>${message}</p>${retry ? '<button class="button button-primary" id="retryReport">Try again</button>' : '<a class="button" href="accidentlist.html">Browse reports</a>'}</div>`;
  if (retry) document.getElementById('retryReport').addEventListener('click', loadAccident);
};

const loadAccident = async () => {
  const container = document.getElementById('accidentDetail');
  const id = new URLSearchParams(window.location.search).get('id');
  container.setAttribute('aria-busy', 'true');
  document.getElementById('sectionNav').hidden = true;
  document.getElementById('printReport').hidden = true;
  container.innerHTML = '<div class="panel state"><span class="loader" aria-hidden="true"></span><h2>Loading report</h2><p>Getting the event details...</p></div>';
  try {
    if (!id) {
      showReportState('Choose a report', 'Open an accident or incident from the report list to view its details.');
      return;
    }
    const [accidents, incidents] = await Promise.all(['accident.json', 'incident.json'].map(async file => {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`Unable to load ${file}: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error(`Invalid report data in ${file}`);
      return data;
    }));
    const records = [
      ...accidents.map(record => ({ ...record, recordType: 'Accident' })),
      ...incidents.map(record => ({ ...record, accident_id: record.incident_id, accident_date: record.incident_date, recordType: 'Incident' }))
    ];
    const requestedType = new URLSearchParams(window.location.search).get('type');
    const record = records.find(item => String(item.accident_id) === id && (!requestedType || item.recordType.toLowerCase() === requestedType));
    if (!record) {
      showReportState('Report not found', 'This accident or incident could not be found. Return to the list to select another report.');
      return;
    }
    renderAccidentDetails(record);
  } catch (error) {
    console.error('Error loading report:', error);
    showReportState('Unable to load report', 'The report could not be loaded. Check your connection and try again.', true);
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (!window.workspaceUser) return;
  document.getElementById('printReport').addEventListener('click', () => window.print());
  loadAccident();
});
