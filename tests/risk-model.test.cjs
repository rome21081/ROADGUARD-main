const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', 'Final Project 3rd Year');
const context = vm.createContext({ window: {}, document: { addEventListener() {} }, Date, Map, Set });
vm.runInContext(fs.readFileSync(path.join(root, 'jsFiles/map-safety.js'), 'utf8'), context);
const safety = context.window.MapSafety;
const now = Date.parse('2026-10-20T00:00:00+08:00');
const crash = (id, extra = {}) => ({ accident_id:id, recordType:'Accident', accident_date:'2026-10-' + String((id - 1) % 18 + 1).padStart(2,'0') + ' 12:00:00', latitude:16.7, longitude:121.6, severity:'Moderate', address:'Test intersection', description:'Independent collision ' + id, ...extra });
const build = (records, options = {}) => safety.buildRiskModel(records, { now, ...options });
const pattern = (count, severity='Low', date=null) => build(Array.from({length:count},(_,i)=>crash(i+1,{severity,...(date?{accident_date:date}: {})})));
assert.equal(build([]).areas.length,0);
assert.equal(pattern(1,'Critical').areas[0].tier,'caution');
assert.equal(pattern(1,'Critical').zones.length,0,'One severe incident is not accident-prone');
assert.equal(pattern(2,'Critical').areas[0].tier,'moderate');
assert.equal(pattern(2,'Critical').zones.length,0,'Two serious incidents still require repeat evidence for high risk');
assert.equal(pattern(3,'Low').areas[0].tier,'moderate');
assert.equal(pattern(4,'Low').areas[0].tier,'moderate');
assert.equal(pattern(5,'Low').zones[0].tier,'high','Five eligible incidents qualify regardless of low severity');
assert.equal(pattern(3,'High').zones[0].tier,'high');
assert.equal(pattern(4,'Critical').zones[0].tier,'high','Critical requires at least five eligible incidents');
assert.equal(pattern(5,'High').zones[0].tier,'critical');
assert.equal(pattern(5,'Critical').zones[0].tier,'critical');
const burdenBoundary=build([crash(1,{severity:'High'}),crash(2,{severity:'High'}),crash(3,{severity:'Moderate'})]);
assert.equal(burdenBoundary.zones[0].severityBurden,10);
assert.equal(build([crash(1,{severity:'High'}),crash(2,{severity:'High'}),crash(3,{severity:'Low'})]).zones.length,0);
assert.equal(pattern(5,'High','2024-01-01').areas[0].tier,'high','Old five-event patterns retain the explicit count-based high rule');
assert.equal(pattern(3,'High','2024-01-01').areas[0].tier,'moderate','Recency can prevent the three-event severity route to high risk');
const severe=pattern(3,'Severe'), recent=pattern(3,'Moderate'), older=pattern(3,'Moderate','2024-01-01');
assert(severe.zones[0].score>recent.areas[0].score);
assert(recent.areas[0].score>older.areas[0].score);
for(const area of [...severe.areas,...recent.areas,...older.areas]) assert(Math.abs(area.score-area.factors.frequency*area.factors.severity*area.factors.recency)<1e-10);
assert.equal(build([crash(1),crash(2),crash(3)].map(r=>({...r,accident_date:'2026-10-01 12:00:00'}))).areas[0].totalCount,3,'Independent same-day incidents can count; no separate-day requirement');
assert.equal(build([crash(1),crash(1),crash(1)]).areas[0].totalCount,1);
assert.equal(build([crash(1,{case_number:'CASE-X'}),crash(2,{case_number:'case-x'})]).areas[0].totalCount,1);
const copied=build([crash(1),crash(2,{accident_date:crash(1).accident_date,description:crash(1).description})]);
assert.equal(copied.quality.duplicates,1);
assert.equal(copied.areas[0].tier,'caution');

// Structural reliability is required; no claim of independent real-world verification.
const exclusions=build([
  crash(1,{recordType:'Incident',description:'Residential fire'}),
  crash(2,{latitude:'wrong'}),crash(3,{accident_date:'2027-01-01'}),
  crash(4,{accident_date:'2020-01-01'}),crash(5,{accident_date:undefined}),
  crash(6,{severity:'Unknown'}),crash(7,{verified:false}),crash(8,{verification_status:'pending'}),
  crash(9,{accident_id:undefined}),crash(10,{accident_date:'2026-02-30'})
]);
assert.equal(exclusions.crashes.length,0);
assert.equal(exclusions.quality.undated,2);
assert.equal(exclusions.quality.unknownSeverity,1);
assert.equal(exclusions.quality.unreliable,2);
assert.equal(exclusions.quality.missingIdentifier,1);
assert.equal(safety.isRoadAccident({recordType:'Incident',incident_id:301,description:'Passenger bus collided with SUV'}),true);
assert.equal(safety.isRoadAccident({recordType:'Incident',incident_id:302,description:'Truck overturned due to brake failure'}),true);
const vehicular=build([{recordType:'Incident',incident_id:301,incident_date:'2026-10-01',description:'Car collision',severity:'High',latitude:16.7,longitude:121.6}]);
assert.equal(vehicular.crashes.length,1);
assert.equal(safety.isRoadAccident({recordType:'Incident',description:'Medical emergency on a bus'}),false);
assert.equal(safety.isRoadAccident({recordType:'Incident',description:'A server crash occurred'}),false);
assert.equal(safety.isRoadAccident({recordType:'Incident',description:'Two boats collided'}),false);
assert.equal(safety.isRoadAccident({recordType:'Incident',description:'A collision on the highway'}),true);
assert.equal(build([crash(1,{is_verified:'false'})]).crashes.length,0);
assert.equal(safety.severityWeight('low'),1);assert.equal(safety.severityWeight('high'),4);assert.equal(safety.severityWeight('fatal'),5);assert.equal(safety.severityWeight('unknown'),null);
assert.equal(safety.parseDate('2026-02-30'),null);
assert.equal(safety.parseDate('2026-10-01 12:30:00'),Date.parse('2026-10-01T04:30:00Z'));
assert.equal(safety.parseDate('2026-10-01T12:30:00.123+08:00'),Date.parse('2026-10-01T04:30:00.123Z'));
assert.equal(build([crash(1,{accident_date:'2026-10-20T00:00:00.001+08:00'})]).quality.future,1);
const boundary=safety.monthsAgo(now,36);
assert.equal(boundary,Date.parse('2023-10-20T00:00:00+08:00'));
assert.equal(build([crash(1,{accident_date:'2023-10-20 00:00:00'})]).crashes.length,1);
assert.equal(build([crash(1,{accident_date:'2023-10-19 23:59:59'})]).crashes.length,0);
assert.equal(safety.monthsAgo(Date.parse('2024-02-29T10:30:00+08:00'),12),Date.parse('2023-02-28T10:30:00+08:00'));
assert.equal(safety.monthsAgo(Date.parse('2026-08-31T10:30:00+08:00'),6),Date.parse('2026-02-28T10:30:00+08:00'));
assert.throws(()=>build([],{radius:-1}),/positive/);
assert.throws(()=>build([],{analysisMonths:1.5}),/integer/);
assert.throws(()=>build([],{criticalSeverityBurden:5}),/Critical severity burden/);

const chain=Array.from({length:12},(_,index)=>crash(index+1,{longitude:121.6+index*.0025}));
const model=build(chain), reversed=build([...chain].reverse());
assert.equal(JSON.stringify(model.areas.map(z=>[z.id,z.totalCount,z.score,z.tier])),JSON.stringify(reversed.areas.map(z=>[z.id,z.totalCount,z.score,z.tier])));
assert(model.areas.length>1);
assert.equal(model.areas.reduce((sum,area)=>sum+area.totalCount,0),chain.length);
for(const area of model.areas)for(const item of area.members)assert(safety.distance(area.center,item.point)<=area.radius+.01);
assert.equal(build([crash(1),crash(2,{longitude:122}),crash(3,{longitude:123})]).zones.length,0);
const zone=severe.zones[0], outside=[zone.center[0],zone.center[1]+.006];
assert.equal(safety.proximity(severe,zone.center,null,10).band,'danger');
assert.equal(safety.proximity(pattern(1),zone.center,null,10).band,'warning');
assert.equal(safety.proximity(pattern(2),zone.center,null,10).band,'warning');
assert.equal(safety.proximity(severe,[zone.center[0],zone.center[1]+.0028],null,25).uncertain,true);
assert(Math.abs(safety.proximity(severe,outside,null,10).boundaryDistance-(safety.distance(outside,zone.center)-300))<.01);
const road={geometry:{coordinates:[[121.59,16.7],[121.61,16.7]]},duration:60,distance:2100};
const ranked=safety.rankRoutes([road],severe)[0];
assert.equal(ranked.proneAreas,1);assert.equal(ranked.exposure,3);
assert.equal(safety.rankRoutes([road],pattern(1))[0].proneAreas,0);
assert(safety.rankRoutes([road],pattern(1))[0].risk>0);
assert.equal(safety.rankRoutes([road],exclusions)[0].risk,0);
assert.equal(safety.rankRoutes([road],build([...severe.crashes.map(c=>c.record),severe.crashes[0].record]))[0].risk,ranked.risk);
// Public caution summaries explain the evidence without exposing calculation jargon.
vm.runInContext(fs.readFileSync(path.join(root, 'jsFiles/map-area-ui.js'), 'utf8'), context);
const $ = require('../testscraper/node_modules/cheerio').load(context.window.MapAreaUI.popup(severe.zones[0], now));
assert.equal($('h2').text(), severe.zones[0].name);
assert.equal($('.area-popup').attr('aria-label'), 'Accident-prone area');
assert.equal($('.area-popup-facts strong').first().text(), '3');
assert.equal($('.area-latest strong').length, 1);
assert.equal($('.area-guidance, .area-explanation, details').length, 0);
assert.match($('.area-popup-facts').text(), /recorded crashes/);
assert.doesNotMatch($.text(), /Frequency 3 x|recency 1.00|score|rounded|probability/i);
const malicious = { ...severe.zones[0], name: '<img src=x onerror=alert(1)>' };
const safePopup = require('../testscraper/node_modules/cheerio').load(context.window.MapAreaUI.popup(malicious, now));
assert.equal(safePopup('img').length, 0);
assert.match(safePopup('.area-popup-name').text(), /<img/);
const card = context.window.MapAreaUI.card(severe.zones[0], 0, now, true);
assert.match(card, /View area on map/);
assert.match(card, /Latest crash/);
const cardDOM = require('../testscraper/node_modules/cheerio').load(card);
assert.equal(cardDOM('.area-card button').length, 1);
assert.equal(cardDOM('.area-card-action').attr('data-area-index'), '0');
assert.equal(cardDOM('.area-card-action .area-card-name').text(), severe.zones[0].name);
assert.equal(cardDOM('.area-card .button').length, 0);
assert.doesNotMatch(context.window.MapAreaUI.card(severe.zones[0], 0, now, false), /<button/);
assert.equal(context.window.MapAreaUI.describe(severe.zones[0], now).caution, 'High risk');
assert.match(context.window.MapAreaUI.describe(older.areas[0], now).age, /years ago/);

// Marker popups link each report to the correct full-detail record, including overlaps.
const urlFor = (id, type) => 'accident_view.html?id=' + encodeURIComponent(id) + '&type=' + type;
const event = { ...crash(1), case_number: 'CASE-1' }, incident = { accident_id: 301, recordType: 'Incident', case_number: 'INC-301' };
const popupHTML = context.window.MapAreaUI.recordPopup(event, [event, incident], urlFor);
const eventPopup = require('../testscraper/node_modules/cheerio').load(popupHTML);
assert.equal(eventPopup('a.record-detail-link').attr('href'), 'accident_view.html?id=1&type=accident&from=map');
assert.match(eventPopup('a.record-detail-link').text(), /View full details/);
assert.equal(eventPopup('.same-location-reports a').attr('href'), 'accident_view.html?id=301&type=incident&from=map');
const unsafeRecord = { ...event, accident_id: '1&extra=2', address: '<script>alert(1)</script>' };
const escapedEvent = require('../testscraper/node_modules/cheerio').load(context.window.MapAreaUI.recordPopup(unsafeRecord, [unsafeRecord], urlFor));
assert.equal(escapedEvent('script').length, 0);
assert.equal(escapedEvent('.record-detail-link').attr('href'), 'accident_view.html?id=1%26extra%3D2&type=accident&from=map');
const noID = { ...event, accident_id: undefined };
assert.doesNotMatch(context.window.MapAreaUI.recordPopup(noID, [noID], urlFor), /class="button button-primary record-detail-link"/);

// The dashboard consumes this same model and never synthesizes a demonstration area.
vm.runInContext(fs.readFileSync(path.join(root, 'jsFiles/dashboard.js'), 'utf8'), context);
assert.equal(context.buildDangerZonesFromAccidents([]).length, 0);
const dashboardZones = context.buildDangerZonesFromAccidents([crash(1,{severity:'High'}), crash(2,{severity:'High'}), crash(3,{severity:'High'})]);
assert.equal(dashboardZones.length, 1);
assert.equal(dashboardZones[0].totalCount, severe.zones[0].totalCount);
assert.equal(dashboardZones[0].id, severe.zones[0].id);


const actualRecords=JSON.parse(fs.readFileSync(path.join(root,'htmlFiles/accident.json'),'utf8'));
const actual=build(actualRecords);
console.log('Passed: rule-based caution/moderate/high/critical thresholds, burden boundaries, reliability checks, vehicular incident eligibility, duplicate removal, 36 calendar months/leap days, bounded clustering, GPS caution, routing, public details, and shared dashboard model.');
console.log('Dataset audit: '+actualRecords.length+' accident records; '+actual.crashes.length+' eligible unique incidents; '+actual.zones.length+' accident-prone areas; '+actual.areas.filter(a=>!a.qualifies).length+' caution/moderate areas.');
