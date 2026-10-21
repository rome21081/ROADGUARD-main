'use strict';
const crypto = require('node:crypto');

const municipalities = ['San Guillermo','San Mariano','San Agustin','San Isidro','San Manuel','San Mateo','San Pablo','Santa Maria','Santo Tomas','Benito Soliven','Delfin Albano','Ramon','Reina Mercedes','Alicia','Angadanan','Aurora','Burgos','Cabagan','Cabatuan','Cauayan','Cordon','Dinapigue','Divilacan','Echague','Gamu','Ilagan','Jones','Luna','Maconacon','Mallig','Naguilian','Palanan','Quezon','Quirino','Roxas','Santiago','Tumauini'];
const clean = value => String(value || '').normalize('NFKC').replace(/\s+/g,' ').trim();
const crashTerms = /\b(crash\w*|collision\w*|collid\w*|(?:road|vehicular|traffic|car|motorcycle|truck|bus|self imposed) accident\w*|hit.and.run|sideswip\w*|(?:nag|na|bu|ma|bi|pag|pagka|nakipag)?bangga\w*|bangaan|salpukan|sumalpok|pagsalpok|nasalpok|(?:na|ma|pag)?sagasa\w*|bumaliktad|tumaob|tumagilid|bumulusok|(?:ma|na)?aksidente\w*|nawalan ng (?:preno|kontrol)|nahulog sa (?:bangin|gilid|ilog))\b/i;
const vehicles = /\b(car|van|suv|motorcycle\w*|bus|truck|vehicle\w*|road|highway|traffic|pedestrian\w*|motorbike\w*|rider\w*|motorsiklo\w*|motorsiklista\w*|sasakyan\w*|bisikleta|siklista\w*|trak|kotse|jeep\w*|tricycle|pick.?up|kalsada|lansangan)\b/i;
const roadCrash = text => crashTerms.test(String(text).replace(/[-\u2010-\u2015]/g,' ')) && vehicles.test(text);
const wrongRegion = /\b(basilan|negros occidental|isabela city)\b/i;
const residence = /\b(residente(?: ng| sa)?|taga|resident(?:s)? of|lives? in|hometown)\b/i;
const outsideProvince = /\b(Mountain Province|Nueva Vizcaya|Nueva Ecija|Metro Manila|Quezon City|Tuguegarao|Baguio|Ifugao|Kalinga|Apayao|Abra|Ilocos (?:Norte|Sur)|Pangasinan|La Union|Bulacan|Pampanga|Tarlac|Benguet|Rizal|Cagayan|Aurora province|Quezon province)\b/i;
function locationEvidence(title,body) {
  const text=title+'\n'+body,candidates=[];
  for(const name of municipalities) {
    const pattern=new RegExp('\\b'+name+'(?: City)?\\s*,?\\s+(?:sa\\s+)?(?:(?:lalawigan|probinsya) ng |province of )?Isabela\\b','ig');
    for(const match of text.matchAll(pattern)) {
      const before=text.slice(Math.max(0,match.index-85),match.index).split(/[.!?\n]/).pop();
      const residential=residence.test(before),inTitle=match.index<title.length;
      candidates.push({name,index:match.index,residential,score:(inTitle?10:0)+(match.index<title.length+500?4:0)+(crashTerms.test(before)?5:0)-(residential?30:0)});
    }
  }
  const best=candidates.filter(item=>!item.residential).sort((a,b)=>b.score-a.score||a.index-b.index)[0];
  const provinces=[...text.matchAll(/\bisabela\b/ig)];
  const hasIncidentProvince=provinces.some(match=>!residence.test(text.slice(Math.max(0,match.index-100),match.index).split(/[.!?\n]/).pop()));
  // An explicit headline crash town wins over places mentioned later in the body.
  if(hasIncidentProvince&&!outsideProvince.test(title.replace(/Cagayan Valley/ig,''))) {
    const headline=municipalities.map(name=>({name,match:new RegExp('\\b(?:sa|in|at|near) (?:bayan ng |lungsod ng |city of )?'+name+'\\b','i').exec(title)})).filter(item=>item.match).sort((a,b)=>a.match.index-b.match.index)[0];
    if(headline&&crashTerms.test(title.replace(/[-\u2010-\u2015]/g,' '))&&!residence.test(title.slice(0,headline.match.index)))return {city:headline.name,hasProvince:true,residenceOnly:false};
  }
  return {city:best?.name||'',hasProvince:provinces.length>0,residenceOnly:(candidates.length>0&&!best)||!hasIncidentProvince};
}
function municipality(text) {
  if (wrongRegion.test(text)) return '';
  return locationEvidence('',String(text)).city;
}
function classifyNews(item) {
  if(!item||typeof item!=='object'||Array.isArray(item))return {accepted:false,reason:'invalid_article'};
  const title=clean(item.chief_complaint||item.title).slice(0,240);
  const body=clean(item.article_text||item.notes||item.summary).slice(0,24000),text=title+'\n'+body;
  if(!title||!sourceURL(item.source_url))return {accepted:false,reason:'invalid_article'};
  if(wrongRegion.test(text))return {accepted:false,reason:'outside_isabela'};
  if(outsideProvince.test(title.replace(/Cagayan Valley/ig,''))&&!/\bisabela\b/i.test(title))return {accepted:false,reason:'outside_isabela'};
  if(/\b(plane|aircraft|airvan|eroplano|helicopter|barko|bangka|boat|ship)\b/i.test(title)&&! /\b(car|truck|bus|motorcycle|motorsiklo|tricycle|pedestrian)\b/i.test(title))return {accepted:false,reason:'not_road_crash'};
  if(!roadCrash(text))return {accepted:false,reason:'not_road_crash'};
  if(/\b\d+\s+(?:magkakahiwalay\s+na\s+|road\s+)?(?:aksidente\w*|accidents?|crashes)\b.*\b(?:naitala|recorded|reported)\b/i.test(title))return {accepted:false,reason:'advisory_or_statistics'};
  if(/\b(panawagan|paala?ala|maiwasan|iwasan|mapababa|paiigtingin|helmet act|pagpapatupad|reminder|safety tips|awareness|campaign|seminar|simulation|drill|accident statistics|aksidente naitala|aksidenteng naitala)\b/i.test(title)&&! /\b(nasawi\w*|patay|sugatan|injured|killed|sumalpok|nabangga|bumangga|bangaan|banggaan)\b/i.test(title))return {accepted:false,reason:'advisory_or_statistics'};
  const location=locationEvidence(title,body);
  if(!location.hasProvince||location.residenceOnly)return {accepted:false,reason:'no_incident_location_in_isabela'};
  // A local victim's address must not turn an out-of-province crash into a local one.
  const lead=(title+' '+body.slice(0,350));
  if(!location.city&&outsideProvince.test(lead.replace(/Cagayan Valley/ig,'')))return {accepted:false,reason:'outside_isabela'};
  return {accepted:true,reason:'road_crash_in_isabela',municipality:location.city,body,title};
}
function sourceURL(value) {
  try { const url = new URL(value); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null; url.hash=''; url.search=''; return url.href; } catch { return null; }
}
function normalizeNews(items) {
  const seen = new Set(), titles = new Set(), data = [];
  for (const item of Array.isArray(items)?items:[]) {
    const analysis=classifyNews(item);
    if(!analysis.accepted)continue;
    const title=analysis.title,summary=clean(item.notes||item.summary||analysis.body).slice(0,600);
    const url = sourceURL(item.source_url);
    // Do not trust the old broad incident_type_key classifier or unrelated page body text.
    const titleKey = title.toLowerCase().replace(/\s*\|.*$/,'').replace(/[^\p{L}\p{N}]/gu,'');
    if (seen.has(url) || titles.has(titleKey)) continue;
    seen.add(url); titles.add(titleKey);
    const city = analysis.municipality;
    data.push({id:crypto.createHash('sha256').update(url).digest('hex').slice(0,20),title,summary,source_url:url,source_site:new URL(url).hostname,
      article_text:analysis.body,filter_reason:analysis.reason,
      incident_date:String(item.incident_date || '').slice(0,60),published_at:item.published_at || null,
      municipality:city,location_query:city ? city + ', Isabela, Philippines' : '',
      latitude:null,longitude:null,location_accuracy:'unlocated',verified:false});
  }
  return data;
}
function attachLocation(item, result) {
  if (!result || !/\bisabela\b/i.test(String(result.display_name)) || /\b(basilan|negros occidental)\b/i.test(String(result.display_name))) return item;
  const lat=Number(result.lat), lon=Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat<16.39 || lat>17.56 || lon<121.39 || lon>122.54) return item;
  return {...item,latitude:lat,longitude:lon,location_accuracy:'municipality',location_label:item.municipality + ', Isabela (approximate town/city location)'};
}
function feed(data, fetchedAt) {
  return {success:true,fetched_at:fetchedAt || null,count:data.length,located:data.filter(item=>item.latitude!==null&&item.longitude!==null).length,
    attribution:'Geocoding © OpenStreetMap contributors, ODbL',data:data.map(({article_text,...item})=>item)};
}
module.exports={normalizeNews,attachLocation,feed,municipality,sourceURL,roadCrash,classifyNews};
