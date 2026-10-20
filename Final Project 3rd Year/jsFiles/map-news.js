'use strict';

window.initializeMapNews = map => {
  const $ = id => document.getElementById(id), escape = window.workspaceEscape;
  const layer = map ? L.layerGroup().addTo(map) : null;
  let articles = [], markers = new Map(), available = false, timer = null, disposed = false, version = 0, observedRunning = false;
  const controllers = new Set();
  const request = async (url, options = {}) => {
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const key=String($('scraperAccessKey').value||'').trim();
      const headers={...options.headers};
      if(url.startsWith('/scraper/')&&key)headers.Authorization='Bearer '+key;
      const response = await fetch(url, {...options,headers,cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('Request failed');
      return await response.json();
    } finally {clearTimeout(timeout);controllers.delete(controller);}
  };
  const safeURL = value => {
    try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
  };
  const point = item => {
    const result = window.MapSafety.coordinates(item);
    return result && result[0]>=16.39 && result[0]<=17.56 && result[1]>=121.39 && result[1]<=122.54 ? result : null;
  };
  const articleContent = item => '<span class="news-badge">News · unverified</span><h3>' + escape(item.title) + '</h3><p>' + escape(item.location_label || 'Location not identified — no map pin') + '</p><small>' + escape(item.source_site) + (item.incident_date ? ' · Reported incident date: ' + escape(item.incident_date) : ' · Incident date not reported') + '</small><a class="button news-source-link" href="' + escape(item.source_url) + '" target="_blank" rel="noopener noreferrer">Read full article<span class="sr-only">: ' + escape(item.title) + '</span></a>';
  const render = () => {
    layer?.clearLayers(); markers.clear();
    const groups = new Map();
    articles.forEach(item => {const location=point(item);if(location){const key=location.join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}});
    if (map && $('showNewsPins').checked) groups.forEach(items => {
      const marker = L.marker(point(items[0]), {
        icon:L.divIcon({className:'record-marker-icon',html:'<span class="record-marker-dot record-marker-unknown" aria-hidden="true"></span>',iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-10]}),
        keyboard:true,title:items.length+' accident news article'+(items.length===1?'':'s')+' · approximate location',alt:'Accident news at '+items[0].municipality,zIndexOffset:700
      }).addTo(layer).bindPopup('<section class="news-popup"><p>Approximate town/city location. Not a confirmed crash site.</p>'+items.map(item=>'<article>'+articleContent(item)+'</article>').join('')+'</section>',{maxWidth:310,minWidth:220,autoPanPaddingTopLeft:[12,12],autoPanPaddingBottomRight:[72,90]});
      items.forEach(item=>markers.set(item.id,marker));
    });
    $('newsResults').innerHTML = articles.length ? articles.map((item,index)=>'<article class="news-card">'+articleContent(item)+(map&&point(item)?'<button class="button subtle-button" type="button" data-news-index="'+index+'">Locate news pin</button>':'')+'</article>').join('') : '<p class="field-help">No accident news has been imported yet. Run the scraper to check the configured sources.</p>';
  };
  const load = async () => {
    const current=++version;
    $('refreshNews').disabled=true;
    $('newsResults').setAttribute('aria-busy','true');
    try {
      const data = await request('news-accidents.json');
      if(current!==version||disposed)return;
      if(!Array.isArray(data.data))throw Error();
      articles=data.data.filter(item=>item&&item.id&&typeof item.title==='string'&&safeURL(item.source_url)).map(item=>({...item,source_url:safeURL(item.source_url)}));
      render();
      const located=articles.filter(item=>point(item)).length;
      const date=Date.parse(data.fetched_at);
      $('newsStatus').textContent=articles.length+' news articles · '+located+' approximate locations'+(articles.length>located?' · '+(articles.length-located)+' without a location':'')+(Number.isFinite(date)?' · Last scraped '+new Date(date).toLocaleString():'');
    } catch {
      if(current===version&&!disposed)$('newsStatus').textContent=articles.length?'News could not be refreshed. Previous news pins are still shown.':'Accident news is unavailable. Start the local scraper or import the cache.';
    } finally {if(current===version){$('refreshNews').disabled=false;$('newsResults').setAttribute('aria-busy','false');}}
  };
  const updateStatus = async () => {
    clearTimeout(timer);
    try {
      const state=await request('/scraper/status');
      if(disposed)return;
      if(state.available!==true)throw Error();
      available=true;
      $('runNewsScraper').disabled=state.running || state.can_run===false;
      $('scraperAccess').hidden=state.can_run!==false || state.run_configured===false;
      $('runNewsScraper').textContent=state.running?'Scraper running...':'Run scraper';
      $('scraperStatus').textContent=state.can_run===false ? (state.run_configured===false ? 'Online refresh is not configured. Contact the server administrator.' : 'Live news is available. Enter the scraper access key to start a new run.') : state.error || state.phase+(state.running&&state.total?' · '+state.completed+'/'+state.total+' sources':'')+(state.warnings?.length?' · '+state.warnings.length+' source/location warnings':'');
      if(state.running) { observedRunning=true; timer=setTimeout(updateStatus,2000); }
      else if(observedRunning) { observedRunning=false; await load(); }
    } catch {
      if(disposed)return;
      available=false;$('runNewsScraper').disabled=true;
      $('scraperStatus').textContent='The scraper service is unavailable. Use the hosted ROADGUARD server, or start it locally with the command below.';
    }
  };
  $('unlockScraper').addEventListener('click',updateStatus);
  $('scraperAccessKey').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();updateStatus();}});
  $('runNewsScraper').addEventListener('click',async()=>{
    if(!available||$('runNewsScraper').disabled)return;
    $('runNewsScraper').disabled=true;$('scraperStatus').textContent='Starting scraper...';
    try {observedRunning=true; await request('/scraper/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});await updateStatus();}
    catch { $('runNewsScraper').disabled=false; $('scraperStatus').textContent='Could not start the scraper. Check that the local server is running, then refresh news.'; }
  });
  $('refreshNews').addEventListener('click',()=>{load();updateStatus();});
  $('showNewsPins').addEventListener('change',render);
  $('newsResults').addEventListener('click',event=>{
    const button=event.target.closest('[data-news-index]');if(!button||!map)return;
    const item=articles[Number(button.dataset.newsIndex)];if(!item||!point(item))return;
    if(!$('showNewsPins').checked){$('showNewsPins').checked=true;render();}
    window.mapJourney?.pauseFollowing();window.mapJourney?.minimize();
    requestAnimationFrame(()=>{map.invalidateSize({pan:false});map.setView(point(item),12,{animate:false});markers.get(item.id)?.openPopup();});
  });
  window.addEventListener('pagehide',()=>{disposed=true;version++;clearTimeout(timer);controllers.forEach(controller=>controller.abort());});
  window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;load();updateStatus();}});
  load();updateStatus();
};
