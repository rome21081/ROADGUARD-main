'use strict';
// One explainable historical crash model for map tags, alerts, and route comparison.
// ROADGUARD defaults are configurable; they are not a verified ALERT-CIA formula.
window.MapSafety = (() => {
  const DAY = 86400000;
  const DEFAULTS = Object.freeze({ radius: 300, analysisMonths: 36, highMinCount: 5, severityMinCount: 3, highSeverityBurden: 10, criticalMinCount: 5, criticalSeverityBurden: 20, approachDistance: 1000, exitBuffer: 50 });
  const rad = n => n * Math.PI / 180;
  const coordinates = record => {
    const lat = Number(record.latitude), lng = Number(record.longitude);
    return record.latitude != null && record.longitude != null && String(record.latitude).trim() && String(record.longitude).trim() && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  };
  const distance = (a, b) => {
    const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  };
  const segmentDistance = (point, a, b) => {
    const project = p => [rad(p[1] - point[1]) * 6371000 * Math.cos(rad(point[0])), rad(p[0] - point[0]) * 6371000];
    const x = project(a), y = project(b), dx = y[0] - x[0], dy = y[1] - x[1];
    const t = dx || dy ? Math.max(0, Math.min(1, -(x[0] * dx + x[1] * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(x[0] + t * dx, x[1] + t * dy);
  };
  const routeDistance = (point, line) => line.length === 1 ? distance(point, line[0]) : line.slice(1).reduce((best, p, i) => Math.min(best, segmentDistance(point, line[i], p)), Infinity);
  const severityWeight = value => {
    const key = String(value || '').trim().toLowerCase();
    return ({low:1, minor:1, moderate:2, medium:2, high:4, severe:4, critical:5, fatal:5})[key] ?? null;
  };
  const tierOrder = { caution: 1, moderate: 2, high: 3, critical: 4 };
  const tierLabel = tier => ({caution:'Crash caution area', moderate:'Moderate-risk area', high:'High-risk accident-prone area', critical:'Critical-risk accident-prone area'})[tier];
  const monthsAgo = (time, months) => {
    // Calendar months in Philippine time, clamped for leap days/month-end.
    const local = new Date(time + 8 * 3600000);
    const first = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(local.getUTCDate(), lastDay), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()) - 8 * 3600000;
  };
  const isRoadAccident = record => {
    const type = String(record.recordType || record.record_type || '').trim().toLowerCase();
    const details = [record.description, record.category, record.type_name, record.incident_type_name, record.accident_type_name].filter(Boolean).join(' ');
    const vehicleContext = /\b(car|truck|motorcycle|bus|tricycle|jeepney|vehicle|van|pedestrian)\b/i.test(details);
    const vehicleEvent = /\b(hit|struck|overturned|skidded|brake failure|collision|accident)\b/i.test(details);
    const roadContext = /\b(road|highway|traffic|intersection|vehicular)\b/i.test(details);
    const crashEvent = /\b(crash|collid\w*|collision|vehicular|traffic accident|car accident|road accident|vehicle accident|rear[- ]end\w*|sideswip\w*|hit[- ]and[- ]run|vehicle rollover)\b/i.test(details);
    const vehicleCrash = (vehicleContext && vehicleEvent) || ((vehicleContext || roadContext) && crashEvent);
    const nonRoadCrash = /\b(server|software|computer|aircraft|airplane|helicopter|ship|boat|vessel)\b/i.test(details);
    if (nonRoadCrash && !vehicleContext && !roadContext) return false;
    const nonCrash = /\b(holdup|naholdup|robbery|house fire|residential fire|medical emergency|lightning strike)\b/i.test(details);
    if (nonCrash && !vehicleCrash) return false;
    if (vehicleCrash) return true;
    if (['accident','road accident','traffic accident','vehicular accident','vehicular incident','road incident','crash'].includes(type)) return true;
    return !type && record.accident_id != null && record.incident_id == null;
  };
  const parseDate = value => {
    // Source dates without a timezone are Philippine local time, not browser local time.
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(String(value || '').trim());
    if (!match) return null;
    const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '', zone = '+08:00'] = match;
    const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (Number(year) < 1900 || calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
    const time = Date.parse(year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second + fraction + zone);
    return Number.isFinite(time) ? time : null;
  };
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const buildRiskModel = (records, options = {}) => {
    const config = { ...DEFAULTS, ...options }, now = options.now ?? Date.now();
    for (const key of Object.keys(DEFAULTS)) {
      if (!Number.isFinite(config[key]) || config[key] <= 0) throw new RangeError('Risk-model option must be positive: ' + key);
    }
    if (['highMinCount','severityMinCount','criticalMinCount'].some(key => !Number.isInteger(config[key]))) throw new RangeError('Incident count thresholds must be integers');
    if (config.highMinCount < config.severityMinCount || config.criticalMinCount < config.highMinCount) throw new RangeError('Risk count thresholds must be ordered');
    if (!Number.isInteger(config.analysisMonths)) throw new RangeError('Analysis months must be an integer');
    if (config.criticalSeverityBurden < config.highSeverityBurden) throw new RangeError('Critical severity burden must be at least the high-risk burden');
    if (!Number.isFinite(now)) throw new RangeError('Risk-model time must be finite');
    const analysisStart = monthsAgo(now, config.analysisMonths);
    const quality = { total: records.length, invalidCoordinates: 0, nonCrash: 0, duplicates: 0, undated: 0, future: 0, expired: 0, unknownSeverity: 0, unreliable: 0, missingIdentifier: 0 };
    const recencyBounds = [6,12,24].map(months => monthsAgo(now, months));
    const candidates = [];
    for (const record of records) {
      if (!isRoadAccident(record)) { quality.nonCrash++; continue; }
      const state = String(record.verification_status || record.validation_status || record.status || '').trim().toLowerCase();
      const explicitlyFalse = value => [false,0,'false','0','no'].includes(value);
      if (explicitlyFalse(record.verified) || explicitlyFalse(record.is_verified) || explicitlyFalse(record.reliable) || explicitlyFalse(record.is_reliable) || [true,1,'true','1'].includes(record.is_duplicate) || ['rejected','invalid','unverified','pending','pending verification','duplicate','unreliable'].includes(state)) { quality.unreliable++; continue; }
      if ([record.accident_id,record.incident_id,record.case_number].every(value => value == null || ['', 'unknown','n/a','none','-'].includes(normalize(value)))) { quality.missingIdentifier++; continue; }
      const point = coordinates(record);
      if (!point) { quality.invalidCoordinates++; continue; }
      const timestamp = parseDate(record.accident_date || record.incident_date);
      if (timestamp === null) { quality.undated++; continue; }
      if (timestamp > now) { quality.future++; continue; }
      if (timestamp < analysisStart) { quality.expired++; continue; }
      const weight = severityWeight(record.severity);
      if (weight === null) { quality.unknownSeverity++; continue; }
      const recency = timestamp >= recencyBounds[0] ? 1 : timestamp >= recencyBounds[1] ? .75 : timestamp >= recencyBounds[2] ? .5 : .25;
      const key = [normalize(record.incident_id != null ? 'incident:' + record.incident_id : record.accident_id), normalize(record.case_number), timestamp ?? '', point.join(','), normalize(record.description), weight].join('|');
      candidates.push({ record, point, timestamp, weight, recency, score: weight * recency, key });
    }
    // Sort first so duplicate handling and clustering cannot depend on fetch order.
    candidates.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
    const seenIDs = new Set(), seenCases = new Set(), crashes = [];
    for (const item of candidates) {
      const id = normalize(item.record.incident_id != null ? 'incident:' + item.record.incident_id : item.record.accident_id), caseNumber = normalize(item.record.case_number);
      const meaningfulCase = caseNumber && !['unknown', 'n/a', 'none', '0', '-'].includes(caseNumber);
      const duplicate = (id && seenIDs.has(id)) || (meaningfulCase && seenCases.has(caseNumber)) || (item.timestamp !== null && crashes.some(other => other.timestamp === item.timestamp && normalize(other.record.description) === normalize(item.record.description) && distance(other.point, item.point) <= 20));
      if (duplicate) { quality.duplicates++; continue; }
      if (id) seenIDs.add(id);
      if (meaningfulCase) seenCases.add(caseNumber);
      crashes.push(item);
    }
    crashes.sort((a, b) => a.key.localeCompare(b.key));
    // Greedy densest neighbourhoods, each bounded by one 300 m radius. No chain
    // can bridge distant intersections, and each crash contributes to one zone.
    let remaining = crashes.filter(item => item.timestamp !== null);
    const areas = [];
    const neighbourhoods = new Map(remaining.map(seed => [seed, remaining.filter(item => distance(seed.point, item.point) <= config.radius)]));
    while (remaining.length) {
      const available = new Set(remaining);
      const seeds = remaining.map(seed => {
        const members = neighbourhoods.get(seed).filter(item => available.has(item));
        return { seed, members, score: members.reduce((sum, item) => sum + item.score, 0) };
      }).sort((a, b) => b.members.length - a.members.length || b.score - a.score || a.seed.key.localeCompare(b.seed.key));
      const { seed, members } = seeds[0];
      const mean = [members.reduce((sum, item) => sum + item.point[0], 0) / members.length, members.reduce((sum, item) => sum + item.point[1], 0) / members.length];
      const center = members.every(item => distance(mean, item.point) <= config.radius) ? mean : seed.point;
      const distinctDays = new Set(members.map(item => Math.floor((item.timestamp + 8 * 3600000) / DAY))).size;
      const seriousCount = members.filter(item => item.weight >= 4).length;
      const frequency = members.length;
      const severityTotal = members.reduce((sum, item) => sum + item.weight, 0);
      const severity = severityTotal / frequency;
      // Severity-weighted recency preserves each crash's severity/age pairing.
      const recency = members.reduce((sum, item) => sum + item.weight * item.recency, 0) / severityTotal;
      // F x S x R is equivalent to summing severity x recency for unique crashes.
      const score = Math.round(frequency * severity * recency * 1e12) / 1e12;
      const factors = { frequency, severity, recency };
      const severityBurden = score;
      const tier = frequency >= config.criticalMinCount && severityBurden >= config.criticalSeverityBurden ? 'critical'
        : frequency >= config.highMinCount || (frequency >= config.severityMinCount && severityBurden >= config.highSeverityBurden) ? 'high'
        : frequency >= 2 ? 'moderate' : 'caution';
      const qualifies = tier === 'high' || tier === 'critical';
      const id = 'area-' + center.map(n => n.toFixed(5)).join('-');
      const name = members.map(item => String(item.record.address || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))[0] || 'Recorded crash location';
      areas.push({ id, center, radius: config.radius, name, members, totalCount: members.length, seriousCount, distinctDays, factors, score, severityBurden, qualifies, tier, label: tierLabel(tier), firstDate: Math.min(...members.map(item => item.timestamp)), lastDate: Math.max(...members.map(item => item.timestamp)) });
      const assigned = new Set(members);
      remaining = remaining.filter(item => !assigned.has(item));
    }
    areas.sort((a,b) => tierOrder[b.tier] - tierOrder[a.tier] || b.score - a.score || a.id.localeCompare(b.id));
    const zones = areas.filter(area => area.qualifies);
    const membership = new Map();
    areas.forEach(area => area.members.forEach(item => membership.set(item.record, area)));
    return { config, now, analysisStart, analysisEnd:now, crashes, areas, zones, membership, quality, method:'rule-based' };
  };
  const areaEvidence = area => area.totalCount + ' unique crashes on ' + area.distinctDays + ' separate days; ' + area.seriousCount + ' severe/critical/fatal. Frequency ' + area.factors.frequency + ' x severity ' + area.factors.severity.toFixed(2) + ' x recency ' + area.factors.recency.toFixed(2) + ' = score ' + area.score.toFixed(2) + '. Displayed factors are rounded.';
  const rankRoutes = (routes, recordsOrModel) => {
    const model = Array.isArray(recordsOrModel) ? buildRiskModel(recordsOrModel) : recordsOrModel;
    return routes.map(route => {
      const points = route.geometry.coordinates.map(p => [p[1], p[0]]);
      const nearby = model.crashes.filter(item => routeDistance(item.point, points) <= model.config.radius);
      const nearbyZones = model.zones.filter(zone => routeDistance(zone.center, points) <= zone.radius);
      const risk = nearby.reduce((sum, item) => sum + item.score, 0) + nearbyZones.reduce((sum, zone) => sum + zone.score, 0);
      return { ...route, points, risk, exposure: nearby.length, proneAreas: nearbyZones.length, areaBurden:nearbyZones.reduce((sum,zone)=>sum+zone.score,0) };
    }).sort((a, b) => a.risk - b.risk || a.duration - b.duration);
  };
  const proximity = (model, point, previous, accuracy = 0, activeID = null) => {
    const zones = model.areas.map(zone => ({ zone, centerDistance: distance(point, zone.center) })).sort((a, b) => Math.max(0, a.centerDistance - a.zone.radius) - Math.max(0, b.centerDistance - b.zone.radius) || b.zone.score - a.zone.score);
    const retained = zones.find(item => item.zone.id === activeID && item.centerDistance <= item.zone.radius + accuracy + model.config.exitBuffer);
    const nearest = retained || zones[0];
    if (!nearest) return null;
    const { zone, centerDistance } = nearest;
    const boundaryDistance = Math.max(0, centerDistance - zone.radius);
    const inside = centerDistance + accuracy <= zone.radius;
    const uncertain = !inside && centerDistance - accuracy <= zone.radius;
    const approaching = !!previous && distance(previous, zone.center) - centerDistance > Math.max(10, accuracy);
    return { zone, centerDistance, boundaryDistance, inside, uncertain, approaching, band: inside && zone.qualifies ? 'danger' : boundaryDistance <= model.config.approachDistance || uncertain ? 'warning' : '' };
  };
  const formatDistance = n => n < 1000 ? Math.round(n) + ' m' : (n / 1000).toFixed(1) + ' km';
  return { DEFAULTS, monthsAgo, tierLabel, coordinates, distance, segmentDistance, routeDistance, severityWeight, parseDate, isRoadAccident, buildRiskModel, areaEvidence, rankRoutes, proximity, formatDistance };
})();
