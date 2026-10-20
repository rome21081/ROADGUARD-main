'use strict';
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const crypto = require('node:crypto');
const { normalizeNews, attachLocation, feed, sourceURL } = require('./news-pipeline');
const DATA_DIR = process.env.SCRAPER_DATA_DIR ? path.resolve(process.env.SCRAPER_DATA_DIR) : null;
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
  return (await get(url,new URL(url).hostname)).data;
}
function extractLinks(html,base,limit=12) {
  const $=cheerio.load(html),links=new Set(),host=new URL(base).hostname;
  const articleLinks=$('.td-module-title a[href], .entry-title a[href], h2 a[rel=bookmark], h3 a[rel=bookmark]');
  (articleLinks.length?articleLinks:$('a[href]')).each((_,element)=>{
    try { const url=new URL($(element).attr('href'),base); if(url.hostname!==host||!['http:','https:'].includes(url.protocol)||url.search||/^\/(?:category|tag|author|search|page|cauayan)\//.test(url.pathname)||url.pathname==='/')return;
      links.add(sourceURL(url.href)); } catch {}
  });
  return [...links].filter(Boolean).slice(0,limit);
}
function parseArticle(html,url) {
  const $=cheerio.load(html);
  const title=($('meta[property="og:title"]').attr('content')||$('h1').first().text()||$('title').text()).trim();
  const content=$('.td-post-content, .entry-content, .post-content, [itemprop=articleBody]').first();
  const article=content.length?content:$('article').first();
  const summary=(article.length?article.find('p'):$('.entry-content p, .post-content p')).slice(0,3).map((_,p)=>$(p).text().trim()).get().join(' ').slice(0,600)
    ||$('meta[property="og:description"]').attr('content')||$('meta[name="description"]').attr('content')||'';
  return {chief_complaint:title,notes:summary,source_url:url,published_at:$('meta[property="article:published_time"]').attr('content')||null};
}
async function publish(raw,{geocode=true}={}) {
  const data=normalizeNews(raw.data||[]),cache=readJSON(GEO_CACHE,readJSON(path.join(__dirname,'geocoding_cache.json'),{}));
  let lastGeocode=0;
  for(let i=0;i<data.length;i++) {
    const item=data[i];if(state.running)state.phase='Locating news '+(i+1)+' of '+data.length;
    if(!item.location_query)continue;
    const key=item.location_query.toLowerCase();
    if(!(key in cache)&&geocode) {
      // Manual small batches only; persistent cache and four requests/minute maximum.
      await pause(Math.max(0,15000-(Date.now()-lastGeocode)));
      lastGeocode=Date.now();
      try {
        const endpoint=new URL(process.env.GEOCODER_URL||'https://nominatim.openstreetmap.org/search');
        endpoint.search=new URLSearchParams({format:'json',countrycodes:'ph',limit:'1',q:item.location_query}).toString();
        const response=await get(endpoint.href,endpoint.hostname);
        if(!Array.isArray(response.data))throw Error('Invalid geocoder response');
        cache[key]=response.data[0]||null;writeJSON(GEO_CACHE,cache);
      } catch(error) {state.warnings.push('Location unavailable for '+item.municipality+': '+(error.message || error.code || 'Network request failed'));}
    }
    data[i]=attachLocation(item,cache[key]);
  }
  const result={...feed(data,raw.fetched_at),source_results:raw.source_results || []};writeJSON(OUTPUT,result);return result;
}
async function scrapeData({importCache=false,force=false,geocode=true,source=null,limit=12}={}) {
  if(source && !Object.hasOwn(sources,source))throw Error('Unknown source. Choose: '+Object.keys(sources).join(', '));
  if(!Number.isInteger(limit)||limit<1||limit>30)throw Error('Article limit must be between 1 and 30');
  const cached=readCache();
  if(importCache||(cached.fetched_at&&!force&&Date.now()-Date.parse(cached.fetched_at)<CACHE_TTL))return publish(cached,{geocode});
  const collected=[],entries=Object.entries(sources).filter(([name])=>!source||name===source);let successfulSources=0;
  state.total=entries.length;
  for(const [source,url] of entries) {
    state.phase='Reading '+source;
    const result={source,url,read:0,accepted:0,status:'reading'};state.source_results.push(result);
    try {
      const html=await fetchHtml(url);const links=extractLinks(html,url,limit);if(!links.length)throw Error('No article links found');
      let articlesRead=0;
      for(const link of links) {
        await pause(1000);
        try { const parsed=parseArticle(await fetchHtml(link),link);articlesRead++;result.read++;
          if(normalizeNews([parsed]).length){collected.push(parsed);result.accepted++;} }
        catch(error) {state.warnings.push(source+': '+error.message);}
      }
      if(articlesRead){successfulSources++;result.status='ok';}else result.status='failed';
    } catch(error){result.status='failed';state.warnings.push(source+': '+error.message);}
    state.completed++;
  }
  if(!successfulSources)throw Error('No news sources could be read. Existing news pins were kept.');
  // Keep prior historical articles when a publisher temporarily fails or drops an old article.
  const combined=normalizeNews([...collected,...(cached.data||[])]);
  const raw={success:true,fetched_at:new Date().toISOString(),count:combined.length,data:combined,source_results:state.source_results};
  // Normalize accepts the published format as well as the original scraper schema.
  writeJSON(CACHE_FILE,raw);
  return publish(raw,{geocode});
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
  app.get('/scraper/status',(req,res)=>res.json({...state,available:true,can_run:req.scraperCanRun,run_configured:req.scraperRunConfigured,sources:Object.keys(sources)}));
  app.get('/scraper/data',(_req,res)=>res.json(readJSON(OUTPUT,feed([],null))));
  app.post('/scraper/run',(req,res)=>{
    if(!req.is('application/json'))return res.status(415).json({error:'JSON required'});
    if(!req.scraperRunConfigured)return res.status(503).json({error:'Online scraper runs require SCRAPER_RUN_TOKEN on the server'});
    if(!req.scraperCanRun)return res.status(401).json({error:'A valid scraper access key is required'});
    if(currentJob)return res.status(409).json({...state,error:'Scraper is already running'});
    startRun({force:true}).catch(()=>{});res.status(202).json({...state});
  });
  app.get('/',(_req,res)=>res.redirect('/htmlFiles/map.html'));
  app.get('/health',(_req,res)=>res.json({ok:true}));
  app.get('/htmlFiles/news-accidents.json',(_req,res)=>res.set('Cache-Control','no-store').json(readJSON(OUTPUT,feed([],null))));
  app.use(express.static(APP_ROOT,{dotfiles:'deny'}));return app;
}
if(require.main===module) {
  if(process.argv.includes('--once')||process.argv.includes('--import-cache')) {
    runJob({importCache:process.argv.includes('--import-cache'),force:process.argv.includes('--force'),geocode:!process.argv.includes('--no-geocode'),source:process.argv.find(arg=>arg.startsWith('--source='))?.slice(9)||null,limit:Number(process.argv.find(arg=>arg.startsWith('--limit='))?.slice(8)||12)})
      .then(result=>console.log('Saved '+result.count+' accident news articles; '+result.located+' map pins.\n'+JSON.stringify(state.source_results)+'\n'+state.warnings.join('\n')))
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  } else {
    // Publish existing cache immediately without external requests; Run scraper resolves new locations.
    publish(readCache(),{geocode:false}).catch(console.error);
    createApp().listen(PORT,process.env.HOST || (process.env.PUBLIC_ORIGIN ? '0.0.0.0' : '127.0.0.1'),()=>console.log('ROADGUARD map + scraper: '+(process.env.PUBLIC_ORIGIN||'http://localhost:'+PORT)+'\nOpen Road events → Accident news → Run scraper.'));
  }
}
module.exports={createApp,runJob,parseArticle,extractLinks,publish,readJSON,sources};
