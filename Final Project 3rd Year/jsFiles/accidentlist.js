'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('directoryHeading')) {
    window.location.replace('accidentlist.html?view=directory&v=20261015-3');
    return;
  }
  if (!window.workspaceUser) return;
  const escape = window.workspaceEscape;
  const list = document.getElementById('accidentList');
  const pagination = document.getElementById('pagination');
  const search = document.getElementById('searchInput');
  const type = document.getElementById('reportType');
  const severity = document.getElementById('severityFilter');
  const sort = document.getElementById('sortReports');
  const status = document.getElementById('listStatus');
  const clear = document.getElementById('clearFilters');
  const params = new URLSearchParams(window.location.search);
  let records = [], page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const pageSize = 10;
  search.value = params.get('q') || '';
  type.value = ['accident', 'incident'].includes(params.get('type')) ? params.get('type') : 'all';
  severity.value = ['minor', 'moderate', 'severe', 'unknown'].includes(params.get('severity')) ? params.get('severity') : 'all';
  sort.value = ['oldest', 'case'].includes(params.get('sort')) ? params.get('sort') : 'newest';
  const severityKey = value => {
    const key = String(value || '').toLowerCase();
    if (['severe', 'critical', 'fatal'].includes(key)) return 'severe';
    return ['minor', 'moderate'].includes(key) ? key : 'unknown';
  };
  const timestamp = record => new Date(String(record.accident_date || '').replace(' ', 'T')).getTime() || 0;
  const rememberFilters = () => {
    try {
      const query = new URLSearchParams();
      if (search.value.trim()) query.set('q', search.value.trim());
      if (type.value !== 'all') query.set('type', type.value);
      if (severity.value !== 'all') query.set('severity', severity.value);
      if (sort.value !== 'newest') query.set('sort', sort.value);
      if (page > 1) query.set('page', page);
      window.history.replaceState(null, '', 'accidentlist.html' + (query.size ? '?' + query : ''));
    } catch {}
  };
  const render = () => {
    const term = search.value.trim().toLowerCase();
    const filtered = records.filter(record =>
      (type.value === 'all' || record.recordType === type.value) &&
      (severity.value === 'all' || severityKey(record.severity) === severity.value) &&
      [record.address, record.case_number, record.description].some(value => String(value || '').toLowerCase().includes(term))
    ).sort((a, b) => sort.value === 'case' ? String(a.case_number || '').localeCompare(String(b.case_number || ''), undefined, {numeric:true}) : sort.value === 'oldest' ? timestamp(a) - timestamp(b) : timestamp(b) - timestamp(a));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages);
    const from = filtered.length ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(page * pageSize, filtered.length);
    status.textContent = filtered.length ? 'Showing ' + from + ' - ' + to + ' of ' + filtered.length + ' matching reports' : 'No reports match your filters';
    clear.hidden = !term && type.value === 'all' && severity.value === 'all' && sort.value === 'newest';
    list.innerHTML = filtered.length ? filtered.slice((page - 1) * pageSize, page * pageSize).map(record => {
      const label = String(record.severity || 'Unknown');
      const date = new Date(String(record.accident_date || '').replace(' ', 'T'));
      const validDate = !Number.isNaN(date.getTime());
      const day = validDate ? date.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : 'Not recorded';
      const time = validDate ? date.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}) : '';
      const href = window.ROADGUARD.reportURL(record.accident_id, record.recordType);
      const reference = record.case_number || 'No case number';
      return '<tr><td><a class="report-reference" href="' + href + '"><span class="case-symbol"><i class="uil uil-file-alt" aria-hidden="true"></i></span><strong>' + escape(reference) + '</strong></a></td><td data-label="Report type"><span class="type-label ' + record.recordType + '"><i class="uil uil-' + (record.recordType === 'incident' ? 'file-exclamation-alt' : 'car-sideview') + '" aria-hidden="true"></i>' + (record.recordType === 'incident' ? 'Incident' : 'Accident') + '</span></td><td data-label="Location"><span class="report-location">' + escape(record.address || 'Location not recorded') + '</span></td><td data-label="Date &amp; time"><span class="report-date">' + escape(day) + '</span><span class="report-time">' + escape(time) + '</span></td><td data-label="Severity"><span class="severity severity-' + severityKey(label) + '">' + escape(label) + '</span></td><td><a class="report-open" href="' + href + '" aria-label="View report ' + escape(reference) + '">View details<i class="uil uil-arrow-up-right" aria-hidden="true"></i></a></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty"><i class="uil uil-search" aria-hidden="true"></i><p>No matching reports</p><small>Try another case number, location, or filter.</small></div></td></tr>';
    const pageNumbers = [...new Set([1, page - 1, page, page + 1, pages])].filter(number => number >= 1 && number <= pages).sort((a, b) => a - b);
    let previous = 0;
    const numbersHTML = pageNumbers.map(number => {
      const gap = previous && number - previous > 1 ? '<span class="pagination-ellipsis" aria-hidden="true">...</span>' : '';
      previous = number;
      return gap + '<button class="page-number" data-page="' + number + '" aria-label="Page ' + number + '"' + (number === page ? ' aria-current="page"' : '') + '>' + number + '</button>';
    }).join('');
    pagination.hidden = false;
    pagination.innerHTML = '<span>' + (filtered.length ? from + ' - ' + to : '0') + ' of ' + filtered.length + ' reports</span><div class="pagination-buttons"><button class="button" id="previousPage"' + (page === 1 ? ' disabled' : '') + '>Previous</button>' + numbersHTML + '<button class="button" id="nextPage"' + (page === pages ? ' disabled' : '') + '>Next</button></div>';
    document.getElementById('previousPage').addEventListener('click', () => changePage(page - 1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(page + 1));
    rememberFilters();
  };
  const changePage = number => { page = Math.max(1, number); render(); document.getElementById('directoryHeading').scrollIntoView({block:'start'}); };
  pagination.addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (button) changePage(Number(button.dataset.page));
  });
  const filterChanged = () => { page = 1; render(); };
  search.addEventListener('input', filterChanged);
  for (const control of [type, severity, sort]) control.addEventListener('change', filterChanged);
  clear.addEventListener('click', () => { search.value = ''; type.value = 'all'; severity.value = 'all'; sort.value = 'newest'; filterChanged(); search.focus(); });
  try {
    const [accidents, incidents] = await Promise.all(['accident.json', 'incident.json'].map(async file => {
      const result = await fetch(file, {cache:'no-store'});
      if (!result.ok) throw new Error('Reports unavailable');
      const data = await result.json();
      if (!Array.isArray(data)) throw new Error('Invalid report data');
      return data;
    }));
    records = [...accidents.map(record => ({...record, recordType:'accident'})), ...incidents.map(record => ({...record, accident_id:record.incident_id, accident_date:record.incident_date, recordType:'incident'}))];
    document.getElementById('totalReports').textContent = String(records.length);
    document.getElementById('accidentCount').textContent = String(accidents.length);
    document.getElementById('incidentCount').textContent = String(incidents.length);
    document.getElementById('severeCount').textContent = String(records.filter(record => severityKey(record.severity) === 'severe').length);
    document.getElementById('directoryTotal').textContent = records.length + ' total reports';
    render();
  } catch {
    status.textContent = 'Reports could not be loaded.';
    document.getElementById('directoryTotal').textContent = 'Unavailable';
    list.innerHTML = '<tr><td colspan="6"><div class="empty"><p>Unable to load reports</p><small>Your report data is temporarily unavailable.</small><a class="button" href="accidentlist.html?view=directory&amp;v=20261015-3">Try again</a></div></td></tr>';
  } finally { list.setAttribute('aria-busy', 'false'); }
});
