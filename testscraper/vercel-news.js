'use strict';
const crypto=require('node:crypto');
const {scrapeData,sources}=require('./scraper');
const seedRaw=require('./scraper_cache.json');
const seedGeo=require('./geocoding_cache.json');
const seedFeed=require('../Final Project 3rd Year/htmlFiles/news-accidents.json');
const PATHNAME='roadguard/news-state.json';
const coded=(message,status)=>Object.assign(new Error(message),{status});

function createBlobStore({sdk=require('@vercel/blob'),token=process.env.BLOB_READ_WRITE_TOKEN}={}) {
  const options={access:'private',token};
  const read=async()=>{
    const result=await sdk.get(PATHNAME,{...options,useCache:false});
    return result ? {value:await new Response(result.stream).json(),etag:result.blob.etag} : {value:{raw:seedRaw,geo:seedGeo,feed:seedFeed},etag:null};
  };
  const save=async(value,etag)=>{
    try {
      const result=await sdk.put(PATHNAME,JSON.stringify(value),{...options,contentType:'application/json',addRandomSuffix:false,...(etag?{ifMatch:etag}:{allowOverwrite:false})});
      return result.etag;
    } catch(error) {
      if(error.name==='BlobPreconditionFailedError'||/already exists/i.test(error.message))throw coded('Another scraper run updated the news. Reload and try again.',409);
      throw error;
    }
  };
  return {read,save};
}

function createHandler({store=null,run=scrapeData,env=process.env,now=Date.now}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const send=(status,data)=>res.status(status).json(data);
    try {
      const action=(typeof req.query?.action==='string'?req.query.action:new URL(req.url,'https://roadguard.invalid').searchParams.get('action')) || /^\/scraper\/(status|data|run)(?:[?]|$)/.exec(req.url)?.[1];
      if(!['status','data','run'].includes(action))return send(404,{error:'Unknown scraper action'});
      const origin=env.PUBLIC_ORIGIN || (env.VERCEL_PROJECT_PRODUCTION_URL?'https://'+env.VERCEL_PROJECT_PRODUCTION_URL:env.VERCEL_URL?'https://'+env.VERCEL_URL:'');
      if(!origin)return send(503,{error:'Configure PUBLIC_ORIGIN with your deployed ROADGUARD URL'});
      const expected=new URL(origin);
      if(req.headers.host!==expected.host || (req.headers.origin&&req.headers.origin!==expected.origin))return send(403,{error:'Use the configured ROADGUARD deployment'});
      const provided=/^Bearer (.+)$/i.exec(req.headers.authorization||'')?.[1]||'';
      const authenticated=!!env.SCRAPER_RUN_TOKEN && crypto.timingSafeEqual(crypto.createHash('sha256').update(provided).digest(),crypto.createHash('sha256').update(env.SCRAPER_RUN_TOKEN).digest());
      const storageConfigured=!!store||!!env.BLOB_READ_WRITE_TOKEN;
      const configured=storageConfigured&&!!env.SCRAPER_RUN_TOKEN;
      if(action==='run'&&req.method!=='POST')return send(405,{error:'Use POST to fetch news'});
      if(action!=='run'&&req.method!=='GET')return send(405,{error:'Use GET'});
      if(action==='run'&&!configured)return send(503,{error:'Connect a private Vercel Blob store and configure SCRAPER_RUN_TOKEN'});
      if(action==='run'&&!authenticated)return send(401,{error:'A valid scraper access key is required'});
      const storage=storageConfigured?(store||createBlobStore({token:env.BLOB_READ_WRITE_TOKEN})):null;
      const snapshot=storage?await storage.read():{value:{feed:seedFeed},etag:null};
      if(action==='data')return send(200,snapshot.value.feed||seedFeed);
      if(action==='status')return send(200,{available:true,scraper_version:'archive-v2',deep_scan:true,execution:'request',storage_configured:storageConfigured,run_configured:configured,can_run:configured&&authenticated,
        sources:Object.keys(sources),running:(snapshot.value.lockUntil||0)>now(),phase:(snapshot.value.lockUntil||0)>now()?'Fetching '+snapshot.value.source:snapshot.value.phase||'Saved news ready',warnings:snapshot.value.warnings||[],source_results:snapshot.value.feed?.source_results||[]});
      if(!(req.headers['content-type']||'').includes('application/json'))return send(415,{error:'JSON required'});
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      const source=body.source||'BomboCauayan';
      if(body.deep!==undefined&&typeof body.deep!=='boolean')return send(400,{error:'Deep scan must be a boolean'});
      if(!Object.hasOwn(sources,source))return send(400,{error:'Choose one configured publisher per request'});
      if((snapshot.value.lockUntil||0)>now())return send(409,{error:'A scraper run is already active. Try again when it finishes.'});
      // Conditional Blob writes provide a durable lock across different function instances.
      const previous=snapshot.value;
      let value={...previous,lockUntil:now()+270000,source};
      const lease=await storage.save(value,snapshot.etag);
      const progress={running:true,phase:'Starting',completed:0,total:0,warnings:[],source_results:[]};
      const memory={readRaw:async()=>value.raw||seedRaw,readGeo:async()=>value.geo||seedGeo,
        writeRaw:async raw=>{value.raw=raw;},writeGeo:async geo=>{value.geo=geo;},writeFeed:async feed=>{value.feed=feed;}};
      try {
        // Finish inside this invocation, before responding. No detached background work.
        const feed=await run({source,force:true,limit:30,deep:body.deep===true,storage:memory,progress,deadline:now()+210000});
        value={...value,feed,lockUntil:0,phase:'Finished: '+feed.located+' news pins',warnings:progress.warnings};
        await storage.save(value,lease);
        return send(200,{success:true,completed:true,count:feed.count,located:feed.located,warnings:progress.warnings,source_results:feed.source_results||[],has_more:(feed.source_results||[]).some(item=>item.has_more)});
      } catch(error) {
        await storage.save({...previous,lockUntil:0,phase:'Fetch failed. Previous news was kept.',warnings:[error.message]},lease);
        throw error;
      }
    } catch(error) {
      return send(error.status||500,{error:error.status?error.message:'News fetch could not finish. Previous news is preserved; check the Vercel Function logs.'});
    }
  };
}
module.exports={createHandler,createBlobStore};
