'use strict';
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const crypto = require('node:crypto');
const { normalizeNews, attachLocation, feed, sourceURL, classifyNews } = require('./news-pipeline');
const DATA_DIR = !process.env.VERCEL && process.env.SCRAPER_DATA_DIR ? path.resolve(process.env.SCRAPER_DATA_DIR) : null;
if(DATA_DIR)fs.mkdirSync(DATA_DIR,{recursive:true});
const CACHE_FILE = path.join(DATA_DIR||__dirname, 'scraper_cache.json');
const GEO_CACHE = path.join(DATA_DIR||__dirname, 'geocoding_cache.json');
const APP_ROOT = path.resolve(__dirname, '../Final Project 3rd Year');
const OUTPUT = DATA_DIR ? path.join(DATA_DIR,'news-accidents.json') : path.join(APP_ROOT, 'htmlFiles/news-accidents.json');
const PORT = Number(process.env.PORT || 3000);
const CACHE_TTL = 30 * 60 * 1000;
const USER_AGENT = process.env.SCRAPER_USER_AGENT || 'ROADGUARD-Local-News/1.0';
const sources = {
  BomboCauayan: 'https://cauayan.bomboradyo.com/cauayan/aksidente-2/',
  Bombo: 'https://news.bomboradyo.com/?s=isabela',
  Philstar: 'https://www.philstar.com/search/isabela%20accident',
  DZRH: 'https://dzrhnews.com.ph/?s=isabela',
  SunStar: 'https://www.sunstar.com.ph/search?search=isabela',
  Tribune: 'https://tribune.net.ph/?s=isabela',
  ManilaTimes: 'https://www.manilatimes.net/?s=isabela',
  DailyGuardian: 'https://dailyguardian.com.ph/?s=isabela',
  Brigada: 'https://www.brigadanews.ph/category/local-news/luzon/isabela/'
};
const readJSON = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } };
const readCache = () => readJSON(CACHE_FILE,readJSON(path.join(__dirname,'scraper_cache.json'),{data:[]}));
const writeJSON = (file,data) => { const temporary=file+'.tmp'; fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n');fs.renameSync(temporary,file); };
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
let state = {running:false,phase:'Idle',completed:0,total:0,error:null,warnings:[],last_completed:null,source_results:[]};
let currentJob = null;
const robotsCache = new Map();
async function get(url, hostname) {
  return axios.get(url,{timeout:12000,headers:{'User-Agent':USER_AGENT},maxRedirects:4,
    beforeRedirect:options=>{if(options.hostname!==hostname) throw Error('Cross-host redirect skipped');}});
}
async function robotsAllowed(url) {
  const parsed=new URL(url),origin=parsed.origin;
  if (!robotsCache.has(origin)) {
    try { const response=await get(origin+'/robots.txt',parsed.hostname);robotsCache.set(origin,String(response.data)); }
    catch(error) { if(error.response?.status===404) robotsCache.set(origin,''); else throw Error('Cannot check robots.txt for '+parsed.hostname); }
  }
  const groups=[];let group={agents:[],rules:[]};
  for(const raw of robotsCache.get(origin).split(/\r?\n/)) {
    const line=raw.replace(/#.*$/,'').trim(),match=/^(user-agent|allow|disallow):\s*(.*)$/i.exec(line);
    if(!match) continue;
    if(match[1].toLowerCase()==='user-agent') {
      if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}
      group.agents.push(match[2].toLowerCase());
    } else if(match[2]) group.rules.push({allow:match[1].toLowerCase()==='allow',path:match[2]});
  }
  groups.push(group);
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&USER_AGENT.toLowerCase().includes(a)));
  const applicable=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const target=parsed.pathname+parsed.search;
  const matches=applicable.flatMap(g=>g.rules).filter(rule=>new RegExp('^'+rule.path.split('*').map(part=>part.replace(/[.+?^{}()|[\]\\]/g,'\\$&')).join('.*').replace(/\\\$$/,'$')).test(target));
  matches.sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
  return !matches.length||matches[0].allow;
}
async function fetchHtml(url) {
  if (!await robotsAllowed(url)) throw Error('robots.txt excludes '+new URL(url).hostname);
  for(let attempt=0;attempt<2;attempt++) {
    try{return (await get(url,new URL(url).hostname)).data;}
    catch(error){
      if(attempt||!(error.code==='ECONNABORTED'||error.code==='ECONNRESET'||[429,500,502,503,504].includes(error.response?.status)))throw error;
      const retryAfter=error.response?.headers?.['retry-after'];
      const delay=retryAfter?(Number.isFinite(Number(retryAfter))?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()):1500;
      // Longer publisher cooldowns are deferred to a later scan, not retried early.
      if(!Number.isFinite(delay)||delay>2000)throw error;
      await pause(Math.max(1500,delay));
    }
  }
}
function extractLinks(html,base,limit=30) {
  const $=cheerio.load(html),links=new Set(),host=new URL(base).hostname;
  const main=$('.td-ss-main-content, main, #main').first();
  const scope=main.length?main:$.root();
  const articleLinks=scope.find('.td-module-title a[href], .entry-title a[href], h2 a[rel=bookmark], h3 a[rel=bookmark], article h2 a[href], article h3 a[href]');
  (articleLinks.length?articleLinks:scope.find('a[href]')).each((_,element)=>{
    if($(element).closest('nav, footer, aside, .td-related-title, .td_block_related_posts, .td-footer-wrapper, .td-header-wrap').length)return;
    try { const url=new URL($(element).attr('href'),base); if(url.hostname!==host||!['http:','https:'].includes(url.protocol)||url.search||/^\/(?:category|tag|author|search|page|cauayan)\//.test(url.pathname)||url.pathname==='/')return;
      links.add(sourceURL(url.href)); } catch {}
  });
  return [...links].filter(Boolean).slice(0,limit);
}
function nextArchivePage(html,current,archive) {
  const $=cheerio.load(html),base=new URL(archive),here=new URL(current);
  const pageOf=url=>Number(/\/page\/(\d+)/.exec(url.pathname)?.[1]||url.searchParams.get('paged')||url.searchParams.get('page')||1);
  const candidates=[];
  $('a[rel=next], a.next, .page-nav a[href], .pagination a[href], .nav-links a[href]').each((_,element)=>{
    try{const url=new URL($(element).attr('href'),current),basePath=base.pathname.replace(/\/$/,'');
      if(url.origin!==base.origin||url.username||url.password||!(url.pathname.replace(/\/page\/\d+\/?$/,'').replace(/\/$/,'')===basePath))return;
      if(base.searchParams.get('s')!==url.searchParams.get('s'))return;
      if(pageOf(url)>pageOf(here))candidates.push(url);
    }catch{}
  });
  return candidates.sort((a,b)=>pageOf(a)-pageOf(b))[0]?.href||null;
}
function parseArticle(html,url) {
  const $=cheerio.load(html);
  const structured=[];
  const visit=value=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){if(/(?:NewsArticle|Article|ReportageNewsArticle)/.test(String(value['@type'])))structured.push(value);if(value['@graph'])visit(value['@graph']);}};
  $('script[type="application/ld+json"]').each((_,element)=>{try{visit(JSON.parse($(element).text()));}catch{}});
  const schema=structured.find(item=>item.articleBody)||structured[0]||{};
  const title=($('h1').first().text()||$('meta[property="og:title"]').attr('content')||schema.headline||$('title').text()).trim();
  const content=$('.td-post-content, .entry-content, .post-content, [itemprop=articleBody]').first();
  const article=content.length?content:$('article').first();
  article.find('script, style, nav, aside, footer, .related, .related-posts, .td_block_related_posts, .td-a-rec, .advertisement, .sharedaddy, .social-share').remove();
  const paragraphs=article.find('p').map((_,p)=>$(p).text().replace(/\s+/g,' ').trim()).get().filter(text=>text&&!/^(?:--?ads?--?|advertisement|read also|basahin din)/i.test(text));
  const body=(paragraphs.join('\n')||schema.articleBody||(content.length?content.text():'')).slice(0,24000);
  const summary=body.slice(0,600)
    ||$('meta[property="og:description"]').attr('content')||$('meta[name="description"]').attr('content')||'';
  return {chief_complaint:title,notes:summary,article_text:body||summary,source_url:url,published_at:$('meta[property="article:published_time"]').attr('content')||schema.datePublished||$('time[datetime]').first().attr('datetime')||null};
}
async function publish(raw,{geocode=true,storage=null,progress=state,deadline=Infinity}={}) {
  // Full article text is internal filtering evidence, never a public article copy.
  const data=normalizeNews(raw.data||[]).map(({article_text,...item})=>item),cache=storage ? await storage.readGeo() : readJSON(GEO_CACHE,readJSON(path.join(__dirname,'geocoding_cache.json'),{}));
  let lastGeocode=0;const attemptedLocations=new Set();
  for(let i=0;i<data.length;i++) {
    const item=data[i];if(progress.running)progress.phase='Locating news '+(i+1)+' of '+data.length;
    if(!item.location_query)continue;
    const key=item.location_query.toLowerCase();
    const negative=cache[key]?.not_found_at;
    const needsLookup=!cache[key]||(negative&&Date.now()-Date.parse(negative)>86400000);
    if(needsLookup&&geocode&&!attemptedLocations.has(key)) {
      if(Date.now()+Math.max(0,15000-(Date.now()-lastGeocode))+12000>deadline){progress.warnings.push('Location lookup deferred for '+item.municipality+'; request time limit reached.');continue;}
      // Manual small batches only; persistent cache and four requests/minute maximum.
      await pause(Math.max(0,15000-(Date.now()-lastGeocode)));
      attemptedLocations.add(key);
      lastGeocode=Date.now();
      try {
        const endpoint=new URL(process.env.GEOCODER_URL||'https://nominatim.openstreetmap.org/search');
        endpoint.search=new URLSearchParams({format:'json',countrycodes:'ph',limit:'1',q:item.location_query}).toString();
        const response=await get(endpoint.href,endpoint.hostname);
        if(!Array.isArray(response.data))throw Error('Invalid geocoder response');
        cache[key]=response.data[0]||{not_found_at:new Date().toISOString()};if(storage)await storage.writeGeo(cache);else writeJSON(GEO_CACHE,cache);
      } catch(error) {progress.warnings.push('Location unavailable for '+item.municipality+': '+(error.message || error.code || 'Network request failed'));}
    }
    data[i]=attachLocation(item,cache[key]);
  }
  const result={...feed(data,raw.fetched_at),source_results:raw.source_results || []};if(storage)await storage.writeFeed(result);else writeJSON(OUTPUT,result);return result;
}
async function scrapeData({importCache=false,force=false,geocode=true,source=null,limit=30,deep=false,storage=null,progress=state,deadline=Infinity,fetchPage=fetchHtml,wait=pause}={}) {
  if(source && !Object.hasOwn(sources,source))throw Error('Unknown source. Choose: '+Object.keys(sources).join(', '));
  if(!Number.isInteger(limit)||limit<1||limit>30)throw Error('Article limit must be between 1 and 30');
  const cached=storage ? await storage.readRaw() : readCache();
  if(importCache||(cached.fetched_at&&!force&&Date.now()-Date.parse(cached.fetched_at)<CACHE_TTL))return publish(cached,{geocode,storage,progress,deadline});
  const collected=[],entries=Object.entries(sources).filter(([name])=>!source||name===source);let successfulSources=0;
  const scanState={...(cached.scan_state||{})};
  progress.total=entries.length;
  for(const [source,url] of entries) {
    if(Date.now()+24000>deadline){progress.warnings.push('Remaining sources deferred to another fetch.');break;}
    progress.phase='Reading '+source;
    const result={source,url,pages:0,discovered:0,read:0,accepted:0,rejected:0,failed:0,deferred:0,reasons:{},status:'reading'};progress.source_results.push(result);
    try {
      let prior=scanState[source]||{};
      // First deep scan starts at page one, including older pages checked by a recent scan.
      if(deep&&!prior.deep_started_at)prior={deep_started_at:new Date().toISOString()};
      const checked={...(prior.checked||{})},pending=new Set(prior.pending||[]),discovered=new Set();
      const failures={...(prior.failures||{})},unavailable=new Set(prior.unavailable||[]),archivePages=new Set(prior.archive_pages||[]);
      const host=new URL(url).hostname;
      const validLink=link=>{try{const parsed=new URL(link);return parsed.hostname===host&&['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password;}catch{return false;}};
      for(const link of pending)if(!validLink(link))pending.delete(link);
      const first=await fetchPage(url);result.pages++;
      archivePages.add(url);
      const rootLinks=extractLinks(first,url,60);if(!rootLinks.length)throw Error('No article links found in publisher layout');
      rootLinks.forEach(link=>discovered.add(link));
      // Always check the newest page, then continue the historical archive on later scans.
      let next=prior.archive_complete?null:prior.next_page&&validLink(prior.next_page)?prior.next_page:nextArchivePage(first,url,url);
      let archiveComplete=prior.archive_complete||!next;
      const visited=new Set([url]);
      // Drain queued article URLs before discovering another batch, so none are truncated.
      while(next&&pending.size===0&&result.pages<3&&Date.now()+40000<deadline&&!visited.has(next)) {
        visited.add(next);await wait(1000);
        try{const html=await fetchPage(next);result.pages++;archivePages.add(next);extractLinks(html,next,60).forEach(link=>discovered.add(link));next=nextArchivePage(html,next,url);archiveComplete=!next;}
        catch(error){progress.warnings.push(source+': archive page deferred: '+error.message);break;}
      }
      result.discovered=discovered.size;
      // Recheck changed articles after one day, while prioritizing unseen articles.
      for(const link of discovered)if(!checked[link]||Date.now()-checked[link]>86400000)pending.add(link);
      const links=[...pending];
      let articlesRead=0;
      for(const link of links.slice(0,limit)) {
        if(Date.now()+27000>deadline){progress.warnings.push(source+': remaining articles deferred to another fetch.');break;}
        await wait(1000);
        try { const parsed=parseArticle(await fetchPage(link),link);articlesRead++;result.read++;pending.delete(link);checked[link]=Date.now();
          delete failures[link];unavailable.delete(link);const classification=classifyNews(parsed);
          if(classification.accepted){collected.push(parsed);result.accepted++;}
          else{result.rejected++;result.reasons[classification.reason]=(result.reasons[classification.reason]||0)+1;} }
        catch(error) {result.failed++;failures[link]=(failures[link]||0)+1;
          if(failures[link]>=3){pending.delete(link);unavailable.add(link);checked[link]=Date.now();}
          progress.warnings.push(source+': '+error.message);}
      }
      result.deferred=pending.size;
      scanState[source]={deep_started_at:prior.deep_started_at||null,archive_complete:archiveComplete,archive_pages:[...archivePages],next_page:next,checked:Object.fromEntries(Object.entries(checked).sort((a,b)=>b[1]-a[1]).slice(0,600)),pending:[...pending],failures,unavailable:[...unavailable]};
      result.has_more=!!(pending.size||next);result.archive_complete=archiveComplete;result.archive_pages=archivePages.size;result.unavailable=unavailable.size;
      result.checkpoint=crypto.createHash('sha256').update(JSON.stringify([next,[...pending],checked,failures,archiveComplete])).digest('hex').slice(0,20);
      if(articlesRead||!links.length||deep){successfulSources++;result.status=result.has_more?'partial':unavailable.size?'complete_with_errors':'ok';}else result.status='failed';
      if(result.deferred)progress.warnings.push(source+': '+result.deferred+' article(s) queued for the next scan.');
    } catch(error){result.status='failed';progress.warnings.push(source+': '+error.message);}
    progress.completed++;
  }
  if(!successfulSources)throw Error('No news sources could be read. Existing news pins were kept.');
  // Keep prior historical articles when a publisher temporarily fails or drops an old article.
  const combined=normalizeNews([...collected,...(cached.data||[])]);
  const raw={success:true,fetched_at:new Date().toISOString(),count:combined.length,data:combined,source_results:progress.source_results,scan_state:scanState};
  // Normalize accepts the published format as well as the original scraper schema.
  if(storage)await storage.writeRaw(raw);else writeJSON(CACHE_FILE,raw);
  return publish(raw,{geocode,storage,progress,deadline});
}
function runJob(options) {
  if(currentJob)return currentJob;
  state={running:true,phase:'Starting',completed:0,total:0,error:null,warnings:[],last_completed:state.last_completed,source_results:[]};
  currentJob=scrapeData(options).then(result=>{state.last_completed=new Date().toISOString();state.phase='Finished: '+result.located+' news pins';return result;})
    .catch(error=>{state.error=error.message;state.phase='Failed';throw error;})
    .finally(()=>{state.running=false;currentJob=null;});
  return currentJob;
}
function createApp({startRun=runJob,publicOrigin=process.env.PUBLIC_ORIGIN||'',runToken=process.env.SCRAPER_RUN_TOKEN||''}={}) {
  const publicURL=publicOrigin ? new URL(publicOrigin) : null;
  if(publicURL && (!['http:','https:'].includes(publicURL.protocol)||publicURL.username||publicURL.password||publicURL.pathname!=='/'||publicURL.search||publicURL.hash))throw Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path');
  const tokenMatches=value=>!!runToken && crypto.timingSafeEqual(crypto.createHash('sha256').update(String(value)).digest(),crypto.createHash('sha256').update(runToken).digest());
  const app=express();app.use(express.json({limit:'2kb'}));
  app.use('/scraper',(req,res,next)=>{
    const host=req.headers.host;
    const local=/^127\.0\.0\.1(?::\d+)?$|^localhost(?::\d+)?$/.test(host||'');
    if(!local && (!publicURL || host!==publicURL.host))return res.status(403).json({error:'Use the configured ROADGUARD server'});
    const expectedOrigin=local?'http://'+host:publicURL.origin;
    if(req.headers.origin&&req.headers.origin!==expectedOrigin)return res.status(403).json({error:'Use the map served by this ROADGUARD server'});
    const provided=/^Bearer (.+)$/i.exec(req.headers.authorization||'')?.[1]||'';
    req.scraperRunConfigured=!!runToken||(!publicURL&&local);
    req.scraperCanRun=tokenMatches(provided)||(!publicURL&&local&&!runToken);
    res.set('Cache-Control','no-store');next();
  });
  app.get('/scraper/status',(req,res)=>res.json({...state,available:true,scraper_version:'archive-v2',deep_scan:true,can_run:req.scraperCanRun,run_configured:req.scraperRunConfigured,sources:Object.keys(sources)}));
  app.get('/scraper/data',(_req,res)=>res.json(readJSON(OUTPUT,feed([],null))));
  app.post('/scraper/run',async(req,res)=>{
    if(!req.is('application/json'))return res.status(415).json({error:'JSON required'});
    if(!req.scraperRunConfigured)return res.status(503).json({error:'Online scraper runs require SCRAPER_RUN_TOKEN on the server'});
    if(!req.scraperCanRun)return res.status(401).json({error:'A valid scraper access key is required'});
    const source=req.body?.source??null;
    if(source!==null && (typeof source!=='string'||!Object.hasOwn(sources,source)))return res.status(400).json({error:'Choose a configured news source'});
    if(req.body?.deep!==undefined&&typeof req.body.deep!=='boolean')return res.status(400).json({error:'Deep scan must be a boolean'});
    if(currentJob)return res.status(409).json({...state,error:'Scraper is already running'});
    if(req.body?.deep){
      if(!source)return res.status(400).json({error:'Choose one publisher per deep-scan batch'});
      try{const result=await startRun({force:true,source,deep:true,deadline:Date.now()+210000});
        return res.json({success:true,completed:true,count:result.count,located:result.located,source_results:result.source_results,has_more:result.source_results.some(item=>item.has_more)});
      }catch(error){return res.status(500).json({error:error.message});}
    }
    startRun({force:true,source}).catch(()=>{});res.status(202).json({...state});
  });
  app.get('/',(_req,res)=>res.redirect('/htmlFiles/map.html'));
  app.get('/health',(_req,res)=>res.json({ok:true}));
  app.get('/htmlFiles/news-accidents.json',(_req,res)=>res.set('Cache-Control','no-store').json(readJSON(OUTPUT,feed([],null))));
  app.use(express.static(APP_ROOT,{dotfiles:'deny'}));return app;
}
if(require.main===module) {
  if(process.argv.includes('--once')||process.argv.includes('--import-cache')) {
    const options={importCache:process.argv.includes('--import-cache'),force:process.argv.includes('--force'),geocode:!process.argv.includes('--no-geocode'),source:process.argv.find(arg=>arg.startsWith('--source='))?.slice(9)||null,limit:Number(process.argv.find(arg=>arg.startsWith('--limit='))?.slice(8)||30)};
    const execute=async()=>{
      if(!process.argv.includes('--deep'))return runJob(options);
      let result;
      for(const source of options.source?[options.source]:Object.keys(sources)){
        const checkpoints=new Set();let more=true;
        while(more){
          result=await runJob({...options,source,deep:true,force:true,deadline:Date.now()+210000});
          const coverage=result.source_results.find(item=>item.source===source);
          console.log(source+': '+coverage.archive_pages+' archive pages covered; '+result.count+' saved articles; '+coverage.deferred+' queued.');
          more=coverage.has_more;
          if(more&&checkpoints.has(coverage.checkpoint))throw Error('Archive progress blocked. Run again later to resume.');
          checkpoints.add(coverage.checkpoint);
        }
      }
      return result;
    };
    execute()
      .then(result=>console.log('Saved '+result.count+' accident news articles; '+result.located+' map pins.\n'+JSON.stringify(state.source_results)+'\n'+state.warnings.join('\n')))
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  } else {
    // Publish existing cache immediately without external requests; Run scraper resolves new locations.
    publish(readCache(),{geocode:false}).catch(console.error);
    createApp().listen(PORT,process.env.HOST || (process.env.PUBLIC_ORIGIN ? '0.0.0.0' : '127.0.0.1'),()=>console.log('ROADGUARD map + scraper: '+(process.env.PUBLIC_ORIGIN||'http://localhost:'+PORT)+'\nOpen Scraper below Pin location; choose Deep scan to include old news.'));
  }
}
module.exports={createApp,runJob,parseArticle,extractLinks,nextArchivePage,publish,readJSON,sources,scrapeData};
