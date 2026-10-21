# Vercel-only scraper setup

ROADGUARD can host both the map and live news fetching on Vercel. The repository now includes an awaited Vercel Function and private Blob storage; a separate Node server or Docker host is unnecessary for this deployment.

The existing map URL remains:
<https://road-native.vercel.app/Final%20Project%203rd%20Year/htmlFiles/map.html>

The live map returned HTTP 200 when checked on October 21, 2026. `/scraper/status` returned HTTP 404: the scraper API was not available on that deployment. The changes in this workspace have not been deployed remotely.

## Configure the Vercel project

1. Commit and push these repository changes to the branch Vercel deploys.
2. In Vercel project settings, set **Root Directory** to the repository root, where `vercel.json`, `package.json`, and `api/` are located. Use **Other** as the framework and **Node.js 22.x**. Let `vercel.json` supply the build command and `public` output directory; remove conflicting dashboard overrides.
3. Enable **Fluid compute**. The news function specifies a 300-second maximum duration. See [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).
4. In **Storage**, create a **private Vercel Blob store** and connect it to this project for Production. Confirm that Vercel adds `BLOB_READ_WRITE_TOKEN` to the project's environment. See [private Blob storage](https://vercel.com/docs/vercel-blob/private-storage).
5. Add the environment variables below for Production.
6. **Redeploy after connecting storage and setting the variables.** Changes to environment variables do not update an existing deployment.

| Variable | Production value |
| --- | --- |
| `PUBLIC_ORIGIN` | `https://road-native.vercel.app` — origin only, without a page path or trailing slash. |
| `SCRAPER_RUN_TOKEN` | A long, random private key you generate. Keep it in Vercel settings; never commit it or put it in frontend code. |
| `BLOB_READ_WRITE_TOKEN` | Supplied by the connected private Blob store. Do not expose this token in the map or share it with viewers. |
| `SCRAPER_USER_AGENT` | Optional deployment identification, preferably including a contact address. |

Vercel does not need `HOST`, `PORT`, or `SCRAPER_DATA_DIR`. The local Node/Docker settings in `testscraper/.env.example` apply to those alternative hosts. For preview deployments, use matching preview environment values and their actual origin; the production origin deliberately rejects other hostnames.

## Fetch news from the map

1. Select **Scraper** in the map controls, below **Fit view** and **Pin location**.
2. Expand **Scraper setup & access**, enter your `SCRAPER_RUN_TOKEN` value, and select **Connect**. This is the scraper access key, not the Blob token. It is held only in the current page.
3. Choose **Bombo Radyo Cauayan** or another publisher and select **Scan now**.
4. Leave **Coverage** on **Deep scan - include old news**, then keep the page open. One click continues through older archive pages in successive requests, saving after each batch. **All sources** traverses each publisher in turn. **Pause after this batch** safely stops after the current result is saved; **Scan now** resumes. Choose **Latest batch only** for a single shorter fetch.

**See scraped data** opens the separate **Scraped accident news** section on the Accidents & incidents page. It supports search and links to the original publisher articles. News remains separate from recorded reports and their totals.

**Auto scan · every 1 hour** repeats the selected sources while the current map tab remains open and connected. It is off by default, stops when leaving the page, and can be delayed by browser background throttling. It does not run on the server after the browser closes. Vercel Hobby permits server cron only once per day; hourly server cron requires a suitable paid plan and separate scheduling setup. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Saved news is publicly readable through the data API without the scraper access key. **Reload** reads saved news without starting a scrape. The Accidents & incidents page retains its existing sign-in requirement.

## Check the deployment

Open <https://road-native.vercel.app/scraper/status>. A configured deployment returns JSON with `execution: "request"`, `storage_configured: true`, and `run_configured: true`. Without an access key, `can_run: false` is expected. Saved news is available at `/scraper/data`.

- **404:** confirm the deployed branch includes `api/news.js` and `vercel.json`, Root Directory is the repository root, and redeploy.
- **Storage not configured:** connect a private Blob store, check `BLOB_READ_WRITE_TOKEN`, and redeploy.
- **401 when fetching:** enter the same private key as `SCRAPER_RUN_TOKEN` in Vercel.
- **403:** check that `PUBLIC_ORIGIN` matches the domain you are using, without the map page path.
- **409:** another run holds the shared lock. Wait for completion; an interrupted run's lock expires after 270 seconds.
- **Fetch failed:** inspect Vercel Function logs. Publisher availability and robots rules can prevent a live fetch; previous saved news is retained on failure.

## How the Vercel scraper works

`/scraper/*` rewrites to `api/news.js`. Each batch finishes inside its function request, with a 210-second processing budget and headroom under the configured 300-second duration. Each batch reads at most three archive pages and 30 articles. In deep mode the browser automatically submits the next batch until the linked archive is traversed; this is not a 30-article limit for the entire deep scan. A private Blob retains archive cursors, completion state, and pending URLs. Article failures are retried across batches up to three attempts, then reported as unavailable. The popup shows coverage, exclusions, and unavailable articles. No detached background process is started. A private Blob stores article history, geocoding cache, the public news feed, and a shared lock using conditional writes. This avoids relying on temporary function files or in-memory state between invocations.

The default source is Bombo Radyo Cauayan's accident archive. Other configured publishers and filtering rules are described in [online-scraper.md](online-scraper.md#sources-and-filtering). Only relevant Isabela road-accident stories are accepted. Pins show approximate town/city locations, retain source links, and remain excluded from accident-prone scoring because scraped news is unverified. If the request budget prevents geocoding, an article can remain without a pin until a later fetch.

Local automated checks cover API authorization, shared locking, persistence behavior, failure recovery, and sequential publisher requests. The static build is also checked locally. These checks do not establish that your actual Vercel Blob credentials or live deployment are configured correctly; use the status endpoint and a button-triggered fetch after redeploying to verify those.
