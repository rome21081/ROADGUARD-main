'use strict';

window.initializeMapJourney = (map, getRecords, getRiskModel = null) => {
  const $ = id => document.getElementById(id);
  const { coordinates, distance, routeDistance, rankRoutes, formatDistance, buildRiskModel, proximity } = window.MapSafety;
  const escape = window.workspaceEscape;
  const panel = $('journeyPanel');
  const endpoints = { origin: null, destination: null };
  const endpointMarkers = { origin: null, destination: null };
  const inputs = { origin: $('originQuery'), destination: $('destinationQuery') };
  const resultLists = { origin: $('originResults'), destination: $('destinationResults') };
  const recentPlaces = new Map(), searchCache = new Map();
  let pinVersion = 0, pinController, useCurrentOrigin = true;
  const nameControllers = new Set();
  let riskModel = buildRiskModel(getRecords()), gpsAccuracy = 0, activeZoneID = null, lastRerouteArea = null;
  const model = () => getRiskModel ? getRiskModel() : riskModel;
  const routeLayer = map ? L.layerGroup().addTo(map) : null;
  let position = null, previous = null, watch = null, userMarker = null, accuracyCircle = null;
  let activeField = 'destination', picking = false, pendingOrigin = false, pendingCenter = false;
  let routes = [], selected = 0, routeEndpoints = null, busy = false, routeVersion = 0, routeController, alternativesChecked = false;
  let searchVersion = 0, searchBusy = false, searchController, lastSearch = 0, lastRouteAt = 0;
  let fitFrame = null, viewMode = 'explore', routeMode = 'standard', routingNotice = '', recordsKnown = getRecords().length > 0, dangerZone = null;
  const guidance = window.MapGuidance.create({
    onStart: () => { $('followLocation').checked=true;startTracking(false, true); },
    onStop: () => { $('followLocation').checked = false; },
    onReroute: () => findRoute(routes.length ? 'safer' : 'standard'),
    onFit: () => fitRoute(),
    onPlan: () => { if (!endpoints.origin && position) chooseEndpoint('origin',position,'My current location',true); $('showJourney').click(); }
  });
  const summary = $('routeSummary'), alert = $('proximityAlert'), status = $('endpointStatus');
  const duration = seconds => {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + minutes % 60 + ' min' : '');
  };
  const syncButton = () => {
    const hasStart = endpoints.origin && (!endpoints.origin.live || position);
    $('saferRoute').disabled = !hasStart || !endpoints.destination || !map || busy;
    $('swapLocations').disabled = busy || (!endpoints.origin && !endpoints.destination);
    $('saferRoute').setAttribute('aria-busy', String(busy));
    $('journeyForm').setAttribute('aria-busy', String(busy));
    $('routeButtonLabel').textContent = busy ? 'Finding route...' : routes.length || !endpoints.origin || !endpoints.destination ? 'Safer route' : 'Retry road route';
    guidance.setBusy(busy);
    panel.classList.toggle('has-route',routes.length > 0);
  };
  const fitRoute = () => {
    if (!map || !routes.length || !routeEndpoints) return false;
    // Include the requested endpoints as well as OSRM's snapped road geometry.
    viewMode = 'route';
    $('followLocation').checked = false;
    map.invalidateSize({ pan: false });
    const desktopCollapsed = window.matchMedia('(min-width: 761px)').matches && panel.classList.contains('is-collapsed');
    const bannerTop = 12;
    const stack = $('mapGuidanceStack');
    const alertPadding = (stack.offsetHeight || 0) ? bannerTop + stack.offsetHeight + 12 : alert.hidden ? 0 : bannerTop + alert.offsetHeight + 12;
    const topPadding = Math.max(36, desktopCollapsed ? 100 : 0, alertPadding);
    const padding = window.MapGuidance.fitPadding(map.getSize(),topPadding);
    if (desktopCollapsed) padding.paddingTopLeft[0] = Math.min((panel.offsetWidth || 340) + 24, Math.max(0,map.getSize().x - padding.paddingBottomRight[0] - 64));
    map.fitBounds([...routes[selected].points, ...(saferPreview()?.points || []), ...routeEndpoints, ...Object.values(endpoints).filter(Boolean).map(endpoint => endpoint.point)], { ...padding, maxZoom: 16, animate: false });
    return true;
  };
  const scheduleFit = () => {
    if (fitFrame !== null) cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      fitFrame = null;
      map?.invalidateSize({ pan: false });
      if (viewMode === 'route') fitRoute();
    });
  };
  const setExpanded = expanded => {
    panel.classList.toggle('is-collapsed', !expanded);
    $('main').classList.toggle('panel-minimized', !expanded);
    $('journeyContent').hidden = !expanded;
    $('journeyFooter').hidden = !expanded || $('journeyView').hidden;
    $('toggleJourney').setAttribute('aria-expanded', String(expanded));
    $('sheetToggleLabel').textContent = expanded ? 'Minimize route panel' : 'Expand route panel';
    scheduleFit();
  };
  const closeSuggestions = () => {
    Object.keys(resultLists).forEach(key => {
      resultLists[key].replaceChildren();
      resultLists[key].hidden = true;
      inputs[key].setAttribute('aria-expanded', 'false');
    });
  };
  const cancelSearch = () => {
    searchVersion++;
    searchController?.abort();
    searchBusy = false;
    $('searchOrigin').disabled = false;
    $('searchDestination').disabled = false;
    inputs.origin.setAttribute('aria-busy', 'false');
    inputs.destination.setAttribute('aria-busy', 'false');
  };
  const invalidateRoute = () => {
    routeVersion++;
    routeController?.abort();
    busy = false;
    routes = [];
    alternativesChecked = false;
    routeMode = 'standard';
    guidance.clear();
    routeEndpoints = null;
    routeLayer?.clearLayers();
    $('routeOptions').replaceChildren();
    summary.textContent = 'Select A and B to show the road route automatically.';
    $('journeyTitle').textContent = 'Explore Isabela';
    $('journeyPreview').textContent = 'Search a place or plan a safer journey';
    syncButton();
  };
  const clearEndpointMarker = key => {
    if (endpointMarkers[key]) map?.removeLayer(endpointMarkers[key]);
    endpointMarkers[key] = null;
  };
  const paintEndpoint = key => {
    clearEndpointMarker(key);
    if (!map || !endpoints[key]) return;
    const letter = key === 'origin' ? 'A' : 'B';
    endpointMarkers[key] = L.marker(endpoints[key].point, {
      icon: L.divIcon({ className: 'endpoint-icon', html: '<span class="endpoint-pin endpoint-pin-' + letter.toLowerCase() + '">' + letter + '</span>', iconSize: [30, 30], iconAnchor: [15, 15] }),
      title: letter + ': ' + endpoints[key].label,
      alt: letter + ': ' + endpoints[key].label,
      zIndexOffset: 900
    }).addTo(map).bindPopup('<strong>' + letter + (key === 'origin' ? ' · Starting point' : ' · Destination') + '</strong><br>' + escape(endpoints[key].label));
  };
  const stopPicking = () => {
    picking = false;
    document.body.classList.remove('is-picking');
    $('mapPickHint').hidden = true;
    $('pickOnMap').setAttribute('aria-pressed', 'false');
    $('pinDestination').setAttribute('aria-pressed', 'false');
  };
  const chooseEndpoint = (key, point, label, live = false) => {
    cancelSearch();
    invalidateRoute();
    endpoints[key] = { point: [...point], label, live };
    inputs[key].value = label;
    if (key === 'origin') { pendingOrigin = false; useCurrentOrigin = live; }
    activeField = key === 'origin' ? 'destination' : 'origin';
    paintEndpoint(key);
    closeSuggestions();
    stopPicking();
    if (!live) {
      recentPlaces.delete(label);
      recentPlaces.set(label, { point: [...point], label });
      if (recentPlaces.size > 8) recentPlaces.delete(recentPlaces.keys().next().value);
    }
    status.textContent = (key === 'origin' ? 'Starting point' : 'Destination') + ' selected. ' + (endpoints.origin && endpoints.destination ? 'Loading the road route...' : 'Choose ' + (key === 'origin' ? 'your destination.' : 'your starting point.'));
    syncButton();
    if (endpoints.origin && endpoints.destination) {
      if (endpoints.origin.live && !position) startTracking(true);
      else findRoute('standard');
    }
    else if (key === 'destination' && useCurrentOrigin) startTracking(true);
  };
  const nameEndpoint = (key, point) => {
    chooseEndpoint(key, point, 'Pinned location');
    const endpoint = endpoints[key], controller = new AbortController();
    nameControllers.add(controller);
    window.MapPlaces.reverse(point, controller.signal).then(label => {
      // A name lookup must never move a pin or restore an edited/cleared endpoint.
      if (!label || endpoints[key] !== endpoint || controller.signal.aborted) return;
      recentPlaces.delete(endpoint.label);
      endpoint.label = label;
      inputs[key].value = label;
      paintEndpoint(key);
      recentPlaces.set(label, { point: [...point], label });
    }).catch(() => {}).finally(() => nameControllers.delete(controller));
  };
  const showSuggestions = (key, places) => {
    closeSuggestions();
    const list = resultLists[key];
    places.forEach(place => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'place-result';
      button.textContent = place.label;
      button.addEventListener('click', () => {
        chooseEndpoint(key, place.point, place.label);
        if (!endpoints.origin || !endpoints.destination) inputs[key].focus({ preventScroll: true });
        if (map && (!endpoints.origin || !endpoints.destination)) map.setView(place.point, 14, { animate: false });
      });
      list.append(button);
    });
    list.hidden = !places.length;
    inputs[key].setAttribute('aria-expanded', String(places.length > 0));
  };
  const parseCoordinates = term => {
    const pair = term.split(',').map(value => value.trim());
    return pair.length === 2 ? coordinates({ latitude: pair[0], longitude: pair[1] }) : null;
  };
  const searchPlace = async key => {
    activeField = key;
    setExpanded(true);
    const term = inputs[key].value.trim(), point = parseCoordinates(term);
    if (key === 'origin' && useCurrentOrigin && term === 'My current location') { startTracking(true); return; }
    if (point) { nameEndpoint(key, point); return; }
    if (term.length < 3) { status.textContent = 'Enter at least 3 characters of a place, road, or landmark.'; inputs[key].focus(); return; }
    if (endpoints[key]?.label === term) { status.textContent = 'This location is already selected.'; return; }
    const cacheKey = term.toLowerCase();
    if (searchCache.has(cacheKey)) {
      const places = searchCache.get(cacheKey);
      showSuggestions(key, places);
      status.textContent = places.length ? 'Choose a matching place below.' : 'No places found. Try a nearby town or pick on the map.';
      return;
    }
    if (searchBusy || Date.now() - lastSearch < 1100) { status.textContent = 'Please wait a moment before another place search.'; return; }
    const version = ++searchVersion;
    searchBusy = true;
    lastSearch = Date.now();
    searchController = new AbortController();
    const controller = searchController, timeout = setTimeout(() => controller.abort(), 15000);
    $('searchOrigin').disabled = true;
    $('searchDestination').disabled = true;
    inputs[key].setAttribute('aria-busy', 'true');
    closeSuggestions();
    status.textContent = 'Searching places in the Philippines...';
    try {
      const response = await window.MapPlaces.search(term, controller.signal);
      const data = response;
      if (version !== searchVersion) return;
      if (!Array.isArray(data)) throw new Error();
      const places = data.map(place => ({ point: coordinates({ latitude: place.lat, longitude: place.lon }), label: String(place.display_name || 'Unnamed place') })).filter(place => place.point);
      searchCache.set(cacheKey, places);
      if (searchCache.size > 30) searchCache.delete(searchCache.keys().next().value);
      showSuggestions(key, places);
      status.textContent = places.length ? 'Choose a matching place below.' : 'No places found. Try a nearby town or pick on the map.';
    } catch {
      if (version === searchVersion) status.textContent = 'Place search is unavailable. Try again or pick a location on the map.';
    } finally {
      clearTimeout(timeout);
      if (version === searchVersion) {
        searchBusy = false;
        $('searchOrigin').disabled = false;
        $('searchDestination').disabled = false;
        inputs[key].setAttribute('aria-busy', 'false');
      }
    }
  };
  Object.keys(inputs).forEach(key => {
    const input = inputs[key];
    input.addEventListener('focus', () => { activeField = key; });
    input.addEventListener('input', () => {
      activeField = key;
      cancelSearch();
      if (endpoints[key]) { endpoints[key] = null; clearEndpointMarker(key); invalidateRoute(); }
      if (key === 'origin') { pendingOrigin = false; useCurrentOrigin = false; }
      const term = input.value.trim().toLowerCase();
      const places = term ? [...recentPlaces.values()].reverse().filter(place => place.label.toLowerCase().includes(term)) : [];
      showSuggestions(key, places);
      status.textContent = places.length ? 'Recent places. Choose one or search for more.' : 'Press Search to find a place, road, or landmark.';
      syncButton();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); searchPlace(key); }
      if (event.key === 'Escape') { cancelSearch(); closeSuggestions(); }
      if (event.key === 'ArrowDown' && !resultLists[key].hidden) { event.preventDefault(); resultLists[key].querySelector('button')?.focus(); }
    });
    resultLists[key].addEventListener('keydown', event => {
      if (event.key === 'Escape') { closeSuggestions(); input.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = [...resultLists[key].querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    });
  });
  const clearPin = () => {
    pinVersion++; pinController?.abort();
    $('placeResults').replaceChildren(); $('placeResults').hidden = true;
    $('placeSearchPopover').hidden = true;
    $('placeQuery').setAttribute('aria-expanded', 'false');
    $('placeQuery').setAttribute('aria-busy', 'false');
  };
  const selectPin = place => {
    if (!map) { $('placeStatus').textContent = 'Map unavailable. Try again when the map has loaded.'; return; }
    clearPin();
    $('placeQuery').value = place.label;
    viewMode = 'explore'; $('followLocation').checked = false;
    map.setView(place.point,16,{animate:false});
    chooseEndpoint('destination',place.point,place.label);
    $('showJourney').click(); setExpanded(true);
    // The chosen place is already B. GPS supplies A; manual A remains editable.
    inputs.destination.blur(); $('toggleJourney').focus({preventScroll:true});
  };
  $('placeSearchForm').addEventListener('submit', async event => {
    event.preventDefault();
    const term = $('placeQuery').value.trim();
    clearPin(); $('placeSearchPopover').hidden = false;
    if (term.length < 3) { $('placeStatus').textContent = 'Enter at least 3 characters of a place name.'; return; }
    const version = pinVersion;
    pinController = new AbortController();
    $('placeQuery').setAttribute('aria-busy', 'true');
    $('placeStatus').textContent = 'Searching places in the Philippines...';
    try {
      const data = await window.MapPlaces.search(term, pinController.signal);
      if (version !== pinVersion) return;
      if (!Array.isArray(data)) throw new Error();
      const places = data.map(item => ({point: coordinates({latitude:item.lat,longitude:item.lon}), label:String(item.display_name || item.name || 'Unnamed place')})).filter(item => item.point);
      places.forEach(place => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'place-result'; button.textContent = place.label;
        button.addEventListener('click', () => selectPin(place)); $('placeResults').append(button);
      });
      $('placeResults').hidden = !places.length;
      $('placeQuery').setAttribute('aria-expanded', String(places.length > 0));
      $('placeStatus').textContent = places.length ? 'Choose your destination to set B and plan the route.' : 'No places found. Add a town or landmark and search again.';
    } catch { if (version === pinVersion) $('placeStatus').textContent = 'Place search is unavailable. Try again or use Pick on map in the route planner.'; }
    finally { if (version === pinVersion) $('placeQuery').setAttribute('aria-busy', 'false'); }
  });
  $('placeQuery').addEventListener('input', clearPin);
  $('placeQuery').addEventListener('keydown', event => {
    if (event.key === 'Escape') { clearPin(); }
    if (event.key === 'ArrowDown' && !$('placeResults').hidden) { event.preventDefault(); $('placeResults').querySelector('button')?.focus(); }
  });
  $('placeResults').addEventListener('keydown', event => {
    if (event.key === 'Escape') { clearPin(); $('placeQuery').focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); const buttons = [...$('placeResults').querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  });
  $('clearPlacePin').addEventListener('click', () => { clearPin(); $('placeQuery').value = ''; $('placeQuery').focus(); });
  $('searchOrigin').addEventListener('click', () => searchPlace('origin'));
  $('searchDestination').addEventListener('click', () => searchPlace('destination'));
  $('swapLocations').addEventListener('click', () => {
    cancelSearch(); closeSuggestions(); stopPicking(); pendingOrigin = false; useCurrentOrigin = false;
    invalidateRoute();
    [endpoints.origin, endpoints.destination] = [endpoints.destination, endpoints.origin];
    Object.keys(endpoints).forEach(key => {
      if (endpoints[key]) endpoints[key] = { ...endpoints[key], live: false, label: endpoints[key].live ? 'Selected location' : endpoints[key].label };
      inputs[key].value = endpoints[key]?.label || '';
      paintEndpoint(key);
    });
    activeField = endpoints.origin ? 'destination' : 'origin';
    status.textContent = 'Starting point and destination swapped. Updating the road route...';
    syncButton();
    if (endpoints.origin && endpoints.destination) findRoute('standard');
  });
  const beginPicking = (key = activeField) => {
    activeField = key;
    if (!map) { status.textContent = 'Map unavailable. Use place search.'; return; }
    cancelSearch(); closeSuggestions();
    picking = true;
    document.body.classList.add('is-picking');
    $('pickOnMap').setAttribute('aria-pressed', 'true');
    $('pinDestination').setAttribute('aria-pressed', String(key === 'destination'));
    $('mapPickText').textContent = 'Tap the map to set ' + (activeField === 'origin' ? 'A · starting point' : 'B · destination');
    $('mapPickHint').hidden = false;
    inputs[activeField].blur();
    setExpanded(false);
    $('cancelMapPick').focus({ preventScroll: true });
  };
  $('pickOnMap').addEventListener('click', () => beginPicking());
  $('pinDestination').addEventListener('click', () => beginPicking('destination'));
  $('cancelMapPick').addEventListener('click', () => { stopPicking(); setExpanded(true); $(activeField === 'destination' ? 'pinDestination' : 'pickOnMap').focus(); });
  map?.on('click', event => {
    if (!picking) return;
    const point = [event.latlng.lat, event.latlng.lng];
    nameEndpoint(activeField, point);
    setExpanded(true);
    if (!endpoints.origin || !endpoints.destination) inputs[activeField].focus({ preventScroll: true });
  });
  const lowerExposure = (candidate,current) => candidate.proneAreas < current.proneAreas || (candidate.proneAreas === current.proneAreas && (candidate.areaBurden < current.areaBurden || (candidate.areaBurden === current.areaBurden && candidate.risk < current.risk)));
  const saferPreview = () => {
    if (!recordsKnown || !routes[selected]?.proneAreas) return null;
    const candidate = window.MapGuidance.chooseSafer(routes);
    return candidate !== routes[selected] && lowerExposure(candidate,routes[selected]) ? candidate : null;
  };
  const paintRoute = () => {
    if (!map || !routes.length) return;
    routeLayer.clearLayers();
    const preview = saferPreview();
    routes.forEach((route, index) => {
      if (index !== selected && route !== preview) L.polyline(route.points, { color: '#687c9b', weight: 5, opacity: .5, interactive: false }).addTo(routeLayer);
    });
    const route = routes[selected];
    L.polyline(route.points, { color: '#ffffff', weight: 10, opacity: .85, interactive: false }).addTo(routeLayer);
    L.polyline(route.points, { color: routeMode === 'safer' ? '#16834a' : '#2684ff', weight: 6, opacity: 1, interactive: false }).addTo(routeLayer);
    if (preview) L.polyline(preview.points, { color: '#16834a', weight: 5, dashArray: '10 9', opacity: .95, interactive: false }).addTo(routeLayer);
    $('saferPreviewNotice').hidden = !preview;
    $('saferPreviewText').textContent = preview?.proneAreas ? 'Green dashed: lower exposure; some risk areas remain.' : 'Green dashed: avoids tagged accident-prone areas.';
    const note = !recordsKnown ? 'Crash data is unavailable; this route has not been assessed for accident-prone areas.' : routeMode === 'safer' ? routingNotice : preview ? 'Recommended road route. A safer option is shown as a green dashed line; select Safer route to use its directions.' : alternativesChecked && route.proneAreas ? 'Recommended road route. No lower-exposure alternative was found; accident-prone areas remain along the route.' : 'Recommended road route. Use Safer route to check alternatives around accident-prone areas.';
    summary.innerHTML = '<p class="route-summary-note">' + note + '</p><details class="route-risk-details"><summary>Road safety summary</summary><p>' + route.exposure + ' unique recorded crashes nearby; ' + route.proneAreas + ' tagged accident-prone areas. ' + (route.risk ? 'Recorded crash history remains along this route.' : 'No eligible crash history within 300 m. Unrecorded risks may remain.') + (routes.length === 1 ? ' No alternative was returned.' : '') + '</p><small>Travel time is an estimate without live traffic.</small></details>';
    $('journeyTitle').textContent = duration(route.duration) + ' · ' + formatDistance(route.distance);
    $('journeyPreview').textContent = (routeMode === 'safer' ? 'Safer route check' : 'Road route') + ' · ' + route.exposure + ' crashes / ' + route.proneAreas + ' prone areas';
    $('routeOptions').innerHTML = routes.filter(item => item === route || item === preview).map((item) => '<article class="route-option ' + (item === route ? 'selected' : '') + '" aria-label="' + (item === route ? 'Current route' : item === preview ? 'Safer route preview' : 'Alternative route') + '"><span><strong>' + (item === route ? 'Current route' : item === preview ? 'Safer option &middot; preview' : 'Alternative') + '</strong><small>' + item.exposure + ' unique crashes / ' + item.proneAreas + ' prone areas &middot; ' + formatDistance(item.distance) + '</small>' + (item === preview ? '<small>Green dashed line &middot; select Safer route to use</small>' : '') + '</span><span>' + duration(item.duration) + '</span></article>').join('');
    guidance.setRoute(route);
    syncButton();
  };
  const findRoute = async (mode = 'standard') => {
    if (!endpoints.origin || !endpoints.destination || (endpoints.origin.live && !position) || !map || busy) return;
    if (mode === 'safer' && !recordsKnown) { summary.textContent = 'Crash data is unavailable. Refresh road events before requesting an assessed safer route.'; setExpanded(true); return; }
    const oldRoute = routes[selected], oldEndpoints = routeEndpoints, oldMode = routeMode;
    const unique = values => { const found=new Map(); values.forEach(route=>{const key=JSON.stringify(route.geometry);if(!found.has(key))found.set(key,route);}); return [...found.values()]; };
    const start = [...(mode === 'preview' && oldEndpoints ? oldEndpoints[0] : mode === 'safer' && position && (guidance.isActive() || endpoints.origin.live) ? position : endpoints.origin.point)], end = [...(mode === 'preview' && oldEndpoints ? oldEndpoints[1] : endpoints.destination.point)];
    if (mode === 'safer' && alternativesChecked && oldRoute && oldEndpoints && distance(start,oldEndpoints[0])<20 && distance(end,oldEndpoints[1])<20) {
      const chosen = window.MapGuidance.chooseSafer(routes);
      selected = routes.indexOf(chosen); routeMode = 'safer';
      routingNotice = lowerExposure(chosen,oldRoute) ? (chosen.proneAreas === 0 ? 'This route avoids the currently tagged accident-prone areas. Unrecorded hazards may remain.' : 'Lower-exposure route selected. Accident-prone areas remain along the route.') : 'No lower-exposure alternative was found. ' + (chosen.proneAreas ? 'Accident-prone areas remain along the route.' : 'The selected route has no currently tagged accident-prone areas.');
      paintRoute(); guidance.notice(routingNotice); status.textContent=routingNotice; scheduleFit(); return;
    }
    if (distance(start,end) < 10) { status.textContent = 'A and B are too close. Choose a different destination.'; return; }
    cancelSearch(); closeSuggestions(); stopPicking();
    Object.values(inputs).forEach(input => input.blur());
    busy = true; syncButton();
    const version = ++routeVersion;
    routeController = new AbortController();
    const controller = routeController, timeout = setTimeout(() => controller.abort(), 25000);
    lastRouteAt = Date.now();
    summary.textContent = mode === 'safer' ? 'Checking road alternatives and detours around accident-prone areas...' : 'Loading the road route and directions...';
    status.textContent = 'Finding your journey. You can still explore the map.';
    const request = async (points, alternatives = true) => {
      const response = await fetch('https://router.project-osrm.org/route/v1/driving/' + points.map(p=>p[1]+','+p[0]).join(';') + '?alternatives=' + alternatives + '&steps=true&geometries=geojson&overview=full', {signal:controller.signal});
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) throw new Error();
      return data.routes;
    };
    let fallbackRoutes = null, fallbackGeometry = null;
    try {
      let candidates = await request([start,end]);
      if (mode === 'preview' && oldRoute) candidates = unique([oldRoute,...candidates]);
      if (version !== routeVersion) return;
      let assessed = rankRoutes(unique(candidates),model());
      const primary = mode === 'preview' && oldRoute ? assessed.find(route=>route.geometry===oldRoute.geometry) : [...assessed].sort((a,b)=>a.duration-b.duration || a.distance-b.distance)[0];
      const primaryGeometry = primary.geometry;
      fallbackRoutes = assessed; fallbackGeometry = primaryGeometry;
      if (recordsKnown && primary.proneAreas > 0 && window.MapGuidance.chooseSafer(assessed).proneAreas > 0) {
        const first = window.MapGuidance.chooseSafer(assessed);
        const blocked = model().zones.filter(zone => routeDistance(zone.center,first.points)<=zone.radius).sort((a,b)=>distance(start,a.center)-distance(start,b.center))[0];
        if (blocked) {
          // Two bounded perpendicular waypoint candidates; accept only real road
          // geometries returned by OSRM and score every complete detour again.
          for (const waypoint of window.MapGuidance.detourPoints(start,end,blocked)) {
            try { candidates.push(...await request([start,waypoint,end],false)); }
            catch (error) { if (controller.signal.aborted) throw error; }
            if (version !== routeVersion) return;
            if (window.MapGuidance.chooseSafer(rankRoutes(unique(candidates),model())).proneAreas === 0) break;
          }
        }
        assessed = rankRoutes(unique(candidates),model());
      }
      if (mode === 'safer' && oldRoute && oldEndpoints && distance(start,oldEndpoints[0])<20 && distance(end,oldEndpoints[1])<20) {
        // A failed avoidance search must not replace a better existing route.
        assessed = rankRoutes(unique([oldRoute,...candidates]),model());
      }
      routes = assessed.sort((a,b)=>a.duration-b.duration || a.distance-b.distance);
      selected = mode === 'safer' ? routes.indexOf(window.MapGuidance.chooseSafer(routes)) : Math.max(0,routes.findIndex(route=>route.geometry===primaryGeometry));
      alternativesChecked = recordsKnown;
      routeMode = mode === 'preview' ? oldMode : mode;
      const chosen = routes[selected];
      routingNotice = chosen.proneAreas === 0 ? 'This route avoids the currently tagged accident-prone areas. Unrecorded hazards may remain.' : 'No tested route avoids every tagged accident-prone area. Showing the lowest tagged-area exposure found.';
      if (mode === 'safer' && oldRoute && chosen.proneAreas === oldRoute.proneAreas && chosen.areaBurden >= oldRoute.areaBurden && chosen.risk >= oldRoute.risk) routingNotice = chosen.proneAreas === 0 ? 'No lower-exposure alternative was found. The selected route has no currently tagged accident-prone areas.' : 'No lower-exposure alternative was found. Accident-prone areas remain along the route.';
      routeEndpoints = [start,end];
      if (mode === 'safer' && position && guidance.isActive()) {
        endpoints.origin = {point:start,label:'My current location',live:true}; inputs.origin.value=endpoints.origin.label; paintEndpoint('origin');
      }
      paintRoute(); if (mode !== 'preview') viewMode = 'route';
      if (position) guidance.updatePosition(position,gpsAccuracy);
      if (mode==='safer') guidance.notice(routingNotice);
      status.textContent = mode === 'safer' ? routingNotice : saferPreview() ? 'Road route ready. Green dashed line shows a safer option; select Safer route to change directions.' : 'Road route ready. No lower-exposure alternative is currently available.';
      if (mode === 'preview' && guidance.isActive()) return;
      $('followLocation').checked = false;
      if (window.matchMedia('(max-width: 760px)').matches) {
        if (!$('journeyContent').hidden) { $('toggleJourney').focus({preventScroll:true}); setExpanded(false); } else scheduleFit();
      } else scheduleFit();
    } catch {
      if (version === routeVersion) {
        if (oldRoute) {
          paintRoute(); summary.textContent = 'Safer-route search failed. Your existing road route is still shown; try again.';if(mode === 'safer')guidance.notice(summary.textContent);
        } else if (fallbackRoutes?.length) {
          routes = rankRoutes(fallbackRoutes,model());
          selected = Math.max(0,routes.findIndex(route=>route.geometry === fallbackGeometry));
          routeEndpoints = [start,end]; routeMode = 'standard'; alternativesChecked = false;
          paintRoute(); scheduleFit();
          summary.textContent = 'Main road route is shown. The safer-option search could not finish; select Safer route to retry.';
        } else {
          invalidateRoute(); summary.textContent = 'Could not find a road route. Try again or move A and B closer to accessible roads.';
        }
        status.textContent = 'Your selected locations are saved. Try finding the route again.'; setExpanded(true);
      }
    } finally {
      clearTimeout(timeout);
      if (version === routeVersion) { busy = false; syncButton(); }
    }
  };
  $('journeyForm').addEventListener('submit', event => { event.preventDefault(); findRoute(routes.length ? 'safer' : 'standard'); });
  $('clearRoute').addEventListener('click', () => {
    cancelSearch(); closeSuggestions(); stopPicking(); pendingOrigin = false;
    endpoints.origin = null; endpoints.destination = null;
    useCurrentOrigin = true;
    inputs.origin.value = 'My current location'; inputs.destination.value = '';
    clearEndpointMarker('origin'); clearEndpointMarker('destination'); invalidateRoute();
    activeField = 'destination'; status.textContent = 'Journey cleared. Search or pin your destination; A uses your location.';
    inputs.destination.focus({ preventScroll: true });
  });
  const updateProximity = () => {
    if (!position) return;
    alert.hidden = false;
    const risk = model();
    risk.zones.forEach(zone => { if (distance(position,zone.center)>zone.radius+gpsAccuracy+risk.config.exitBuffer) guidance.leaveArea(zone.id); });
    const entered = risk.zones.filter(zone=>distance(position,zone.center)+gpsAccuracy<=zone.radius).sort((a,b)=>(b.tier==='critical')-(a.tier==='critical') || b.score-a.score)[0];
    if (entered) { dangerZone=entered; guidance.updateDanger(entered,true); }
    else if (dangerZone && risk.zones.some(zone=>zone.id===dangerZone.id) && distance(position,dangerZone.center)<=dangerZone.radius+gpsAccuracy+risk.config.exitBuffer) guidance.updateDanger(dangerZone,false);
    else {dangerZone=null;guidance.updateDanger(null);}
    guidance.updateApproach(risk.zones,position,gpsAccuracy,risk.config.exitBuffer);
    const nearest = proximity(risk, position, previous, gpsAccuracy, activeZoneID);
    if (!nearest) {
      activeZoneID = null; lastRerouteArea = null;
      alert.className = 'proximity-banner';
      alert.textContent = 'No eligible road-risk areas are available. ' + risk.crashes.length + ' unique crash records are available. This does not mean the road is safe.';
      return;
    }
    const { zone, boundaryDistance, inside, uncertain, approaching, band } = nearest;
    alert.hidden=!!dangerZone || (zone.qualifies && boundaryDistance<=200+gpsAccuracy);
    activeZoneID = nearest.centerDistance <= zone.radius + gpsAccuracy + risk.config.exitBuffer ? zone.id : null;
    if (boundaryDistance > risk.config.approachDistance) lastRerouteArea = null;
    alert.className = 'proximity-banner ' + band;
    const label = inside ? 'Inside ' + zone.label.toLowerCase() + '. ' : uncertain ? 'Near a recorded risk-area boundary; GPS accuracy makes entry uncertain. ' : 'Nearest ' + zone.label.toLowerCase() + '. ';
    alert.textContent = label + (inside ? '' : formatDistance(boundaryDistance) + ' to the area boundary at ') + zone.name + ' (' + zone.totalCount + ' unique crashes on ' + zone.distinctDays + ' days).' + (approaching ? ' Approaching.' : '') + ' Straight-line distance.';
    const onJourney = routes.length && routeDistance(position, routes[selected].points) <= Math.max(100, gpsAccuracy);
    const areaOnRoute = routes.length && routeDistance(zone.center, routes[selected].points) <= zone.radius;
    if (zone.qualifies && endpoints.origin?.live && onJourney && areaOnRoute && boundaryDistance <= risk.config.approachDistance && approaching && zone.id !== lastRerouteArea && Date.now() - lastRouteAt > 60000) {
      lastRerouteArea = zone.id;
      findRoute('preview');
    }
  };
  const removeLocationLayers = () => {
    if (userMarker) map?.removeLayer(userMarker);
    if (accuracyCircle) map?.removeLayer(accuracyCircle);
    userMarker = null; accuracyCircle = null;
  };
  const stopTracking = (message = 'Location tracking stopped. Manual route planning is still available.') => {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null; pendingOrigin = false; pendingCenter = false;
    if (endpoints.origin?.live) {
      // Keep the last valid A as a fixed point when the user stops GPS.
      if (position || coordinates({latitude:endpoints.origin.point[0],longitude:endpoints.origin.point[1]})) {
        endpoints.origin = { point: [...(position || endpoints.origin.point)], label: 'Last known location', live: false };
        inputs.origin.value = endpoints.origin.label;
        paintEndpoint('origin');
      } else { endpoints.origin = null; inputs.origin.value = ''; clearEndpointMarker('origin'); invalidateRoute(); }
    }
    position = null; previous = null; activeZoneID = null; removeLocationLayers();
    $('stopLocation').hidden = true; $('trackLocation').disabled = false;
    $('locationStatus').textContent = message;
    guidance.resetWarnings();
    alert.hidden = true; dangerZone=null;guidance.updateDanger(null);guidance.updatePosition(null,Infinity);guidance.pause(message);
    $('followLocation').checked = false;
    syncButton();
  };
  const startTracking = (useAsOrigin = true, center = false) => {
    if (!map) { status.textContent = 'The map could not load. Refresh the page and try again.';guidance.pause(status.textContent); return; }
    if (!navigator.geolocation) { status.textContent = 'Location is unsupported in this browser. Search for A or pick it on the map.';guidance.pause(status.textContent); return; }
    if (useAsOrigin) { useCurrentOrigin = true; if (!endpoints.origin) inputs.origin.value = 'My current location'; }
    pendingOrigin = useAsOrigin;
    pendingCenter = center;
    if (position) {
      if (useAsOrigin) chooseEndpoint('origin', position, 'My current location', true);
      if (center) { viewMode = 'follow'; map.setView(position, Math.max(14, map.getZoom()), { animate: false }); }
      pendingCenter=false;
      return;
    }
    status.textContent = 'Waiting for your location. Allow location access when your browser asks.';
    $('locationStatus').textContent = 'Waiting for a precise location...';
    $('stopLocation').hidden = false;
    if (watch !== null) return;
    watch = navigator.geolocation.watchPosition(fix => {
      if (!Number.isFinite(fix.coords.accuracy) || fix.coords.accuracy < 0 || fix.coords.accuracy > 200 || !coordinates({latitude:fix.coords.latitude,longitude:fix.coords.longitude})) {
        position = null; previous = null; removeLocationLayers();
        guidance.dismissWarning();dangerZone=null;guidance.updateDanger(null);guidance.updatePosition(null,Infinity);
        // Preserve the last road route while GPS is imprecise.
        syncButton();
        $('locationStatus').textContent = 'Location accuracy is +/-' + Math.round(fix.coords.accuracy) + ' m. Waiting for a more precise fix.';
        status.textContent = 'GPS is imprecise. You can search for A or pick it on the map.';
        alert.hidden = false; alert.className = 'proximity-banner'; alert.textContent = 'Precise location unavailable. Distance alerts are paused.';
        return;
      }
      previous = position; position = [fix.coords.latitude, fix.coords.longitude]; gpsAccuracy = fix.coords.accuracy;
      if (userMarker) userMarker.setLatLng(position);
      else userMarker = L.circleMarker(position, { radius: 7, color: '#fff', weight: 3, fillColor: '#2786ff', fillOpacity: 1 }).addTo(map).bindPopup('Your current location');
      if (accuracyCircle) accuracyCircle.setLatLng(position).setRadius(fix.coords.accuracy);
      else accuracyCircle = L.circle(position, { radius: fix.coords.accuracy, color: '#2786ff', weight: 1, fillOpacity: .1 }).addTo(map);
      if (pendingOrigin) chooseEndpoint('origin', position, 'My current location', true);
      else if (endpoints.origin?.live) { endpoints.origin.point = [...position]; endpointMarkers.origin?.setLatLng(position); }
      $('locationStatus').textContent = 'Location active · accuracy +/-' + Math.round(fix.coords.accuracy) + ' m · ' + new Date().toLocaleTimeString();
      if (pendingCenter || $('followLocation').checked) { viewMode = 'follow'; map.setView(position, Math.max(14, map.getZoom()), { animate: false }); }
      pendingCenter = false;
      syncButton(); updateProximity(); guidance.updatePosition(position,gpsAccuracy);
    }, error => {
      const message = error.code === 1 ? 'Location permission denied. Search for A or choose it on the map.' : error.code === 3 ? 'Location timed out. Try again, or choose A manually.' : 'Location unavailable. Check GPS or choose A manually.';
      stopTracking(message); status.textContent = message;
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  };
  $('trackLocation').addEventListener('click', () => startTracking(true));
  $('stopLocation').addEventListener('click', () => stopTracking());
  $('followLocation').addEventListener('change', () => { if ($('followLocation').checked) startTracking(false, true); });
  map?.on('dragstart', () => { viewMode = 'explore'; $('followLocation').checked = false; });
  $('toggleJourney').addEventListener('click', () => setExpanded($('journeyContent').hidden));
  const showView = view => {
    $('journeyView').hidden = view !== 'journey'; $('eventsView').hidden = view !== 'events';
    $('showJourney').setAttribute('aria-pressed', String(view === 'journey')); $('showEvents').setAttribute('aria-pressed', String(view === 'events'));
    setExpanded(true);
  };
  $('showJourney').addEventListener('click', () => showView('journey'));
  $('editRoute').addEventListener('click',()=>{showView('journey');$('journeyContent').scrollTop=0;inputs.destination.focus({preventScroll:true});});
  $('returnToRoute').addEventListener('click',()=>{viewMode='route';setExpanded(false);$('toggleJourney').focus({preventScroll:true});});
  $('showEvents').addEventListener('click', () => showView('events'));
  $('openRoutePlanner').addEventListener('click', () => { showView('journey'); inputs[useCurrentOrigin || endpoints.origin ? 'destination' : 'origin'].focus({preventScroll:true}); });
  $('openRoadEvents').addEventListener('click', () => showView('events'));
  if (window.matchMedia('(max-width: 760px)').matches) setExpanded(false);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && picking) { stopPicking(); setExpanded(true); $('pickOnMap').focus(); } });
  // ResizeObserver catches sheet, device orientation, and desktop panel changes.
  let resizeObserver;
  if (map && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe($('accidentMap'));
    resizeObserver.observe(alert);
    resizeObserver.observe($('mapGuidanceStack'));
  }
  const updateViewport = () => {
    if (window.visualViewport) document.body.style.setProperty('--map-viewport-height', window.visualViewport.height + 'px');
    scheduleFit();
  };
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.addEventListener('resize', updateViewport);
  window.addEventListener('pagehide', () => {
    stopTracking(); cancelSearch(); clearPin(); nameControllers.forEach(controller => controller.abort()); guidance.stop();
    if (busy) invalidateRoute();
    if (fitFrame !== null) cancelAnimationFrame(fitFrame);
  });
  window.addEventListener('pageshow', updateViewport);
  inputs.origin.value = 'My current location';
  updateViewport(); syncButton();
  const recordsChanged = () => {
    recordsKnown=true;
    riskModel = buildRiskModel(getRecords());
    if (routes.length) {
      const old = routes[selected];
      routes = rankRoutes(routes, model());
      selected = Math.max(0, routes.findIndex(route => route.geometry === old.geometry));
      alternativesChecked = false;
      paintRoute();
      if (routes[selected].proneAreas && !busy) findRoute('preview');
    }
    updateProximity();
  };
  window.mapJourney = {
    fitRoute,
    hasRoute: () => routes.length > 0,
    minimize: () => { viewMode = 'explore'; $('toggleJourney').focus({ preventScroll: true }); setExpanded(false); },
    pauseFollowing: () => { $('followLocation').checked = false; }
  };
  return recordsChanged;
};
