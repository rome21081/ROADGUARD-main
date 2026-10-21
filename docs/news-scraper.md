# Accident news and the web scraper

For your Vercel deployment, see [Vercel setup](vercel-scraper.md). Alternative Node/Docker instructions are in [Online scraper deployment](online-scraper.md). Local changes must be redeployed before the live site uses them.

From the project root, run this in a Windows terminal:

```powershell
npm.cmd start --prefix testscraper
```

Open **http://localhost:3000/htmlFiles/map.html**, then select **Scraper** below **Fit view** and **Pin location**, choose a source, and select **Scan now**. The popup shows progress and source/location warnings. **Auto scan** repeats hourly while this map tab stays open; **See scraped data** opens the separate news section on Accidents & incidents. After completion, news pins refresh automatically. The server serves the existing ROADGUARD application and its scraper API together; leave the terminal running, and use Ctrl+C to stop it. If dependencies are missing, first run `npm.cmd install --prefix testscraper`.

After updating scraper code, stop the existing local server with **Ctrl+C** in its terminal and start it again. An already running Node process keeps the previous implementation in memory and can overwrite caches using the older rules. On Vercel, redeploy the changed code instead.

Fetch news requires the Node backend, either locally or on your deployed ROADGUARD origin. A browser cannot execute `scraper.js` directly, and another static server (including VS Code Live Server) cannot launch it. Published news pins still work on a static server using the generated JSON file.

## Other commands

Fetch the configured publishers once, save accident news, and exit:

```powershell
npm.cmd run scrape --prefix testscraper
```

Deep-scan all publicly linked Cauayan accident archive pages, including older news, saving progress after each batch:

```powershell
npm.cmd run scrape:deep --prefix testscraper
```

In the map's Scraper popup, **Coverage > Deep scan - include old news** is the default. Select **Scan now** once: the browser submits consecutive batches until the linked archive is traversed, or you choose **Pause after this batch**. Keep the tab open. Reopening and scanning resumes unfinished work. The first deep scan revisits the archive from page one even if recent scans already saved a later cursor. There is no publication-age cutoff for news articles; the 36-month rule belongs to verified accident-prone analysis, not this historical news archive.

The server reports `scraper_version: "archive-v2"` and `deep_scan: true` at `/scraper/status`. If the popup still reports only 12 articles checked, an older server may still be running. The updated popup detects missing deep-scan support and prompts a restart/redeploy instead of silently doing a shallow scan.

Import and locate accident articles from the existing `scraper_cache.json` without contacting publishers:

```powershell
npm.cmd run import-cache --prefix testscraper
```

Re-export the cache offline using already cached coordinates:

```powershell
node testscraper/scraper.js --import-cache --no-geocode
```

The direct equivalents are `node testscraper/scraper.js` for the server and `node testscraper/scraper.js --once --force` for one scrape. File paths resolve relative to the script, so starting it from the repository root or `testscraper` produces the same output. Refresh news on an already open map after using a CLI command. Set `PORT` if 3000 is occupied.

## What appears on the map

- The original 36-item legacy cache supplied three relevant accident articles: San Mateo, Alicia, and Mallig. These have been imported with approximate municipality/city locations obtained from OpenStreetMap, with persistent lookup results in `testscraper/geocoding_cache.json`.
- Road-crash keywords, Isabela context, valid source links, and duplicate article checks replace the old broad classifier. Robberies, general station pages, and unrelated incidents are excluded. Articles from Isabela City in Basilan are excluded.
- A named municipality in the article must be identified before geocoding. The map labels these positions **approximate town/city locations**, rather than claiming a precise crash site. Unlocated articles stay in the news list with their source links. Articles sharing a location share one news pin.
- **Read full article** opens the publisher's original page. The publication date is kept separately; neither it nor the scraping date is substituted for the incident date.
- News records remain unverified and are displayed in a separate layer. They do not change accident-prone tags, proximity warnings, or safer-route scores.

The map reads `Final Project 3rd Year/htmlFiles/news-accidents.json`. Existing accident and incident files are preserved. The scraper cache stores accepted articles; a fresh scrape merges relevant historical articles rather than erasing them when a publisher temporarily fails. If no publisher can be read, existing news is retained and the run reports failure.

## Sources, geocoding, and local API

The scraper uses the publisher URLs in `testscraper/scraper.js`. It checks robots.txt, stays on each publisher's host, caps the number of articles, and spaces article requests. Publishers can block requests or change markup; source failures are reported rather than inventing records. A full run may take several minutes.

### Filtering and scan coverage

The implementation is rule-based. ALERT-CIA's scraper source or formal filtering specification was not provided, so this is not a claim of identical implementation.

- Extract the main article body, removing navigation, advertising, related articles, and sharing widgets. JSON-LD article text and publication metadata provide a fallback when available. Filtering reads up to 24,000 characters internally, rather than only the first three paragraphs. Public results contain a short excerpt and original source link; full text stays in the internal cache.
- Require both a road-crash signal and a road vehicle/road-user signal. Filipino variants include `bangaan`, `banggaan`, `pagbangga`, `masagasaan`, `nasagasaan`, and hyphenated `na-aksidente`. Aircraft/boat stories, prevention advice, statistics, unrelated news, and wrong-province stories are excluded conservatively.
- Require Isabela incident context. Prefer an explicit crash municipality over a victim's residence. A report naming Isabela without a reliable municipality can remain unlocated; the scraper never invents exact crash coordinates or incident dates.
- Remove duplicate source URLs and normalized titles. Newly fetched versions take precedence while prior accepted articles remain available.
- Per publisher, inspect the newest archive plus up to two further archive pages, and process up to 30 article URLs per batch. Follow same-publisher pagination. Keep an archive cursor, pending article queue, completed archive state, and recent successful URL checks in the internal cache (private Blob on Vercel). Deep scan automatically runs successive batches; latest-batch mode runs only one. The newest page is always checked for new stories. Queued articles are drained before more archive pages are discovered, so they are not silently truncated. Successful URLs are rechecked after one day. Failed articles receive up to three attempts across batches, then remain explicitly reported as unavailable rather than blocking the entire archive forever.
- One bounded retry handles timeouts and transient HTTP 429/5xx errors. Other failures remain visible. The popup reports archive pages, articles read, accepted/excluded counts and reasons, failed loads, and pending articles. A partial scan is not reported as complete archive coverage. Publisher pages blocked by robots, access restrictions, or unsupported dynamic markup remain unavailable.

Request limits deliberately bound each batch, while a deep scan can continue through all publicly linked archive pages across multiple requests. A completed traversal does not guarantee inaccessible, deleted, unlinked, or dynamically hidden articles were obtained. Failed pages pause traversal with saved progress. Full-text classification remains internal; published excerpts link to the original articles.

**OpenStreetMap Nominatim is a limited public service. Review its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) before running the scraper.** Geocoding is an explicit manual operation, single threaded, cached on disk, and limited to four uncached requests per minute. Avoid frequent automated runs. For a larger deployment, configure a suitable service using `GEOCODER_URL` (Nominatim-compatible search endpoint). Set `SCRAPER_USER_AGENT` to identify your deployment and contact information. OpenStreetMap attribution and the policy link appear in the scraper panel.

Local mode binds to `127.0.0.1`. Hosted mode supports a configured `PUBLIC_ORIGIN`, an externally reachable `HOST`, persistent storage, and key-protected scrape starts. Browser API requests must come from the same configured origin:

| Endpoint | Behavior |
| --- | --- |
| `GET /scraper/data` | Read exported news; never starts scraping. |
| `GET /scraper/status` | Read progress, errors, and warnings. |
| `POST /scraper/run` | Start one background run; JSON body required; concurrent starts return 409. |

Run checks with `npm.cmd test --prefix testscraper`. Automated checks cover filtering, source links, deduplication, location validation, news-risk separation, local API controls, static hosting fallback, and map pin interactions. Live publisher output and browser rendering can vary independently of these tests.


Bombo Radyo Cauayan is explicitly configured and live-tested. Use `npm.cmd run scrape:cauayan --prefix testscraper` for that publisher alone. In the map, the Fetch from selector defaults to Cauayan. News sources & filtering lists the configured publishers and accepted incident types. The Scan now button starts the selected source, while Reload only reloads the saved news feed. Hosted users enter the configured scraper key in Scraper setup & access before starting a run.
