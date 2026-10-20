const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {normalizeNews,attachLocation,feed}=require('../testscraper/news-pipeline');
const {createApp,parseArticle,extractLinks,sources}=require('../testscraper/scraper');
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

  let runs=0;
  const app=createApp({startRun:async()=>{runs++;}}),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    let response=await fetch(base+'/scraper/status');assert.equal((await response.json()).available,true);
    response=await fetch(base+'/scraper/data');assert.equal((await response.json()).located,imported.located);assert.equal(runs,0,'Reading news does not launch a scrape');
    response=await fetch(base+'/scraper/run',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://external.example'},body:'{}'});assert.equal(response.status,403);
    response=await fetch(base+'/scraper/run',{method:'POST',body:'start'});assert.equal(response.status,415);
    response=await fetch(base+'/scraper/run',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'});assert.equal(response.status,202);assert.equal(runs,1);
    response=await fetch(base+'/htmlFiles/map.html');assert.equal(response.status,200);assert.match(await response.text(),/runNewsScraper/);
  } finally {await new Promise(resolve=>server.close(resolve));}

  // Hosted mode supports public reads while requiring an access key to scrape.
  const hosted=createApp({startRun:async()=>{runs++;},publicOrigin:'https://roadguard.example',runToken:'test-private-key'}).listen(0,'127.0.0.1');
  await new Promise(resolve=>hosted.once('listening',resolve));
  const hostedBase='http://127.0.0.1:'+hosted.address().port;
  const publicHeaders={Host:'roadguard.example',Origin:'https://roadguard.example'};
  try {
    let response=await fetch(hostedBase+'/scraper/status',{headers:publicHeaders});let status=await response.json();
    assert.equal(status.available,true);assert.equal(status.can_run,false);assert(status.sources.includes('BomboCauayan'));
    assert(!JSON.stringify(status).includes('test-private-key'));
    response=await fetch(hostedBase+'/scraper/data',{headers:publicHeaders});assert.equal(response.status,200);
    response=await fetch(hostedBase+'/scraper/run',{method:'POST',headers:{...publicHeaders,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);
    const authenticated={...publicHeaders,Authorization:'Bearer test-private-key'};
    response=await fetch(hostedBase+'/scraper/status',{headers:authenticated});assert.equal((await response.json()).can_run,true);
    response=await fetch(hostedBase+'/scraper/run',{method:'POST',headers:{...authenticated,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,202);
    response=await fetch(hostedBase+'/scraper/run',{method:'POST',headers:{...authenticated,Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
    response=await fetch(hostedBase+'/scraper/status',{headers:{Host:'unconfigured.example'}});assert.equal(response.status,403);
    response=await fetch(hostedBase+'/health');assert.equal(response.status,200);
    response=await fetch(hostedBase+'/htmlFiles/news-accidents.json');assert.equal((await response.json()).count,imported.count);
  } finally {await new Promise(resolve=>hosted.close(resolve));}

  // Exercise news pins and source links with a mocked map and DOM, independent of live publishers.
  const html=cheerio.load(fs.readFileSync(path.join(root,'htmlFiles/map.html'),'utf8')),elements=new Map(),events={},layers=[];
  class Element {
    constructor(id){this.id=id;this.handlers={};this.hidden=false;this.checked=id==='showNewsPins';this.innerHTML='';this.textContent='';this.disabled=false;}
    addEventListener(type,callback){this.handlers[type]=callback;}
    setAttribute(){}
    async emit(type,event={}){await this.handlers[type]?.(event);}
  }
  const $=id=>{assert.equal(html('#'+id).length,1,'Missing news control '+id);if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  let online=true,jobRunning=false,activeMarkers=[],views=[];
  const leaflet={layerGroup:()=>({addTo(){return this;},clearLayers(){activeMarkers=[];}}),divIcon:value=>value,
    marker:(point,options)=>({point,options,addTo(){activeMarkers.push(this);return this;},bindPopup(content){this.content=content;return this;},openPopup(){this.opened=true;}})};
  const escaped=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const newsWindow={workspaceEscape:escaped,MapSafety:window.MapSafety,addEventListener:(type,callback)=>events[type]=callback,mapJourney:{pauseFollowing(){},minimize(){}}};
  const context={window:newsWindow,document:{getElementById:$},L:leaflet,URL,Date,AbortController,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),
    fetch:async (url,options={})=>{if(options.method==='POST')jobRunning=true;return {ok:url==='news-accidents.json'||online,json:async()=>url==='news-accidents.json'?feed([located,{...located,id:'second',title:'<script>unsafe</script>'},{...located,id:'unlocated',latitude:null,longitude:null},{...located,id:'bad',source_url:'javascript:alert(1)'}],'2026-01-01'):{available:true,running:jobRunning,phase:jobRunning?'Reading Bombo':'Finished',warnings:[]}};}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'jsFiles/map-news.js'),'utf8'),context);
  newsWindow.initializeMapNews({invalidateSize(){},setView:point=>views.push(point)});
  const settle=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};await settle();
  assert.equal(activeMarkers.length,1,'Co-located news shares a pin');assert.match(activeMarkers[0].content,/&lt;script>/);assert.doesNotMatch($('newsResults').innerHTML,/javascript:/);
  assert.match($('newsStatus').textContent,/3 news articles · 2 approximate locations · 1 without a location/);
  assert.match($('newsResults').innerHTML,/Read full article/);assert.equal($('runNewsScraper').disabled,false);
  await $('runNewsScraper').emit('click'); await settle();
  assert.equal($('runNewsScraper').disabled,true);assert.match($('scraperStatus').textContent,/Reading Bombo/);
  jobRunning=false;await $('refreshNews').emit('click');await settle();
  assert.equal($('runNewsScraper').disabled,false);assert.match($('scraperStatus').textContent,/Finished/);
  $('showNewsPins').checked=false;await $('showNewsPins').emit('change');assert.equal(activeMarkers.length,0);
  await $('newsResults').emit('click',{target:{closest:()=>({dataset:{newsIndex:'0'}})}});assert.equal(activeMarkers.length,1);assert.equal(activeMarkers[0].opened,true);assert.equal(views.length,1);
  online=false;await $('refreshNews').emit('click');await settle();assert.equal($('runNewsScraper').disabled,true);assert.equal(activeMarkers.length,1,'Static news pins work without the Node controller');
  events.pagehide();
  console.log('Passed: news filtering, deduplication, source links, approximate geocoding, three imported pins, risk exclusion, local scraper API/launch controls, static hosting fallback, grouped pins, and map location actions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
