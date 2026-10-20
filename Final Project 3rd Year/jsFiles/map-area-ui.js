'use strict';
// Public-facing area summaries. Calculation details remain in the model documentation.
window.MapAreaUI = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const describe = (area, now = Date.now()) => {
    const days = Math.max(0, Math.floor((now - area.lastDate) / 86400000));
    const age = days === 0 ? 'Today' : days === 1 ? '1 day ago' : days < 30 ? days + ' days ago' : days < 365 ? Math.floor(days / 30) + ' month' + (Math.floor(days / 30) === 1 ? '' : 's') + ' ago' : Math.floor(days / 365) + ' year' + (Math.floor(days / 365) === 1 ? '' : 's') + ' ago';
    const latest = new Date(area.lastDate).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' });
    return {
      caution: ({caution:'Caution',moderate:'Moderate risk',high:'High risk',critical:'Critical risk'})[area.tier],
      title: area.qualifies ? 'Accident-prone area' : area.tier === 'moderate' ? 'Moderate-risk area' : 'Recorded crash caution',
      history: area.totalCount + ' recorded crashes on ' + area.distinctDays + ' different days',
      serious: area.seriousCount ? area.seriousCount + ' serious crash' + (area.seriousCount === 1 ? '' : 'es') : 'No serious crashes recorded',
      latest, age,
      explanation: area.qualifies ? 'Tagged by rule-based checks of how often crashes happened, how severe they were, and how recently they occurred within 36 months.' : 'Shown for caution using eligible crash history within 36 months. This area does not meet the high or critical accident-prone rules.',
      note: 'Based on recorded crash history. This is not a live incident alert.'
    };
  };
  const popup = (area, now) => {
    const info = describe(area, now);
    return '<section class="area-popup" aria-label="' + escape(info.title) + '"><span class="area-caution area-caution-' + area.tier + '">' + escape(info.caution) + '</span><h2 class="area-popup-name">' + escape(area.name) + '</h2><p class="area-popup-facts"><strong>' + area.totalCount + '</strong> recorded crash' + (area.totalCount === 1 ? '' : 'es') + ' &middot; ' + area.seriousCount + ' serious</p><p class="area-latest"><span>Latest crash</span><strong>' + escape(info.latest) + '</strong></p></section>';
  };
  const card = (area, index, now, canLocate) => {
    const info = describe(area, now);
    const content = '<span class="area-card-top"><span class="area-caution area-caution-' + area.tier + '">' + escape(info.caution) + '</span>' + (canLocate ? '<span class="area-card-arrow" aria-hidden="true">&rarr;</span>' : '') + '</span><span class="area-card-name">' + escape(area.name) + '</span><span class="area-card-meta">' + area.totalCount + ' recorded crash' + (area.totalCount === 1 ? '' : 'es') + ' &middot; ' + area.seriousCount + ' serious</span><span class="area-card-latest">Latest crash: ' + escape(info.latest) + '</span>';
    return '<article class="area-card">' + (canLocate ? '<button class="area-card-action" type="button" data-area-index="' + index + '">' + content + '<span class="sr-only">View area on map</span></button>' : '<div class="area-card-static">' + content + '</div>') + '</article>';
  };
  const recordPopup = (record, related, reportURL) => {
    const canOpen = record.accident_id != null && String(record.accident_id).trim() !== '';
    const detailLink = item => reportURL(item.accident_id, String(item.recordType || 'Accident').toLowerCase()) + '&from=map';
    const others = related.filter(item => item !== record && item.accident_id != null && String(item.accident_id).trim() !== '');
    return '<section class="record-popup"><span class="record-popup-type">' + escape(record.recordType || 'Accident') + ' report</span><h2>' + escape(record.address || 'Recorded event location') + '</h2><p class="record-popup-reference">' + escape(record.case_number || 'Case number not recorded') + '</p><dl class="record-popup-facts"><div><dt>Severity</dt><dd>' + escape(record.severity || 'Unknown') + '</dd></div><div><dt>Date &amp; time</dt><dd>' + escape(record.accident_date || 'Not recorded') + '</dd></div></dl>' + (record.description ? '<p class="record-popup-description">' + escape(String(record.description).slice(0, 180)) + (String(record.description).length > 180 ? '...' : '') + '</p>' : '') + (canOpen ? '<a class="button button-primary record-detail-link" href="' + escape(detailLink(record)) + '">View full details<span class="sr-only"> for ' + escape(record.case_number || record.recordType || 'this report') + '</span><i class="uil uil-arrow-right" aria-hidden="true"></i></a>' : '<p>Full details are unavailable because the report has no identifier.</p>') + (others.length ? '<details class="same-location-reports"><summary>' + others.length + ' other report' + (others.length === 1 ? '' : 's') + ' at this point</summary><ul>' + others.map(item => '<li><a href="' + escape(detailLink(item)) + '">' + escape(item.case_number || String(item.recordType || 'Accident') + ' #' + item.accident_id) + '<small>' + escape(item.accident_date || 'Date not recorded') + ' &middot; ' + escape(item.severity || 'Unknown') + '</small></a></li>').join('') + '</ul></details>' : '') + '</section>';
  };
  return { describe, popup, card, recordPopup };
})();
