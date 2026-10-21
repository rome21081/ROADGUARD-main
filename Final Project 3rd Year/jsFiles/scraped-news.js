'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const $=id=>document.getElementById(id),escape=window.workspaceEscape;
  if(!window.workspaceUser||!$('scrapedNewsResults'))return;
  let articles=[];
  const safeURL=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
  const render=()=>{
    const term=$('scrapedNewsSearch').value.trim().toLowerCase();
    const filtered=articles.filter(item=>[item.title,item.location_label,item.source_site].some(value=>String(value||'').toLowerCase().includes(term)));
    $('scrapedNewsStatus').textContent=filtered.length+' of '+articles.length+' scraped news articles · unverified';
    $('scrapedNewsResults').innerHTML=filtered.length?filtered.map(item=>'<article class="scraped-news-card"><small>NEWS · UNVERIFIED</small><h3>'+escape(item.title)+'</h3><p>'+escape(item.location_label||'Location not identified')+'</p><p>'+escape(item.source_site||'Publisher')+' · '+(Number.isFinite(Date.parse(item.published_at))?'Published '+escape(new Date(item.published_at).toLocaleDateString()):'Publication date unavailable')+'</p><a class="button" href="'+escape(item.source_url)+'" target="_blank" rel="noopener noreferrer">Read full article</a></article>').join(''):'<p>No scraped news matches your search.</p>';
  };
  const read=async url=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.data))throw Error();return data;}finally{clearTimeout(timer);}
  };
  const load=async()=>{
    $('reloadScrapedNews').disabled=true;$('scrapedNewsResults').setAttribute('aria-busy','true');
    try{
      let feed;try{feed=await read('/scraper/data');}catch{feed=await read('news-accidents.json');}
      articles=feed.data.filter(item=>item&&typeof item.title==='string'&&safeURL(item.source_url)).map(item=>({...item,source_url:safeURL(item.source_url)}));render();
    }catch{$('scrapedNewsStatus').textContent='News could not be loaded. Try Reload news.';}
    finally{$('reloadScrapedNews').disabled=false;$('scrapedNewsResults').setAttribute('aria-busy','false');}
  };
  $('scrapedNewsSearch').addEventListener('input',render);$('reloadScrapedNews').addEventListener('click',load);load();
  if(window.location.hash==='#scraped-news')$('scraped-news').focus();
});
