const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('../testscraper/node_modules/cheerio');
const root = path.resolve(__dirname, '..', 'Final Project 3rd Year');
const html = cheerio.load(fs.readFileSync(path.join(root, 'htmlFiles/map.html'), 'utf8'));

function makeApp({ mobile = true, speech = false, gpsSupported = true } = {}) {
  const elements = new Map();
  let activeElement = null, frameID = 0, now = Date.parse('2026-10-20T00:00:00+08:00'), gpsSuccess, gpsError, cleared = false;
  let recognition, spoken = [], watchCalls = 0, warningTimerID = 0;
  const warningTimers = new Map();
  let fetchImpl, requests = [], fits = [], views = [], polylines = [], frames = new Map(), resizeCallback;
  class Element {
    constructor(id) {
      this.id = id; this.handlers = {}; this.children = []; this.attributes = {};
      const node = html('#' + id);
      this.value = ''; this.textContent = node.text(); this.innerHTML = '';
      this.hidden = node.is('[hidden]'); this.disabled = node.is('[disabled]'); this.checked = node.is('[checked]');
      this.offsetHeight = id === 'proximityAlert' ? 80 : 0;
      const classes = new Set((node.attr('class') || '').split(/\s+/));
      this.classList = { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
      this.style = { setProperty() {} };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? html('#' + this.id).attr(name); }
    addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
    emit(type, event = {}) { return Promise.all((this.handlers[type] || []).map(fn => fn({ preventDefault() {}, ...event }))); }
    click() { return this.emit('click'); }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; this.innerHTML = ''; this.textContent = ''; }
    focus() { activeElement = this; }
    blur() { if (activeElement === this) activeElement = null; }
    querySelector() { return this.children[0] || null; }
    querySelectorAll() { return this.children; }
  }
  const $ = id => {
    if (!elements.has(id)) { assert.equal(html('#' + id).length, 1, 'Missing UI element: ' + id); elements.set(id, new Element(id)); }
    return elements.get(id);
  };
  const layer = () => ({ addTo() { return this; }, bindPopup() { return this; }, setLatLng() { return this; }, setRadius() { return this; }, on() { return this; }, clearLayers() {} });
  const map = { handlers: {}, on(type, fn) { (this.handlers[type] ??= []).push(fn); }, emit(type, event) { (this.handlers[type] || []).forEach(fn => fn(event)); }, removeLayer() {}, setView(point) { views.push(point); }, fitBounds(points, options) { fits.push({ points, options }); }, invalidateSize() {}, getSize() { return {x:900,y:650}; }, getZoom() { return 14; } };
  const records = [1, 2, 3].map(id => ({ accident_id: id, accident_date: '2026-10-0' + id + ' 12:00:00', latitude: 0, longitude: 0.005, severity: 'Severe', address: 'Test road' }));
  const road = (coordinates, duration = 60) => ({ geometry: { coordinates }, duration, distance: 1200, legs:[{steps:coordinates.map((point,index)=>({name:'Test road '+index,maneuver:{type:index===coordinates.length-1?'arrive':index===0?'depart':'turn',modifier:'right',location:point},geometry:{coordinates:index===coordinates.length-1?[point]:[point,coordinates[index+1]]},distance:500,duration:30}))}] });
  const dangerous = road([[0, 0], [0.01, 0]]), detour = road([[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0]], 120);
  fetchImpl = async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [dangerous, detour] }) });
  const body = new Element('body');
  const document = { body, getElementById: $, createElement: () => new Element('generated-button'), addEventListener() {}, get activeElement() { return activeElement; } };
  const window = { workspaceEscape: s => String(s).replace(/</g, '&lt;'), addEventListener() {}, matchMedia: query => ({ matches: query.includes('max-width') ? mobile : !mobile }) };
  if(speech){
    window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    window.speechSynthesis={speak:utterance=>spoken.push(utterance.text),cancel(){}};
    window.SpeechRecognition=class {constructor(){recognition=this;}start(){this.onstart?.();}abort(){this.onend?.();}};
  }
  const context = vm.createContext({ window, document, navigator: { geolocation: gpsSupported ? { watchPosition(success, error) { watchCalls++; gpsSuccess = success; gpsError = error; return 7; }, clearWatch(id) { assert.equal(id, 7); cleared = true; } } : null }, L: { layerGroup: layer, circleMarker: layer, circle: layer, marker: layer, divIcon: value => value, polyline: (points,options) => { const item={...layer(),points,options};polylines.push(item);return item; } }, Date: class extends Date { static now() { return now; } }, Math, AbortController, setTimeout(fn,ms) { if(ms!==3000)return setTimeout(fn,ms); const handle={warningTimer:++warningTimerID};warningTimers.set(handle,{fn,due:now+ms});return handle; }, clearTimeout(handle) { if(handle?.warningTimer)warningTimers.delete(handle);else clearTimeout(handle); }, requestAnimationFrame(fn) { frames.set(++frameID, fn); return frameID; }, cancelAnimationFrame(id) { frames.delete(id); }, ResizeObserver: class { constructor(fn) { resizeCallback = fn; } observe() {} }, fetch: async (url, options) => { requests.push(url); return fetchImpl(url, options); } });
  for (const file of ['map-safety.js', 'map-guidance.js', 'map-navigation.js']) vm.runInContext(fs.readFileSync(path.join(root, 'jsFiles', file), 'utf8'), context);
  // Isolate network scheduling from route UI tests; the geocoder has separate tests.
  window.MapPlaces = {search: async (term,signal) => (await context.fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(term),{signal})).json(), reverse: async () => null};
  const recordsChanged = window.initializeMapJourney(map, () => records);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const settle = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); flush(); };
  const input = async (key, value) => { $(key + 'Query').value = value; await $(key + 'Query').emit('input'); };
  const choose = async (key, value) => { await input(key, value); await $(key === 'origin' ? 'searchOrigin' : 'searchDestination').emit('click'); };
  return { $, map, records, dangerous, detour, safety: window.MapSafety, window, document, recordsChanged, flush, settle, input, choose, requests, fits, views, polylines, spoken, recognize(text){recognition.onresult({results:[[{transcript:text}]]});recognition.onend();}, advance(ms = 2000) { now += ms; for(const [handle,timer] of warningTimers)if(timer.due<=now){warningTimers.delete(handle);timer.fn();} }, setFetch(fn) { fetchImpl = fn; }, gps(lat, lng, accuracy = 10) { gpsSuccess({ coords: { latitude: lat, longitude: lng, accuracy } }); }, gpsError(code) { gpsError({ code }); }, wasCleared: () => cleared, watchCalls: () => watchCalls, resize() { resizeCallback(); flush(); } };
}

(async () => {
  const app=makeApp(),{$}=app;
  assert.equal($('journeyContent').hidden,true,'Mobile opens with the compact search sheet');
  await $('openRoutePlanner').emit('click');assert.equal($('journeyContent').hidden,false);
  assert.equal(app.document.activeElement,$('destinationQuery'));
  await $('openRoadEvents').emit('click');assert.equal($('eventsView').hidden,false);
  await $('showJourney').emit('click');assert.equal($('journeyView').hidden,false);
  const helper=app.window.MapGuidance;
  const smallPadding=helper.fitPadding({x:180,y:100},400);assert(smallPadding.paddingTopLeft[1]+smallPadding.paddingBottomRight[1]<100);
  assert.equal(helper.instruction({name:'Main Road',maneuver:{type:'turn',modifier:'right'}}),'Turn right onto Main Road');
  assert.equal(helper.instruction({name:'Main Road',maneuver:{type:'continue',modifier:'uturn'}}),'Make a U-turn onto Main Road');
  assert.equal(helper.instruction({maneuver:{type:'roundabout',exit:2}}),'Enter the roundabout and take exit 2');
  const viaSteps=helper.stepsFor({legs:[app.dangerous.legs[0],app.dangerous.legs[0]]});
  assert.equal(viaSteps.filter(step=>step.maneuver.type==='arrive').length,1,'Waypoint arrivals must not be announced as the final destination');
  assert.equal(helper.chooseSafer([{proneAreas:1,areaBurden:1,risk:1,duration:1},{proneAreas:0,areaBurden:0,risk:20,duration:200}]).proneAreas,0);
  const offRoute=helper.projectProgress(helper.stepsFor(app.dangerous),[1,1],0,0);assert(!offRoute||offRoute.metres>1000);
  assert.equal($('saferRoute').disabled,true);
  await app.choose('origin','-0.001, 0');
  assert.equal(app.requests.length,0,'A alone must not request a road route');
  await app.choose('destination','0, 0.011');await app.settle();
  assert.equal(app.requests.length,1,'Selecting B automatically reveals the road route');
  assert.match(app.requests[0],/steps=true/);
  assert.match(app.requests[0],/driving\/0,-0.001;0.011,0/);
  assert.match($('routeSummary').innerHTML,/Recommended road route/);
  assert.match($('routeSummary').innerHTML,/3 unique recorded crashes/);
  assert.equal($('roadGuide').hidden,false);
  assert.equal($('guideDock').hidden,false,'Trip controls remain in the sheet independently of the turn card');
  assert.match($('guideInstruction').textContent,/Start on Test road/);
  assert.equal($('guideDuration').textContent,'1 min');
  assert.match($('guideLength').textContent,/km/);
  assert.equal($('guideContent').hidden,true,'Extra direction tools start closed to keep the map visible');
  await $('toggleGuidePreview').emit('click');
  assert.equal($('guideContent').hidden,false);
  assert.equal($('toggleGuidePreview').getAttribute('aria-expanded'),'true');
  assert.equal($('roadGuide').hidden,false,'Collapsed preview retains trip summary');
  const fitsBeforePreview=app.fits.length;
  await $('guideFitRoute').emit('click');assert(app.fits.length>fitsBeforePreview);
  await $('toggleGuidePreview').emit('click');assert.equal($('guideContent').hidden,true);
  assert.equal($('routeButtonLabel').textContent,'Safer route');
  assert.equal($('journeyContent').hidden,true);
  assert.equal(app.document.activeElement,$('toggleJourney'));
  const requestsBeforeEditing=app.requests.length;
  await $('editRoute').emit('click');
  assert.equal($('journeyContent').hidden,false);assert.equal($('journeyContent').scrollTop,0);
  assert.equal(app.document.activeElement,$('destinationQuery'));assert.equal(app.requests.length,requestsBeforeEditing,'Opening the stop editor preserves the selected route');
  await $('returnToRoute').emit('click');assert.equal($('journeyContent').hidden,true);assert.equal(app.document.activeElement,$('toggleJourney'));
  assert.equal($('voiceCommand').disabled,true,'Unsupported voice commands have a button fallback');
  assert(app.fits.at(-1).points.some(p=>p[0]===-0.001&&p[1]===0));
  assert(app.fits.at(-1).points.some(p=>p[0]===0&&p[1]===.011));
  assert.equal($('saferPreviewNotice').hidden,false);
  const dashedPreview=app.polylines.find(line=>line.options.color==='#16834a'&&line.options.dashArray);
  assert(dashedPreview,'Automatically draw the safer option as a green dashed line');
  assert.equal(dashedPreview.options.interactive,false,'Preview line cannot switch guidance');
  assert.equal($('guideDuration').textContent,'1 min','Main route stays active before confirmation');
  await $('routeOptions').emit('click',{target:{closest:()=>({dataset:{route:'1'}})}});
  assert.equal($('guideDuration').textContent,'1 min','Route cards cannot switch guidance');
  await $('guideSaferRoute').emit('click');await app.settle();
  assert.equal(app.requests.length,1,'Safer route activates the already prepared option');
  assert.equal($('guideDuration').textContent,'2 min');
  assert.equal($('saferPreviewNotice').hidden,true);
  assert.match($('routeSummary').innerHTML,/avoids the currently tagged/);
  assert.match($('routeSummary').innerHTML,/0 unique recorded crashes/);
  assert.match($('guideInstruction').textContent,/Start on Test road/);
  const beforeFit=app.fits.length;app.resize();assert(app.fits.length>beforeFit);
  await $('toggleJourney').emit('click');await $('showEvents').emit('click');
  assert.equal($('eventsView').hidden,false);assert.equal($('journeyFooter').hidden,true);
  await $('showJourney').emit('click');assert.equal($('journeyFooter').hidden,false);
  await $('routeOptions').emit('click',{target:{closest:()=>({dataset:{route:'0'}})}});app.flush();
  assert.match($('routeSummary').innerHTML,/avoids the currently tagged/);
  app.recordsChanged();assert.match($('routeSummary').innerHTML,/avoids the currently tagged/);
  await $('swapLocations').emit('click');await app.settle();
  assert.equal($('originQuery').value,'Pinned location');
  assert.equal($('destinationQuery').value,'Pinned location');
  assert.equal(app.window.mapJourney.hasRoute(),true,'Swap automatically updates the road route');
  await $('clearRoute').emit('click');
  assert.equal($('guideDock').hidden,true);assert.equal($('roadGuide').hidden,true);assert.equal($('originQuery').value,'My current location');assert.equal($('destinationQuery').value,'');
  app.map.emit('click',{latlng:{lat:0,lng:.01}});assert.equal($('destinationQuery').value,'');
  await $('originQuery').emit('focus');await $('pickOnMap').emit('click');
  assert.equal($('mapPickHint').hidden,false);
  app.map.emit('click',{latlng:{lat:0,lng:0}});assert.equal($('originQuery').value,'Pinned location');
  assert.equal($('mapPickHint').hidden,true);

  // GPS-confirmed entry has a prominent alert; uncertain/poor fixes cannot claim entry.
  const voiceToggle=makeApp({speech:true});
  assert.equal(voiceToggle.$('toggleVoice').textContent,'Voice on');
  await voiceToggle.$('toggleVoice').emit('click');assert.equal(voiceToggle.$('toggleVoice').getAttribute('aria-pressed'),'false');
  await voiceToggle.$('toggleVoice').emit('click');assert.equal(voiceToggle.$('toggleVoice').getAttribute('aria-pressed'),'true');
  assert.equal($('toggleVoice').disabled,true,'Unsupported speech keeps a disabled fallback');
  const live=makeApp({speech:true}),el=live.$;
  await el('trackLocation').emit('click');live.gps(0,0);
  assert.match(el('proximityAlert').textContent,/256 m/);
  assert.equal(el('dangerAlert').hidden,true);
  await live.choose('destination','0, 0.01');await live.settle();
  live.gps(0,.004);
  assert.equal(el('dangerAlert').hidden,false);
  assert.equal(el('dangerTitle').textContent,'YOU ARE INSIDE AN ACCIDENT-PRONE AREA');
  assert.equal(el('dangerAlert').getAttribute('role'),'alert');
  assert.equal(el('dangerLocation').textContent,'Test road');
  assert.equal(el('toggleVoice').getAttribute('aria-pressed'),'true','Spoken guidance defaults to on');
  assert.match(live.spoken.at(-1),/inside an accident-prone area/i,'Entry warnings are spoken without enabling voice manually');
  const warningCount=live.spoken.length;
  await el('startGuidance').emit('click');live.gps(0,.0041);
  assert.equal(el('guideMode').textContent,'Live guidance');
  assert.equal(live.spoken.length,warningCount,'Do not repeat entry warnings or interrupt them with navigation');
  live.advance(9000);live.gps(0,.0042);assert(live.spoken.length>warningCount);
  const viewsBefore=live.views.length;
  live.map.emit('dragstart');live.gps(0,.0043);assert.equal(live.views.length,viewsBefore,'Manual panning pauses map following');
  await el('voiceCommand').emit('click');live.recognize('next instruction');
  assert.equal(el('guideMode').textContent,'Route preview');
  await el('voiceCommand').emit('click');live.recognize('resume guidance');
  live.gps(0,.0044);assert.equal(el('guideMode').textContent,'Live guidance');
  live.gps(0,.0044,500);
  assert.equal(el('dangerAlert').hidden,true);assert.match(el('proximityAlert').textContent,/paused/);
  live.gpsError(1);assert(live.wasCleared());assert.match(el('locationStatus').textContent,/permission denied/);
  await live.choose('origin','0, 0');await live.choose('destination','0, 0.01');await live.settle();
  await el('trackLocation').emit('click');live.gpsError(1);assert.equal(el('saferRoute').disabled,false,'Manual road planning survives GPS refusal');

  // Safer routing tests road-based detours and never invents a successful avoidance.
  const blocked=makeApp();blocked.setFetch(async()=>({ok:true,json:async()=>({code:'Ok',routes:[blocked.dangerous]})}));
  await blocked.choose('origin','0, 0');await blocked.choose('destination','0, 0.01');await blocked.settle();
  await blocked.$('journeyForm').emit('submit');await blocked.settle();
  assert.equal(blocked.requests.length,3,'Automatic route alternatives + two bounded waypoint requests; button reuses the results');
  assert(blocked.requests.slice(1).every(url=>url.includes(';')&&url.includes('alternatives=false')));
  assert.match(blocked.$('routeSummary').innerHTML,/No lower-exposure alternative|No tested route avoids/);
  assert.match(blocked.$('routeSummary').innerHTML,/1 tagged accident-prone areas/);

  // Build a road detour automatically, while preserving the original guide until Safer route.
  const autoDetour=makeApp();let roadCalls=0;
  autoDetour.setFetch(async()=>({ok:true,json:async()=>({code:'Ok',routes:[++roadCalls===1?autoDetour.dangerous:autoDetour.detour]})}));
  await autoDetour.choose('origin','0, 0');await autoDetour.choose('destination','0, 0.01');await autoDetour.settle();
  assert.equal(autoDetour.requests.length,2,'Find a waypoint detour automatically and stop when it avoids all areas');
  assert.equal(autoDetour.$('guideDuration').textContent,'1 min');
  assert.equal(autoDetour.$('saferPreviewNotice').hidden,false);
  await autoDetour.$('guideSaferRoute').emit('click');await autoDetour.settle();
  assert.equal(autoDetour.$('guideDuration').textContent,'2 min');
  assert.equal(autoDetour.requests.length,2);
  assert.equal(blocked.$('saferPreviewNotice').hidden,true,'Never advertise a safer option when all candidates have equal exposure');

  // A nearby lower-risk area must not mask entry into an overlapping high-risk area.
  const overlapping=makeApp();overlapping.records.splice(0,overlapping.records.length,
    ...[1,2,3,4,5].map(id=>({accident_id:id,accident_date:'2024-01-0'+id,latitude:0,longitude:.005,severity:'Low',address:'High-frequency road'})),
    ...[6,7].map(id=>({accident_id:id,accident_date:'2026-10-0'+id,latitude:0,longitude:.0086,severity:'Critical',address:'Two-crash caution road'})));
  overlapping.recordsChanged();await overlapping.$('trackLocation').emit('click');overlapping.gps(0,.0068);
  assert.equal(overlapping.$('dangerAlert').hidden,false);
  assert.equal(overlapping.$('dangerLocation').textContent,'High-frequency road');
  overlapping.gps(0,.02);assert.equal(overlapping.$('dangerAlert').hidden,true,'Entry warning clears after leaving the area');

  // Distance cards use tagged area boundaries, last three seconds, and never repeat a band.
  const warnings=makeApp({speech:true}),warn=warnings.$;
  await warn('trackLocation').emit('click');
  const approach=(metres,accuracy=5)=>warnings.gps(0,.005-(300+metres)/111195,accuracy);
  approach(260);assert.equal(warn('dangerAlert').hidden,true);
  for(const threshold of [200,150,100,50,20]) {
    approach(threshold-6);
    assert.equal(warn('dangerAlert').hidden,false);
    assert.equal(warn('dangerTitle').textContent,'ACCIDENT-PRONE AREA WITHIN '+threshold+' M');
    warnings.advance(2999);assert.equal(warn('dangerAlert').hidden,false);
    warnings.advance(1);assert.equal(warn('dangerAlert').hidden,true,'Auto-hide at three seconds');
    const spoken=warnings.spoken.length;
    approach(threshold-5);approach(threshold-7);
    assert.equal(warn('dangerAlert').hidden,true,'Small GPS changes cannot replay this threshold');
    assert.equal(warnings.spoken.length,spoken);
  }
  approach(-10);assert.equal(warn('dangerAlert').hidden,false);
  assert.match(warn('dangerTitle').textContent,/YOU ARE INSIDE/);
  warnings.advance(3000);assert.equal(warn('dangerAlert').hidden,true);
  approach(-20);assert.equal(warn('dangerAlert').hidden,true,'Entry warning does not reappear on every GPS fix');
  approach(300);approach(194);assert.match(warn('dangerTitle').textContent,/200 M/);
  warnings.advance(1500);approach(144);warnings.advance(1500);
  assert.equal(warn('dangerAlert').hidden,false,'A newer threshold gets its own three-second timer');
  warnings.advance(1500);assert.equal(warn('dangerAlert').hidden,true);
  approach(300);approach(35);assert.match(warn('dangerTitle').textContent,/50 M/,'Skipped GPS thresholds show only the nearest crossed warning');
  approach(25,100); // Imprecise GPS must not invent a 20 m threshold.
  assert.doesNotMatch(warn('dangerTitle').textContent,/20 M/);
  await warn('stopLocation').emit('click');warnings.advance(3000);assert.equal(warn('dangerAlert').hidden,true);
  const moderateOnly=makeApp();moderateOnly.records.splice(2);moderateOnly.recordsChanged();
  await moderateOnly.$('trackLocation').emit('click');moderateOnly.gps(0,.004);
  assert.equal(moderateOnly.$('dangerAlert').hidden,true,'Caution/moderate areas do not trigger accident-prone cards');

  // Place lookup retains explicit searches, local suggestions, and stale-response protection.
  await $('clearRoute').emit('click');
  app.setFetch(async()=>({ok:true,json:async()=>[{lat:'16.7',lon:'121.6',display_name:'Echague, Isabela'}]}));
  await app.input('origin','Echague');app.advance();const beforeSearch=app.requests.length;
  await $('searchOrigin').emit('click');assert.equal(app.requests.length,beforeSearch+1);
  assert.equal($('originResults').hidden,false);
  await $('originQuery').emit('keydown',{key:'ArrowDown'});assert.equal(app.document.activeElement,$('originResults').children[0]);
  await $('originResults').children[0].emit('click');assert.equal($('originQuery').value,'Echague, Isabela');
  await app.input('origin','Ech');assert.equal(app.requests.length,beforeSearch+1);assert.equal($('originResults').children.length,1);
  let resolveSearch;app.setFetch(()=>new Promise(resolve=>{resolveSearch=resolve;}));app.advance();
  await app.input('origin','Manila');const pendingSearch=$('searchOrigin').emit('click');await app.input('origin','Baguio');
  resolveSearch({ok:true,json:async()=>[{lat:'14.6',lon:'121',display_name:'Old search result'}]});await pendingSearch;
  assert.equal($('originQuery').value,'Baguio');assert.equal($('originResults').hidden,true);

  // Search selects B directly; A waits for real GPS instead of geocoding a placeholder.
  const pins=makeApp();
  assert.equal(pins.$('originQuery').value,'My current location');assert.equal(pins.watchCalls(),0);
  pins.setFetch(async url=>({ok:true,json:async()=>url.includes('router.project-osrm.org') ? {code:'Ok',routes:[pins.dangerous,pins.detour]} : [{lat:'16.7',lon:'121.6',display_name:'Echague town hall'}]}));
  pins.$('placeQuery').value='Echague'; await pins.$('placeSearchForm').emit('submit');
  assert.equal(pins.$('placeResults').children.length,1);
  await pins.$('placeResults').children[0].emit('click');
  assert.equal(pins.$('destinationQuery').value,'Echague town hall');
  assert.equal(pins.$('originQuery').value,'My current location');
  assert.equal(pins.watchCalls(),1);assert.equal(pins.window.mapJourney.hasRoute(),false,'No road route before GPS supplies A');
  pins.gps(16.69,121.59);await pins.settle();
  assert.equal(pins.window.mapJourney.hasRoute(),true,'GPS completes A to the searched B automatically');
  assert(pins.requests.some(url=>url.includes('driving/121.59,16.69;121.6,16.7')));
  await pins.$('clearRoute').emit('click');assert.equal(pins.$('originQuery').value,'My current location');
  let resolveName; pins.window.MapPlaces.reverse=()=>new Promise(resolve=>resolveName=resolve);
  await pins.$('originQuery').emit('focus'); await pins.$('pickOnMap').emit('click');
  pins.map.emit('click',{latlng:{lat:16.8,lng:121.7}});
  await pins.input('origin','Changed place'); resolveName('Near old pin'); await pins.settle();
  assert.equal(pins.$('originQuery').value,'Changed place','Late reverse lookup cannot overwrite edited input');
  pins.window.MapPlaces.reverse=async()=> 'Near Main Road, Echague';
  await pins.$('originQuery').emit('focus'); await pins.$('pickOnMap').emit('click');
  pins.map.emit('click',{latlng:{lat:16.8,lng:121.7}}); await pins.settle();
  assert.equal(pins.$('originQuery').value,'Near Main Road, Echague');

  // The map control below Fit view always picks destination B, even if A had focus.
  const mapPin=makeApp();mapPin.window.MapPlaces.reverse=async()=> 'Near Destination Road';
  await mapPin.$('originQuery').emit('focus');await mapPin.$('pinDestination').emit('click');
  assert.match(mapPin.$('mapPickText').textContent,/B/);
  assert.equal(mapPin.$('pinDestination').getAttribute('aria-pressed'),'true');
  mapPin.map.emit('click',{latlng:{lat:0,lng:.01}});await mapPin.settle();
  assert.equal(mapPin.$('destinationQuery').value,'Near Destination Road');
  assert.equal(mapPin.$('originQuery').value,'My current location');assert.equal(mapPin.watchCalls(),1);
  mapPin.gps(0,0);await mapPin.settle();assert.equal(mapPin.window.mapJourney.hasRoute(),true);
  assert.equal(mapPin.$('pinDestination').getAttribute('aria-pressed'),'false');
  mapPin.gps(0,0,500);await mapPin.choose('destination','0, 0.02');
  assert.equal(mapPin.window.mapJourney.hasRoute(),false,'A fresh destination waits for a precise GPS fix');
  mapPin.gps(0,0,10);await mapPin.settle();
  assert.equal(mapPin.window.mapJourney.hasRoute(),true,'A precise fix resumes automatic route planning');


  const denied=makeApp();await denied.$('pinDestination').emit('click');
  denied.map.emit('click',{latlng:{lat:0,lng:.01}});denied.gpsError(1);
  assert.equal(denied.$('destinationQuery').value,'Pinned location');
  assert.equal(denied.window.mapJourney.hasRoute(),false);
  assert.match(denied.$('endpointStatus').textContent,/permission denied/);
  await denied.choose('origin','0, 0');await denied.settle();assert.equal(denied.window.mapJourney.hasRoute(),true,'Manual A still works after GPS refusal');
  const unsupported=makeApp({gpsSupported:false});await unsupported.$('pinDestination').emit('click');
  unsupported.map.emit('click',{latlng:{lat:0,lng:.01}});
  assert.match(unsupported.$('endpointStatus').textContent,/unsupported/);
  assert.equal(unsupported.window.mapJourney.hasRoute(),false);

  // Clear aborts automatic road-route requests and a late response cannot restore guidance.
  await $('clearRoute').emit('click');let resolveRoute;
  app.setFetch(()=>new Promise(resolve=>{resolveRoute=resolve;}));
  await app.choose('origin','0, 0');await app.choose('destination','0, 0.01');
  assert.equal($('saferRoute').getAttribute('aria-busy'),'true');
  await $('clearRoute').emit('click');resolveRoute({ok:true,json:async()=>({code:'Ok',routes:[app.dangerous]})});await app.settle();
  assert.equal(app.window.mapJourney.hasRoute(),false);assert.equal($('roadGuide').hidden,true);assert.equal($('saferRoute').getAttribute('aria-busy'),'false');
  const desktop=makeApp({mobile:false});await desktop.choose('origin','0, 0');await desktop.choose('destination','0, 0.01');await desktop.settle();
  assert.equal(desktop.$('journeyContent').hidden,false);
  desktop.setFetch(async()=>{throw Error('offline');});desktop.recordsChanged();await desktop.settle();await desktop.$('journeyForm').emit('submit');await desktop.settle();
  assert.match(desktop.$('routeSummary').textContent,/existing road route is still shown/);
  assert.equal(desktop.$('roadGuide').hidden,false);assert.equal(desktop.$('saferRoute').disabled,false);
  console.log('Passed: automatic A/B road routes, maneuver guidance, safer alternatives and bounded detours, no-false-avoidance fallback, GPS progress, default-on spoken guidance, mute controls/commands, confirmed entry alert, audio priority, unavailable GPS, local search, stale requests, and desktop behavior.');
})().catch(error=>{console.error(error);process.exitCode=1;});
