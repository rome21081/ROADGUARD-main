'use strict';

// Explicit searches only: the public Nominatim service does not allow autocomplete.
window.MapPlaces = (() => {
  const cache = new Map();
  let queue = Promise.resolve(), lastRequest = 0;
  const request = (path, signal) => {
    if (cache.has(path)) return Promise.resolve(cache.get(path));
    const job = queue.then(async () => {
      if (signal?.aborted) throw new Error('Cancelled');
      if (cache.has(path)) return cache.get(path);
      const delay = Math.max(0, 1100 - (Date.now() - lastRequest));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (signal?.aborted) throw new Error('Cancelled');
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 12000);
      lastRequest = Date.now();
      try {
        const response = await fetch('https://nominatim.openstreetmap.org/' + path, { signal: controller.signal });
        if (!response.ok) throw new Error('Place lookup unavailable');
        const data = await response.json();
        if (signal?.aborted) throw new Error('Cancelled');
        cache.set(path, data);
        if (cache.size > 80) cache.delete(cache.keys().next().value);
        return data;
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
    });
    queue = job.catch(() => {});
    return job;
  };
  return {
    search: (term, signal) => request('search?format=json&limit=5&countrycodes=ph&q=' + encodeURIComponent(term), signal),
    reverse: async (point, signal) => {
      const data = await request('reverse?format=jsonv2&zoom=18&lat=' + point[0] + '&lon=' + point[1], signal);
      return typeof data?.display_name === 'string' && data.display_name.trim() ? 'Near ' + data.display_name.trim() : null;
    }
  };
})();
