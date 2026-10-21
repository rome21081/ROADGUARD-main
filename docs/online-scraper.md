# Deploying ROADGUARD's live news scraper

**Using Vercel only? Follow [Vercel-only scraper setup](vercel-scraper.md).** It uses a Vercel Function and private Blob storage on the same deployment as the map.

The alternative instructions below deploy the live scraper as a continuously running **Node.js backend** or Docker container. A static-only deployment can display exported news but cannot execute `scraper.js`. Repository changes still need to be deployed; this change does not update your live Vercel project automatically.

## Node service

Set the repository root as the service directory.

Build command:

```sh
npm ci --omit=dev --prefix testscraper
```

Start command:

```sh
node testscraper/scraper.js
```

Configure these environment variables in your hosting provider:

| Variable | Value |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | Use the port provided by the host; otherwise `3000`. |
| `PUBLIC_ORIGIN` | Your exact HTTPS origin, such as `https://roadguard.example`, without a path. |
| `SCRAPER_RUN_TOKEN` | A long, private, random access key for starting scraper runs. Never put it in frontend source or commit it. |
| `SCRAPER_DATA_DIR` | A writable persistent directory mounted on the service. Stores article and geocoding caches plus the exported news feed. |
| `SCRAPER_USER_AGENT` | Identify your deployment, preferably with contact information. |

`testscraper/.env.example` lists the variables; it contains placeholders and is not loaded automatically. Store real values in your host's environment settings.

The health-check route is **`/health`**. Open the deployed service at **`/htmlFiles/map.html`**; `/` redirects there. Use one running instance: job state is kept in memory, and news/cache files are stored on disk. A persistent disk keeps fetched articles and geocoding results across restarts. Without persistent storage, the bundled saved news remains available, but later fetch results can be lost when the host replaces the instance.

## Docker

The repository includes a `Dockerfile` using Node 22 and a non-root runtime user.

```sh
docker build -t roadguard .
```

Deploy that image with the same environment variables. Mount writable persistent storage at `/app/data`; the container's Node user must be allowed to write there. The image defaults to port 3000, binds to all container interfaces, and checks `/health`. The Docker image itself has not been built in this workspace; Node hosting behavior and API access checks are covered by tests.

## Fetching news from the deployed map

1. Select **Scraper** below **Fit view** and **Pin location**.
2. Choose a publisher under **Fetch from**. The default is **Bombo Radyo Cauayan**; **All sources** fetches all configured publishers.
3. For a hosted server, expand **Scraper setup & access**, enter the access key, and select **Connect**. The key is kept only in the current page and sent to the same server as a bearer token.
4. Select **Scan now**. Progress appears in the popup. On completion, saved news and pins refresh automatically. **See scraped data** opens a separate section on the Accidents & incidents page. **Auto scan** repeats hourly while this tab remains open; it stops when leaving the page and may be delayed in background tabs.

Anyone can read exported news. Starting a hosted scrape requires the private key. Missing/wrong keys, unconfigured origins, and requests from another website are rejected. Do not give the access key to ordinary public-map viewers. **Reload** refreshes saved articles without launching another scrape.

On a continuously running Node/Docker host, the button starts a background job and polls its status. On Vercel, the dedicated adapter instead awaits completion inside each function request and persists results in private Blob storage. Only one run starts at a time. Opening the map or reading `/scraper/data` does not start a scrape.

## Sources and filtering

Configured publishers:

- Bombo Radyo Cauayan — <https://cauayan.bomboradyo.com/cauayan/aksidente-2/>
- Bombo Radyo Philippines
- Philstar
- DZRH News
- SunStar
- Daily Tribune
- The Manila Times
- Daily Guardian
- Brigada News

The scraper accepts **Isabela road-accident stories**, including vehicle collisions, motorcycle crashes, pedestrian accidents, and hit-and-runs. Filipino terms such as *aksidente*, *banggaan*, *sumalpok*, and *motorsiklo* are supported. Unrelated stories, unsafe links, duplicate articles, and Isabela City/Basilan stories are filtered out. Article links and content are extracted from the publisher's article layout rather than navigation menus.

Publisher availability varies. On October 21, 2026, a complete deep traversal covered all 10 publicly linked Cauayan accident archive pages and saved 45 relevant articles, including news published in May 2024. Of those, 43 articles have approximate town-level locations; two remain unlocated. No article URLs remained queued or unavailable at completion. There is no news publication-age cutoff. This verifies that archive; it does not establish that every unlinked, deleted, or differently categorized article on the publisher's entire website was discovered. Counts may change on later runs. See [filtering and scan coverage](news-scraper.md#filtering-and-scan-coverage) for rejection rules, pagination, and resumable queues.

Articles retain source links and publication timestamps. Publication/scrape time is not presented as the accident date. Locations are approximate town/city positions, clearly labeled in the map. These unverified news records do not change accident-prone tags or safer-route scoring.

Scraping respects publisher robots.txt, limits article requests, and preserves existing relevant news when sources fail. Geocoding uses cached, rate-limited lookups. Review the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) before production use; use a suitable alternative service for a larger deployment by setting `GEOCODER_URL`. Hourly auto scan is optional and runs only while the map tab stays open.

To check Cauayan directly from a terminal:

```powershell
npm.cmd run scrape:cauayan --prefix testscraper
```

Run all automated checks:

```powershell
npm.cmd test --prefix testscraper
```
