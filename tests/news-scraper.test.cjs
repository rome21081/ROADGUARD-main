const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {normalizeNews,attachLocation,feed,classifyNews}=require('../testscraper/news-pipeline');
const {createApp,parseArticle,extractLinks,nextArchivePage,scrapeData,sources}=require('../testscraper/scraper');
const cheerio=require('../testscraper/node_modules/cheerio');
const root=path.resolve(__dirname,'../Final Project 3rd Year');

(async()=>{
  const raw={chief_complaint:'Van crashes into truck in Isabela',notes:'Four injured in Barangay Antonino, Alicia, Isabela.',source_url:'https://news.bomboradyo.com/test-accident/?utm_source=test#top'};
  const normalized=normalizeNews([raw,{...raw,source_url:'https://news.bomboradyo.com/test-accident/#other'},
    {...raw,chief_complaint:'Robbery in Isabela',notes:'Riding in tandem thieves robbed a bus.'},
    {...raw,chief_complaint:'Car accident in Isabela City, Basilan'},
    {...raw,source_url:'javascript:alert(1)'},
    {...raw,chief_complaint:'News homepage',notes:'The latest local updates.'}]);
  assert.equal(normalized.length,1,'Reject non-crashes, wrong Isabela, unsafe URLs, and duplicate articles');
  assert.equal(normalizeNews([null,42,{},raw]).length,1,'Malformed records do not abort an otherwise valid batch');
  assert.equal(normalized[0].municipality,'Alicia');
  assert.equal(normalized[0].incident_date,'','Never substitute scrape/publication date for incident date');
  assert.equal(normalized[0].latitude,null);
  const located=attachLocation(normalized[0],{lat:16.78,lon:121.70,display_name:'Alicia, Isabela, Philippines'});
  assert.equal(located.location_accuracy,'municipality');assert.equal(located.verified,false);
  assert.equal(attachLocation(normalized[0],{lat:6.7,lon:122,display_name:'Isabela, Basilan'}).latitude,null);
  assert.equal(attachLocation(normalized[0],{lat:'invalid',lon:121.7,display_name:'Isabela'}).latitude,null);
  const imported=JSON.parse(fs.readFileSync(path.join(root,'htmlFiles/news-accidents.json'),'utf8'));
  assert(imported.count>=3,'Import the relevant cached accident articles');
  assert(imported.located>=3,'Existing news has resolved approximate map locations');
  assert(imported.data.every(item=>item.verified===false&&['municipality','unlocated'].includes(item.location_accuracy)));
  const window={};vm.runInNewContext(fs.readFileSync(path.join(root,'jsFiles/map-safety.js'),'utf8'),{window});
  assert.equal(window.MapSafety.buildRiskModel(imported.data.map(item=>({...item,recordType:'Accident',accident_id:item.id,accident_date:'2026-10-01',severity:'Critical'}))).crashes.length,0,'Unverified news must not create accident-prone tags');

  const article=parseArticle('<title>Car crash in Isabela</title><meta property="article:published_time" content="2026-01-01"><article><p>Truck collision in Alicia, Isabela.</p></article><footer><p>Unrelated crash in another province.</p></footer>',raw.source_url);
  assert.equal(article.notes,'Truck collision in Alicia, Isabela.');assert.equal(article.published_at,'2026-01-01');
  assert.deepEqual(extractLinks('<a href="/real-story/">Read</a><a href="https://evil.example/story">Other</a><a href="/category/news/">Category</a><a href="/?s=test">Search</a><a href="/real-story/#top">Duplicate</a>','https://news.bomboradyo.com/?s=isabela'),['https://news.bomboradyo.com/real-story/']);

  assert.equal(sources.BomboCauayan,'https://cauayan.bomboradyo.com/cauayan/aksidente-2/');
  const cauayanHTML='<article><h1>Aksidente sa Naguilian Isabela</h1><div class="td-post-content"><p>Nabangga ang motorsiklong minamaneho sa Minanga, Naguilian, Isabela.</p><p>Residente ng Cauayan City, Isabela ang rider.</p></div><div class="related"><p>Unrelated robbery in another town.</p></div></article>';
  const localArticle=parseArticle(cauayanHTML,'https://cauayan.bomboradyo.com/example-accident/');
  assert.equal(normalizeNews([localArticle])[0].municipality,'Naguilian','Incident location wins over a later home address');
  assert.doesNotMatch(localArticle.notes,/Unrelated/);
  assert.deepEqual(extractLinks('<a href="/about/">About</a><h3 class="td-module-title"><a href="/actual-article/">Story</a></h3><h3 class="td-module-title"><a href="/cauayan/road-crash/">Tag</a></h3>',sources.BomboCauayan),['https://cauayan.bomboradyo.com/actual-article/']);

  const report=(title,body)=>({title,article_text:body,source_url:'https://cauayan.bomboradyo.com/test/'});
  for(const title of ['Bata masagasaan ng SUV sa Alicia, Isabela','Bangaan ng tricycle at motorsiklo sa San Mateo, Isabela','Motorcycle rider na-aksidente sa Echague, Isabela'])assert.equal(classifyNews(report(title,'Sugatan ang mga biktima.')).accepted,true,title);
  assert.equal(classifyNews(report('Paalaala sa road safety upang maiwasan ang aksidente sa Isabela','Motorcycle crash prevention seminar sa Alicia, Isabela.')).accepted,false);
  assert.equal(classifyNews(report('Airvan nag-crash sa Reina Mercedes, Isabela','Bumagsak ang eroplano.')).accepted,false);
  assert.equal(classifyNews(report('Motorcycle crash sa Baguio','Nasawi ang rider na residente ng Alicia, Isabela.')).accepted,false,'Victim address cannot relocate a crash');
  assert.equal(classifyNews(report('Truck crash in Manila','A resident of Isabela was injured.')).accepted,false);
  assert.equal(classifyNews(report('Driver patay matapos mahulog ang sasakyan sa bangin sa Mountain Province','Naganap sa Bauko, Mountain Province ang aksidente. May mga biyaherong mula Isabela.')).accepted,false,'Another incident or traveler origin must not relocate the main crash');
  assert.equal(classifyNews(report('IPPO paiigtingin ang Motorcycle Helmet Act para mapababa ang aksidente sa motorsiklo','Isabela road accident statistics: 44 aksidente ngayong buwan.')).accepted,false,'Policy stories are not individual crash reports');
  assert.equal(classifyNews(report('3 magkakahiwalay na aksidente, naitala sa Cauayan sa loob ng isang araw','Mga motorcycle crash sa Cauayan City, Isabela ang naitala.')).accepted,false,'Aggregate totals are not individual incidents');
  assert.equal(classifyNews(report('Truck nahulog sa gilid ng daan sa Benito Soliven','Nahulog ang truck sa Barangay Punit, Benito Soliven. Residente ng San Mariano, Isabela ang driver. Patungong San Mariano, Isabela ang truck.')).municipality,'Benito Soliven','Headline crash town beats a destination or residence later in the article');
  const late=parseArticle('<h1>Rider sugatan</h1><div class="entry-content">'+Array.from({length:5},()=>'<p>'+('Detalye mula sa pulisya. '.repeat(15))+'</p>').join('')+'<p>Sumalpok ang motorsiklo sa truck sa Alicia, Isabela.</p><aside>Car crash in Basilan.</aside></div>','https://cauayan.bomboradyo.com/late/');
  assert.equal(normalizeNews([late])[0].municipality,'Alicia','Read incident evidence beyond the old three-paragraph cutoff');
  assert.doesNotMatch(late.article_text,/Basilan/);
  const structured=parseArticle('<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'NewsArticle',headline:'Bangaan ng motorsiklo sa Alicia, Isabela',articleBody:'Nabangga ng truck ang motorsiklo sa Alicia, Isabela.',datePublished:'2026-10-20T10:00:00+08:00'}]})+'</script>','https://cauayan.bomboradyo.com/structured/');
  assert.equal(normalizeNews([structured]).length,1);assert.equal(structured.published_at,'2026-10-20T10:00:00+08:00');
  const archive=sources.BomboCauayan,page2=archive+'page/2/',page3=archive+'page/3/';
  const listing=(story,next)=>'<main><h2 class="entry-title"><a href="/'+story+'/">Article</a></h2>'+(next?'<a rel="next" href="'+next+'">Next</a>':'')+'</main>';
  assert.equal(nextArchivePage(listing('first',page2),archive,archive),page2);
  assert.equal(nextArchivePage(listing('first','https://evil.example/page/2/'),archive,archive),null);
  assert.equal(nextArchivePage(listing('first',archive),page2,archive),null,'No pagination loops');
  let rawState={data:[]},savedFeed,visits=[],failThird=true;
  const storage={readRaw:async()=>rawState,readGeo:async()=>({}),writeRaw:async value=>rawState=value,writeGeo:async()=>{},writeFeed:async value=>savedFeed=value};
  const mockPages=async url=>{visits.push(url);if(url===archive)return listing('first',page2);if(url===page2)return listing('second',page3);if(url===page3)return listing('third');if(url.endsWith('/third/')&&failThird)throw Error('Temporary publisher failure');return '<h1>Bangaan ng motorsiklo sa Alicia, Isabela '+url.split('/').filter(Boolean).pop()+'</h1><article><p>Sumalpok ang motorsiklo sa truck sa Alicia, Isabela.</p></article>';};
  const progress=()=>({running:true,warnings:[],source_results:[]});
  await scrapeData({force:true,source:'BomboCauayan',limit:1,geocode:false,storage,fetchPage:mockPages,wait:async()=>{},progress:progress()});
  assert.equal(savedFeed.count,1);assert.equal(rawState.scan_state.BomboCauayan.pending.length,2,'Unprocessed articles persist for the next scan');
  assert.equal(savedFeed.data[0].article_text,undefined,'Public feed contains excerpts, not full article bodies');
  visits=[];const secondProgress=progress();
  await scrapeData({force:true,source:'BomboCauayan',limit:3,geocode:false,storage,fetchPage:mockPages,wait:async()=>{},progress:secondProgress});
  assert.equal(savedFeed.count,2);assert.equal(secondProgress.source_results[0].failed,1);assert(!visits.includes('https://cauayan.bomboradyo.com/first/'),'Successful articles are not refetched on every scan');
  failThird=false;await scrapeData({force:true,source:'BomboCauayan',geocode:false,storage,fetchPage:mockPages,wait:async()=>{},progress:progress()});
  assert.equal(savedFeed.count,3,'A failed article is retried on the next scan without losing prior news');
  const page4=archive+'page/4/',page5=archive+'page/5/';
  const olderPages=async url=>{
    if(url===page3)return listing('third',page4);
    if(url===page4)return listing('old-fourth',page5);
    if(url===page5)return listing('old-fifth');
    if(url.includes('/old-'))return '<h1>Motorcycle crash in Alicia, Isabela '+url.split('/').filter(Boolean).pop()+'</h1><meta property="article:published_time" content="2018-01-01"><article><p>Truck collision in Alicia, Isabela.</p></article>';
    return mockPages(url);
  };
  let historicalMore=true,historicalBatches=0;
  while(historicalMore&&historicalBatches<12){
    const batch=await scrapeData({force:true,deep:true,source:'BomboCauayan',limit:1,geocode:false,storage,fetchPage:olderPages,wait:async()=>{},progress:progress()});
    historicalMore=batch.source_results[0].has_more;historicalBatches++;
  }
  assert(historicalBatches>1&&historicalBatches<12,'Deep scan finishes in consecutive resumable batches');
  assert.equal(savedFeed.count,5);assert.equal(rawState.scan_state.BomboCauayan.archive_complete,true);
  assert.equal(rawState.scan_state.BomboCauayan.archive_pages.length,5);
  assert(savedFeed.data.some(item=>item.published_at==='2018-01-01'),'Old articles are not removed by an accidental recency cutoff');
  visits=[];
  await scrapeData({force:true,deep:true,source:'BomboCauayan',geocode:false,storage,fetchPage:olderPages,wait:async()=>{},progress:progress()});
  assert.deepEqual(visits,[archive],'Completed archive does not loop back to page two forever');
  rawState={data:[]};failThird=true;
  for(let attempt=0;attempt<3;attempt++)await scrapeData({force:true,deep:true,source:'BomboCauayan',geocode:false,storage,fetchPage:mockPages,wait:async()=>{},progress:progress()});
  assert.equal(savedFeed.source_results[0].has_more,false);assert.equal(savedFeed.source_results[0].unavailable,1,'Permanently unavailable articles are reported instead of blocking the archive forever');

  let runs=0,lastSource,lastDeep;
  const app=createApp({startRun:async options=>{runs++;lastSource=options.source;lastDeep=options.deep;return {count:5,located:4,source_results:[{source:options.source,has_more:true,checkpoint:'next-batch'}]};}}),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    let response=await fetch(base+'/scraper/status');assert.equal((await response.json()).available,true);
    response=await fetch(base+'/scraper/data');assert.equal((await response.json()).located,imported.located);assert.equal(runs,0,'Reading news does not launch a scrape');
    response=await fetch(base+'/scraper/run',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://external.example'},body:'{}'});assert.equal(response.status,403);
    response=await fetch(base+'/scraper/run',{method:'POST',body:'start'});assert.equal(response.status,415);
    response=await fetch(base+'/scraper/run',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'});assert.equal(response.status,202);assert.equal(runs,1);
    response=await fetch(base+'/scraper/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'BomboCauayan'})});assert.equal(response.status,202);assert.equal(lastSource,'BomboCauayan');
    response=await fetch(base+'/scraper/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'Unconfigured'})});assert.equal(response.status,400);
    response=await fetch(base+'/scraper/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'BomboCauayan',deep:true})});
    assert.equal(response.status,200);const deepResponse=await response.json();assert.equal(deepResponse.has_more,true);assert.equal(deepResponse.count,5);assert.equal(lastDeep,true,'Local server awaits a deep batch before responding');
    response=await fetch(base+'/htmlFiles/map.html');assert.equal(response.status,200);assert.match(await response.text(),/runNewsScraper/);
  } finally {await new Promise(resolve=>server.close(resolve));}

  // Hosted mode supports public reads while requiring an access key to scrape.
  const hosted=createApp({startRun:async()=>{runs++;},publicOrigin:'https://roadguard.example',runToken:'test-private-key'}).listen(0,'127.0.0.1');
  await new Promise(resolve=>hosted.once('listening',resolve));
  const hostedBase='http://127.0.0.1:'+hosted.address().port;
  const publicHeaders={Host:'roadguard.example',Origin:'https://roadguard.example'};
  // Send a real Host header through node:http; fetch normalizes it to the URL host.
  const hostedFetch=(url,options={})=>new Promise((resolve,reject)=>{
    const request=require('node:http').request(url,{method:options.method||'GET',headers:options.headers},response=>{
      let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,json:async()=>JSON.parse(body)}));
    });request.on('error',reject);request.end(options.body);
  });
  try {
    let response=await hostedFetch(hostedBase+'/scraper/status',{headers:publicHeaders});let status=await response.json();
    assert.equal(status.available,true);assert.equal(status.can_run,false);assert(status.sources.includes('BomboCauayan'));
    assert(!JSON.stringify(status).includes('test-private-key'));
    response=await hostedFetch(hostedBase+'/scraper/data',{headers:publicHeaders});assert.equal(response.status,200);
    response=await hostedFetch(hostedBase+'/scraper/run',{method:'POST',headers:{...publicHeaders,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);
    const authenticated={...publicHeaders,Authorization:'Bearer test-private-key'};
    response=await hostedFetch(hostedBase+'/scraper/status',{headers:authenticated});assert.equal((await response.json()).can_run,true);
    response=await hostedFetch(hostedBase+'/scraper/run',{method:'POST',headers:{...authenticated,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,202);
    response=await hostedFetch(hostedBase+'/scraper/run',{method:'POST',headers:{...authenticated,Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
    response=await hostedFetch(hostedBase+'/scraper/status',{headers:{Host:'unconfigured.example'}});assert.equal(response.status,403);
    response=await hostedFetch(hostedBase+'/health');assert.equal(response.status,200);
    response=await hostedFetch(hostedBase+'/htmlFiles/news-accidents.json');assert.equal((await response.json()).count,imported.count);
  } finally {await new Promise(resolve=>hosted.close(resolve));}

  // Exercise news pins and source links with a mocked map and DOM, independent of live publishers.
  const html=cheerio.load(fs.readFileSync(path.join(root,'htmlFiles/map.html'),'utf8')),elements=new Map(),events={},layers=[];
  class Element {
    constructor(id){this.id=id;this.handlers={};this.hidden=false;this.checked=id==='showNewsPins';this.innerHTML='';this.textContent='';this.disabled=false;}
    addEventListener(type,callback){this.handlers[type]=callback;}
    setAttribute(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
    async emit(type,event={}){await this.handlers[type]?.(event);}
  }
  const $=id=>{assert.equal(html('#'+id).length,1,'Missing news control '+id);if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  let online=true,jobRunning=false,activeMarkers=[],views=[],submittedSource=null,accessRequired=false,serverless=false,submittedSources=[],deepSupported=true,deepRemaining=0,deepRequests=0,pauseDeep=false;
  const leaflet={layerGroup:()=>({addTo(){return this;},clearLayers(){activeMarkers=[];}}),divIcon:value=>value,
    marker:(point,options)=>({point,options,addTo(){activeMarkers.push(this);return this;},bindPopup(content){this.content=content;return this;},openPopup(){this.opened=true;}})};
  const escaped=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const newsWindow={workspaceEscape:escaped,MapSafety:window.MapSafety,addEventListener:(type,callback)=>events[type]=callback,mapJourney:{pauseFollowing(){},minimize(){}}};
  const scheduled=new Map();let timerID=0;
  const context={window:newsWindow,document:{getElementById:$},L:leaflet,URL,Date,AbortController,setTimeout:(callback,delay)=>{const id=++timerID;scheduled.set(id,{callback,delay});return id;},clearTimeout:id=>scheduled.delete(id),requestAnimationFrame:fn=>fn(),
    fetch:async (url,options={})=>{if(options.method==='POST'){const body=JSON.parse(options.body);jobRunning=!serverless&&!body.deep;submittedSource=body.source;submittedSources.push(submittedSource);
      if(body.deep){deepRequests++;if(pauseDeep)await $('stopDeepScan').emit('click');return {ok:true,json:async()=>({completed:true,count:5,has_more:deepRemaining-->0,source_results:[{source:body.source,archive_pages:deepRequests*3,checkpoint:'batch-'+deepRequests}]})};}}
      return {ok:url==='news-accidents.json'||online,json:async()=>url==='news-accidents.json'?feed([located,{...located,id:'second',title:'<script>unsafe</script>'},{...located,id:'unlocated',latitude:null,longitude:null},{...located,id:'bad',source_url:'javascript:alert(1)'}],'2026-01-01'):{available:true,deep_scan:deepSupported,execution:serverless?'request':'background',sources:['BomboCauayan','Bombo'],can_run:!accessRequired||options.headers?.Authorization==='Bearer test-ui-key',run_configured:true,running:jobRunning,phase:jobRunning?'Reading Bombo':'Finished',warnings:[]}};}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'jsFiles/map-news.js'),'utf8'),context);
  newsWindow.initializeMapNews({invalidateSize(){},setView:point=>views.push(point)});
  assert.equal(html('#scanDepth option[selected]').attr('value'),'deep','Old news is included by default');
  $('scanDepth').value='recent';
  const settle=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};await settle();
  assert.equal(activeMarkers.length,1,'Co-located news shares a pin');assert.match(activeMarkers[0].content,/&lt;script>/);assert.doesNotMatch($('newsResults').innerHTML,/javascript:/);
  assert.match($('newsStatus').textContent,/3 news articles · 2 approximate locations · 1 without a location/);
  assert.match($('newsResults').innerHTML,/Read full article/);assert.equal($('runNewsScraper').disabled,false);
  await $('runNewsScraper').emit('click'); await settle();
  assert.equal($('runNewsScraper').disabled,true);assert.equal(submittedSource,'BomboCauayan');assert.match($('scraperStatus').textContent,/Reading Bombo/);
  jobRunning=false;await $('refreshNews').emit('click');await settle();
  assert.equal($('runNewsScraper').disabled,false);assert.match($('scraperStatus').textContent,/Finished/);
  $('showNewsPins').checked=false;await $('showNewsPins').emit('change');assert.equal(activeMarkers.length,0);
  await $('newsResults').emit('click',{target:{closest:()=>({dataset:{newsIndex:'0'}})}});assert.equal(activeMarkers.length,1);assert.equal(activeMarkers[0].opened,true);assert.equal(views.length,1);
  accessRequired=true;await $('refreshNews').emit('click');await settle();
  assert.equal($('runNewsScraper').disabled,true);assert.equal($('scraperAccess').hidden,false);
  $('scraperAccessKey').value='test-ui-key';await $('unlockScraper').emit('click');
  assert.equal($('runNewsScraper').disabled,false);assert.equal($('scraperAccess').hidden,true);
  serverless=true;await $('refreshNews').emit('click');await settle();
  $('newsSource').value='all';await $('runNewsScraper').emit('click');
  assert.deepEqual(submittedSources.slice(-2),['BomboCauayan','Bombo'],'Vercel completes one publisher per request, including All sources');
  assert.equal($('runNewsScraper').disabled,false);
  assert.equal(html('#eventsView #runNewsScraper').length,0,'Scraper is outside Road events');
  assert.equal(html('#pinDestination').next().attr('id'),'openScraper','Scraper sits directly below Pin location');
  await $('openScraper').emit('click');await settle();assert.equal($('scraperDialog').open,true);
  await $('closeScraper').emit('click');assert.equal($('scraperDialog').open,false);
  $('autoScanNews').checked=true;await $('autoScanNews').emit('change');
  const hourly=[...scheduled.values()].find(item=>item.delay===3600000);assert(hourly,'Hourly scan scheduled');
  const beforeAuto=submittedSources.length;await hourly.callback();
  assert.equal(submittedSources.length,beforeAuto+2,'Hourly scan uses selected publishers');
  $('autoScanNews').checked=false;await $('autoScanNews').emit('change');
  assert.equal([...scheduled.values()].filter(item=>item.delay===3600000).length,0,'Turning off auto scan cancels its timer');
  $('scanDepth').value='deep';$('newsSource').value='BomboCauayan';deepRemaining=2;
  await $('runNewsScraper').emit('click');assert.equal(deepRequests,3,'One click follows all older archive batches automatically');
  assert.match($('deepScanProgress').textContent,/archive traversal finished/);
  pauseDeep=true;deepRemaining=3;const beforePause=deepRequests;
  await $('runNewsScraper').emit('click');assert.equal(deepRequests,beforePause+1);assert.match($('deepScanProgress').textContent,/paused/);
  pauseDeep=false;deepSupported=false;await $('refreshNews').emit('click');await settle();const beforeLegacy=submittedSources.length;
  await $('runNewsScraper').emit('click');assert.equal(submittedSources.length,beforeLegacy,'Old backends cannot silently run a shallow scan as a deep scan');
  assert.match($('deepScanProgress').textContent,/updated server/);
  online=false;await $('refreshNews').emit('click');await settle();assert.equal($('runNewsScraper').disabled,true);assert.equal(activeMarkers.length,1,'Static news pins work without the Node controller');
  $('autoScanNews').checked=true;await $('autoScanNews').emit('change');assert.equal($('autoScanNews').checked,false,'Auto scan requires an available authenticated service');
  events.pagehide();
  const directory=cheerio.load(fs.readFileSync(path.join(root,'htmlFiles/accidentlist.html'),'utf8'));
  assert.equal(directory('#scraped-news').length,1,'Saved news has its own directory section');
  assert.equal(html('a[href="accidentlist.html#scraped-news"]').length,1,'Scraper links directly to its saved news section');
  const directoryElements=new Map();
  const getDirectory=id=>{assert.equal(directory('#'+id).length,1);if(!directoryElements.has(id))directoryElements.set(id,new Element(id));return directoryElements.get(id);};
  getDirectory('scrapedNewsSearch').value='';
  let startDirectory;
  vm.runInNewContext(fs.readFileSync(path.join(root,'jsFiles/scraped-news.js'),'utf8'),{
    window:{workspaceUser:{user_id:1},workspaceEscape:escaped,location:{hash:''}},document:{getElementById:getDirectory,addEventListener:(_event,callback)=>startDirectory=callback},URL,Date,AbortController,setTimeout,clearTimeout,
    fetch:async url=>({ok:url==='news-accidents.json',json:async()=>feed([located,{...located,id:'unsafe',source_url:'javascript:alert(1)'}],'2026-01-01')})
  });
  startDirectory();await settle();assert.match(getDirectory('scrapedNewsResults').innerHTML,/Read full article/);assert.doesNotMatch(getDirectory('scrapedNewsResults').innerHTML,/javascript:/);
  getDirectory('scrapedNewsSearch').value='no matching news here';await getDirectory('scrapedNewsSearch').emit('input');assert.match(getDirectory('scrapedNewsStatus').textContent,/0 of 1/);
  console.log('Passed: news filtering, deduplication, source links, approximate geocoding, imported news pins, risk exclusion, hosted/local scraper controls and source selection, static hosting fallback, grouped pins, and map location actions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
