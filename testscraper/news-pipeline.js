'use strict';
const crypto = require('node:crypto');

const municipalities = ['San Guillermo','San Mariano','San Agustin','San Isidro','San Manuel','San Mateo','San Pablo','Santa Maria','Santo Tomas','Benito Soliven','Delfin Albano','Ramon','Reina Mercedes','Alicia','Angadanan','Aurora','Burgos','Cabagan','Cabatuan','Cauayan','Cordon','Dinapigue','Divilacan','Echague','Gamu','Ilagan','Jones','Luna','Maconacon','Mallig','Naguilian','Palanan','Quezon','Quirino','Roxas','Santiago','Tumauini'];
const roadCrash = text => /\b(crash\w*|collision|collid\w*|road accident|vehicular accident|traffic accident|car accident|motorcycle accident|truck accident|bus accident|hit.and.run|sideswip\w*|nabangga|bumangga|banggaan|salpukan|sumalpok|bumaliktad|tumaob|aksidente\w*)\b/i.test(text) && /\b(car|van|suv|motorcycle\w*|bus|truck|vehicle\w*|road|highway|traffic|pedestrian|motorsiklo\w*|motorsiklista\w*|sasakyan\w*|bisikleta|trak|kotse|jeep\w*|tricycle)\b/i.test(text);
function municipality(text) {
  if (!/\bisabela\b/i.test(text) || /\b(basilan|negros occidental|isabela city)\b/i.test(text)) return '';
  return municipalities.map(name=>({name,match:new RegExp('\\b'+name+'(?: City)?\\s*,?\\s+(?:province of )?Isabela\\b','i').exec(text)})).filter(item=>item.match).sort((a,b)=>a.match.index-b.match.index)[0]?.name || '';
}
function sourceURL(value) {
  try { const url = new URL(value); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null; url.hash=''; url.search=''; return url.href; } catch { return null; }
}
function normalizeNews(items) {
  const seen = new Set(), titles = new Set(), data = [];
  for (const item of items) {
    const title = String(item.chief_complaint || item.title || '').trim().slice(0,240);
    const summary = String(item.notes || item.summary || '').trim().slice(0,600);
    const text = title + '\n' + summary;
    const url = sourceURL(item.source_url);
    // Do not trust the old broad incident_type_key classifier or unrelated page body text.
    if (!title || !url || !roadCrash(text) || !/\bisabela\b/i.test(text) || /\b(basilan|negros occidental|isabela city)\b/i.test(text)) continue;
    const titleKey = title.toLowerCase().replace(/\s*\|.*$/,'').replace(/\W/g,'');
    if (seen.has(url) || titles.has(titleKey)) continue;
    seen.add(url); titles.add(titleKey);
    const city = municipality(text);
    data.push({id:crypto.createHash('sha256').update(url).digest('hex').slice(0,20),title,summary,source_url:url,source_site:new URL(url).hostname,
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
    attribution:'Geocoding © OpenStreetMap contributors, ODbL',data};
}
module.exports={normalizeNews,attachLocation,feed,municipality,sourceURL,roadCrash};
