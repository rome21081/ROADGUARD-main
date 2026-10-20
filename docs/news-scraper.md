# Accident news and the local web scraper

From the project root, run this in a Windows terminal:

```powershell
npm.cmd start --prefix testscraper
```

Open **http://localhost:3000/htmlFiles/map.html**, then **Road events → Accident news → Web scraper → Run scraper**. The panel shows progress and source/location warnings. After completion, news pins refresh automatically. The server serves the existing ROADGUARD application and its scraper API together; leave the terminal running, and use Ctrl+C to stop it. If dependencies are missing, first run `npm.cmd install --prefix testscraper`.

The Run scraper button requires this local server. A browser cannot execute `scraper.js` directly, and another static server (including VS Code Live Server) cannot launch it. Published news pins still work on a static server using the generated JSON file.

## Other commands

Fetch the configured publishers once, save accident news, and exit:

```powershell
npm.cmd run scrape --prefix testscraper
```

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

- The bundled 36-item legacy cache contains three relevant accident articles: San Mateo, Alicia, and Mallig. These have been imported with approximate municipality/city locations obtained from OpenStreetMap, with persistent lookup results in `testscraper/geocoding_cache.json`.
- Road-crash keywords, Isabela context, valid source links, and duplicate article checks replace the old broad classifier. Robberies, general station pages, and unrelated incidents are excluded. Articles from Isabela City in Basilan are excluded.
- A named municipality in the article must be identified before geocoding. The map labels these positions **approximate town/city locations**, rather than claiming a precise crash site. Unlocated articles stay in the news list with their source links. Articles sharing a location share one news pin.
- **Read full article** opens the publisher's original page. The publication date is kept separately; neither it nor the scraping date is substituted for the incident date.
- News records remain unverified and are displayed in a separate layer. They do not change accident-prone tags, proximity warnings, or safer-route scores.

The map reads `Final Project 3rd Year/htmlFiles/news-accidents.json`. Existing accident and incident files are preserved. The original scraper cache remains available; a fresh scrape merges relevant historical articles rather than erasing them when a publisher temporarily fails. If no publisher can be read, existing news is retained and the run reports failure.

## Sources, geocoding, and local API

The scraper uses the publisher URLs in `testscraper/scraper.js`. It checks robots.txt, stays on each publisher's host, caps the number of articles, and spaces article requests. Publishers can block requests or change markup; source failures are reported rather than inventing records. A full run may take several minutes.

**OpenStreetMap Nominatim is a limited public service. Review its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) before running the scraper.** Geocoding is an explicit manual operation, single threaded, cached on disk, and limited to four uncached requests per minute. Avoid frequent automated runs. For a larger deployment, configure a suitable service using `GEOCODER_URL` (Nominatim-compatible search endpoint). Set `SCRAPER_USER_AGENT` to identify your deployment and contact information. OpenStreetMap attribution and the policy link appear in the scraper panel.

The server binds only to `127.0.0.1`. API requests require a localhost/loopback Host, and browser requests must come from the server's own origin:

| Endpoint | Behavior |
| --- | --- |
| `GET /scraper/data` | Read exported news; never starts scraping. |
| `GET /scraper/status` | Read progress, errors, and warnings. |
| `POST /scraper/run` | Start one background run; JSON body required; concurrent starts return 409. |

Run checks with `npm.cmd test --prefix testscraper`. Automated checks cover filtering, source links, deduplication, location validation, news-risk separation, local API controls, static hosting fallback, and map pin interactions. Live publisher output and browser rendering can vary independently of these tests.
