'use strict';

window.initializeMapNews = map => {
  const $ = id => document.getElementById(id), escape = window.workspaceEscape;
  const layer = map ? L.layerGroup().addTo(map) : null;
  let articles = [], markers = new Map(), available = false, timer = null, disposed = false, version = 0, observedRunning = false;
  const controllers = new Set();
  let requestMode=false,backendSources=[],autoTimer=null,autoDue=0,scanning=false,deepSupported=false,stopRequested=false;
  const dialog=$('scraperDialog');
  $('openScraper')?.addEventListener('click',()=>{dialog.showModal();updateStatus();});
  $('closeScraper')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  const request = async (url, options = {}) => {
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(),url==='/scraper/run'?260000:15000);
    try {
      const key=String($('scraperAccessKey').value||'').trim();
      const headers={...options.headers};
      if(url.startsWith('/scraper/')&&key)headers.Authorization='Bearer '+key;
      const response = await fetch(url, {...options,headers,cache:'no-store',signal:controller.signal});
      if (!response.ok) {let details;try{details=await response.json();}catch{}throw new Error(details?.error||'Request failed');}
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
      let data;
      try {data=await request('/scraper/data');} catch {}
      if(!Array.isArray(data?.data))data=await request('news-accidents.json');
      if(current!==version||disposed)return;
      if(!Array.isArray(data.data))throw Error();
      articles=data.data.filter(item=>item&&item.id&&typeof item.title==='string'&&safeURL(item.source_url)).map(item=>({...item,source_url:safeURL(item.source_url)}));
      render();
      $('newsSourceSummary').textContent=Array.isArray(data.source_results) ? data.source_results.map(item=>{
        const reasons={outside_isabela:'outside Isabela',no_incident_location_in_isabela:'no confirmed Isabela incident location',not_road_crash:'not a road crash',advisory_or_statistics:'advisory or statistics',invalid_article:'missing article information'};
        const excluded=Object.entries(item.reasons||{}).map(([reason,count])=>count+' '+(reasons[reason]||reason)).join(', ');
        return (item.source==='BomboCauayan'?'Bombo Radyo Cauayan':item.source)+': '+(item.archive_pages?item.archive_pages+' archive pages covered; latest batch: ':item.pages?item.pages+' archive pages, ':'')+item.read+' articles checked, '+item.accepted+' relevant'+(item.rejected?' · '+item.rejected+' excluded'+(excluded?' ('+excluded+')':''):'')+(item.failed?' · '+item.failed+' could not load':'')+(item.deferred?' · '+item.deferred+' queued for next scan':'')+(item.status==='partial'?' · more archive coverage remains':'')+(item.archive_complete&&!item.has_more?' · archive traversal finished':'')+(item.unavailable?' · '+item.unavailable+' unavailable articles':'');
      }).join(' | ') : '';
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
      available=true; requestMode=state.execution==='request';backendSources=state.sources||[];
      deepSupported=state.deep_scan===true;
      if(!deepSupported)$('deepScanProgress').textContent='An older scraper server is running. Restart your local Node server or redeploy Vercel to enable deep archive scanning.';
      $('runNewsScraper').disabled=scanning || state.running || state.can_run===false;
      $('scraperAccess').hidden=state.can_run!==false || state.run_configured===false;
      $('runNewsScraper').textContent=scanning||state.running?'Scanning...':'Scan now';
      $('scraperStatus').textContent=state.can_run===false ? (state.run_configured===false ? (state.storage_configured===false?'Connect a private Vercel Blob store and redeploy to enable fetching.':'Online refresh is not configured. Contact the server administrator.') : 'Live news is available. Enter the scraper access key to start a new run.') : state.error || state.phase+(state.running&&state.total?' · '+state.completed+'/'+state.total+' sources':'')+(state.warnings?.length?' · '+state.warnings.length+' source/location warnings':'');
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
  const scan=async()=>{
    if(!available||$('runNewsScraper').disabled||scanning)return;
    const deep=$('scanDepth').value==='deep';
    if(deep&&!deepSupported){$('deepScanProgress').textContent='Deep scan needs the updated server. Stop the old local server with Ctrl+C and start it again, or redeploy Vercel.';return;}
    scanning=true;
    stopRequested=false;$('stopDeepScan').hidden=!deep;$('scanDepth').disabled=true;$('newsSource').disabled=true;
    $('runNewsScraper').disabled=true;$('scraperStatus').textContent='Starting scraper...';
    let outcome='';
    try {
      if(requestMode||deep) {
        const selected=$('newsSource').value||'BomboCauayan';
        const publishers=selected==='all'?backendSources:[selected];
        let batches=0;
        for(const source of publishers) {
          const checkpoints=new Set();
          let more=true;
          while(more&&!disposed&&!stopRequested){
            batches++;
            const name=source==='BomboCauayan'?'Bombo Radyo Cauayan':source;
            $('scraperStatus').textContent='Fetching '+name+'... Keep this page open.';
            if(deep)$('deepScanProgress').textContent='Deep scan: '+name+' - batch '+batches+'. Reading older news; results save after each batch.';
            const result=await request('/scraper/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,deep})});
            if(disposed)break;
            await load();
            more=deep&&result.has_more===true;
            if(deep){
              const coverage=result.source_results?.find(item=>item.source===source);
              if(!coverage||typeof result.has_more!=='boolean')throw new Error('The server does not support deep-scan progress. Restart it or redeploy Vercel.');
              $('deepScanProgress').textContent=name+': '+(coverage.archive_pages||coverage.pages||0)+' archive pages covered - '+result.count+' saved articles'+(more?' - continuing older news...':' - archive traversal finished.')+(coverage.unavailable?' '+coverage.unavailable+' article(s) unavailable after retries.':'');
              if(more&&(!coverage.checkpoint||checkpoints.has(coverage.checkpoint)))throw new Error('Archive progress is blocked. Saved results are kept; try again later to resume.');
              if(coverage.checkpoint)checkpoints.add(coverage.checkpoint);
            }
          }
          if(disposed||stopRequested)break;
        }
        if(deep&&stopRequested)outcome='Deep scan paused. Saved results are kept. Scan now resumes the remaining older news.';
        observedRunning=false;
      } else {
        observedRunning=true;await request('/scraper/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:$('newsSource').value==='all'?null:($('newsSource').value||'BomboCauayan')})});await updateStatus();
      }
    } catch(error) { observedRunning=false;outcome=error.message+' Saved news is kept. Scan now resumes unfinished work.'; }
    finally { scanning=false;$('stopDeepScan').hidden=true;$('scanDepth').disabled=false;$('newsSource').disabled=false;await updateStatus();if(outcome)$('deepScanProgress').textContent=outcome; }

  };
  $('runNewsScraper').addEventListener('click',scan);
  $('stopDeepScan').addEventListener('click',()=>{stopRequested=true;$('deepScanProgress').textContent='Pausing after the current batch is safely saved...';});
  const scheduleAuto=()=>{
    clearTimeout(autoTimer);
    if(disposed||!$('autoScanNews')?.checked)return;
    autoDue=Date.now()+3600000;
    $('autoScanStatus').textContent='Next scan around '+new Date(autoDue).toLocaleTimeString()+'. Keep this tab open; background tabs may delay scans.';
    autoTimer=setTimeout(async()=>{if(disposed)return;await updateStatus();await scan();scheduleAuto();},3600000);
  };
  $('autoScanNews')?.addEventListener('change',()=>{
    if($('autoScanNews').checked&&(!available||$('runNewsScraper').disabled)){
      $('autoScanNews').checked=false;$('autoScanStatus').textContent='Connect the scraper with your access key before enabling auto scan.';return;
    }
    scheduleAuto();
    if(!$('autoScanNews').checked)$('autoScanStatus').textContent='Auto scan is off.';
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
  window.addEventListener('pagehide',()=>{disposed=true;version++;clearTimeout(timer);clearTimeout(autoTimer);controllers.forEach(controller=>controller.abort());});
  window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;load();updateStatus();scheduleAuto();}});
  load();updateStatus();
};
