const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  let now = 10000, fail = false;
  const requests = [], window = {};
  const context = vm.createContext({
    window, AbortController,
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) {
      // Advance only rate-limit waits; timeout guards must not fire on successful responses.
      if (delay < 12000) { now += delay; Promise.resolve().then(fn); }
      return 1;
    },
    clearTimeout() {},
    fetch: async url => {
      requests.push({url, time: now});
      if (fail) return {ok: false};
      return {ok: true, json: async () => url.includes('/reverse?') ? {display_name: 'Main Road, Echague'} : [{lat: '16.7', lon: '121.6', display_name: 'Echague'}]};
    }
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../Final Project 3rd Year/jsFiles/map-places.js'), 'utf8'), context);
  const places = window.MapPlaces;
  const [results, name] = await Promise.all([places.search('Echague & town'), places.reverse([16.7,121.6])]);
  assert.equal(results[0].display_name, 'Echague');
  assert.equal(name, 'Near Main Road, Echague');
  assert.match(requests[0].url, /countrycodes=ph/);
  assert.match(requests[0].url, /Echague%20%26%20town/);
  assert(requests[1].time - requests[0].time >= 1100, 'Forward and reverse lookups share the rate limit');
  await Promise.all([places.search('Echague & town'), places.reverse([16.7,121.6])]);
  assert.equal(requests.length, 2, 'Repeat lookups use cache');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(places.search('Cancelled', controller.signal));
  assert.equal(requests.length, 2, 'Cancelled requests do not reach the service');
  fail = true;
  await assert.rejects(places.search('Offline'));
  fail = false;
  await places.search('Another town');
  assert.equal(requests.length, 4, 'Failed lookups do not block later requests');
  assert(requests.slice(1).every((request,index) => request.time - requests[index].time >= 1100));
  console.log('Passed: shared geocoder throttling, encoded place search, nearby place names, caching, cancellation, and network recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });
