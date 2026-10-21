const assert=require('node:assert/strict');
const {createHandler,createBlobStore}=require('../testscraper/vercel-news');
const {scrapeData}=require('../testscraper/scraper');
const raw=require('../testscraper/scraper_cache.json');
const geo=require('../testscraper/geocoding_cache.json');
const seed=require('../Final Project 3rd Year/htmlFiles/news-accidents.json');
const clone=value=>JSON.parse(JSON.stringify(value));

(async()=>{
  let value={raw:clone(raw),geo:clone(geo),feed:clone(seed)},etag='1';
  const store={read:async()=>({value:clone(value),etag}),save:async(next,expected)=>{
    if(expected!==etag)throw Object.assign(new Error('Conflict'),{status:409});
    value=clone(next);etag=String(Number(etag)+1);return etag;
  }};
  const env={PUBLIC_ORIGIN:'https://roadguard.example',SCRAPER_RUN_TOKEN:'test-key'};
  const call=async(handler,action,{method='GET',key='',body={},origin='https://roadguard.example'}={})=>{
    const response={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
    await handler({url:'/api/news?action='+action,method,body,headers:{host:'roadguard.example',origin,'content-type':'application/json',authorization:key?'Bearer '+key:''}},response);
    return response;
  };
  let requestedSource,requestedDeep,release;
  const handler=createHandler({store,env,run:async options=>{
    requestedSource=options.source;
    requestedDeep=options.deep;
    assert(options.deadline>Date.now()&&options.deadline<Date.now()+220000);
    assert.equal(options.limit,30);
    await new Promise(resolve=>release=resolve);
    return {...seed,fetched_at:'2026-10-21T12:00:00Z'};
  }});
  let result=await call(handler,'status');assert.equal(result.body.can_run,false);assert.equal(result.body.execution,'request');assert.equal(result.body.deep_scan,true);
  result=await call(handler,'data');assert.equal(result.body.count,seed.count);
  result=await call(handler,'run',{method:'POST'});assert.equal(result.statusCode,401);
  result=await call(handler,'run',{method:'POST',key:'test-key',origin:'https://other.example'});assert.equal(result.statusCode,403);
  result=await call(handler,'run',{method:'POST',key:'test-key',body:{source:'invalid'}});assert.equal(result.statusCode,400);
  const pending=call(handler,'run',{method:'POST',key:'test-key',body:{source:'BomboCauayan',deep:true}});
  for(let i=0;i<10&&!release;i++)await Promise.resolve();
  assert.equal(requestedSource,'BomboCauayan');
  assert.equal(requestedDeep,true,'Deep scan mode reaches the storage-backed scraper');
  result=await call(handler,'status');assert.equal(result.body.running,true);
  result=await call(handler,'run',{method:'POST',key:'test-key'});assert.equal(result.statusCode,409,'Lease prevents overlapping function instances');
  release();result=await pending;assert.equal(result.statusCode,200);assert.equal(result.body.completed,true);
  assert.equal(value.lockUntil,0);assert.equal(value.feed.fetched_at,'2026-10-21T12:00:00Z');
  const failed=createHandler({store,env,run:async()=>{throw Error('Publisher unavailable');}});
  result=await call(failed,'run',{method:'POST',key:'test-key'});assert.equal(result.statusCode,500);
  assert.equal(value.feed.fetched_at,'2026-10-21T12:00:00Z','Failed fetch preserves the prior durable feed');assert.equal(value.lockUntil,0);
  const unconfigured=createHandler({env});
  result=await call(unconfigured,'status');assert.equal(result.body.storage_configured,false);assert.equal(result.body.can_run,false);
  result=await call(unconfigured,'data');assert.equal(result.body.count,seed.count,'Bundled news works before Blob setup');
  result=await call(unconfigured,'run',{method:'POST',key:'test-key'});assert.equal(result.statusCode,503);

  // Exercise the Blob adapter: private reads bypass cache, writes use ETag preconditions.
  let blob=null,version=0,lastOptions;
  const sdk={get:async(_path,options)=>{
    assert.equal(options.access,'private');assert.equal(options.useCache,false);
    return blob?{stream:new Response(JSON.stringify(blob)).body,blob:{etag:String(version)}}:null;
  },put:async(_path,text,options)=>{lastOptions=options;if(blob&&options.ifMatch!==String(version))throw Object.assign(new Error('Conflict'),{name:'BlobPreconditionFailedError'});blob=JSON.parse(text);return {etag:String(++version)};}};
  const blobStore=createBlobStore({sdk,token:'test-blob-token'});
  const empty=await blobStore.read();assert.equal(empty.etag,null);
  let saved=await blobStore.save(empty.value,empty.etag);assert.equal(lastOptions.allowOverwrite,false);
  await blobStore.save(empty.value,saved);assert.equal(lastOptions.ifMatch,'1');
  await assert.rejects(blobStore.save(empty.value,saved),error=>error.status===409);

  // The same scraper can publish through memory/Blob storage without file writes or HTTP.
  let published;
  const memory={readRaw:async()=>raw,readGeo:async()=>geo,writeFeed:async feed=>published=feed};
  await scrapeData({importCache:true,geocode:false,storage:memory});
  assert.equal(published.count,seed.count);assert(published.located>=3);
  const progress={running:true,phase:'',warnings:[],source_results:[]};
  await assert.rejects(scrapeData({force:true,storage:memory,progress,deadline:0,source:'BomboCauayan'}));
  assert(progress.warnings.length>0,'Expired request budgets stop before reaching a publisher');
  console.log('Passed: Vercel request completion, private Blob persistence/CAS locks, credentials/origin checks, failure retention, bundled fallback, and bounded storage-backed scraping.');
})().catch(error=>{console.error(error);process.exitCode=1;});
