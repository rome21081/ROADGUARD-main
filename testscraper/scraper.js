const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const sleep = require('sleep-promise');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const CACHE_FILE = './scraper_cache.json';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// ===============================
// SOURCES
// ===============================
const sources = {
  'bombo': 'https://news.bomboradyo.com/?s=isabela',
  'philstar': 'https://www.philstar.com/search/isabela%20accident',
  'DZRH': 'https://dzrhnews.com.ph/?s=isabela',
  'SunStar': 'https://www.sunstar.com.ph/search?search=isabela',
  'Tribune': 'https://tribune.net.ph/?s=isabela',
  'ManilaTimes': 'https://www.manilatimes.net/?s=isabela',
  'DailyGuardian': 'https://dailyguardian.com.ph/?s=isabela',
  'Brigadanews': 'https://www.brigadanews.ph/category/local-news/luzon/isabela/'
};

// ===============================
// INCIDENT CLASSIFICATION
// ===============================
const incidentTypes = {
  car: ['Car Accident', 'car', 'automobile', 'van', 'suv'],
  motorcycle: ['Motorcycle Accident', 'motorcycle', 'bike', 'biker'],
  bus: ['Bus Accident', 'bus'],
  truck: ['Truck Accident', 'truck', 'lorry'],
  pedestrian: ['Pedestrian Accident', 'pedestrian', 'crosswalk'],
  fire: ['Fire', 'fire', 'blaze'],
  explosion: ['Explosion', 'explosion', 'blast'],
  flood: ['Flood', 'flood'],
  earthquake: ['Earthquake', 'earthquake', 'tremor'],
  robbery: ['Robbery', 'robbery', 'hold-up', 'snatch']
};

const incidentKeywords = [
  'car', 'accident', 'fire', 'motorcycle',
  'bus', 'truck', 'pedestrian',
  'injury', 'hospital', 'ambulance'
];

// ===============================
// HELPER FUNCTIONS
// ===============================
function classifyIncident(text) {
  const low = text.toLowerCase();

  for (const [key, keywords] of Object.entries(incidentTypes)) {
    for (const kw of keywords) {
      if (low.includes(kw.toLowerCase())) {
        return { key, label: keywords[0] };
      }
    }
  }

  return null;
}

function parseDate(text) {
  const dateRegex = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s\d{1,2},\s\d{4})\b/i;
  const match = text.match(dateRegex);
  return match ? match[0] : '';
}

function parseInjury(text) {
  const low = text.toLowerCase();
  return /injury|injured|hospitalized|wounded/.test(low) ? 'Yes' : 'No';
}

function parseTreatment(text) {
  const match = text.match(/(treated at|hospitalized at|admitted to|undergoing treatment)\s.*?(\.|,|\n)/i);
  return match ? match[0] : '';
}

const cities = ['Isabela', 'Cauayan', 'Santiago', 'Ilagan', 'Alicia', 'Cabagan'];

function parseCity(text) {
  for (const city of cities) {
    if (text.includes(city)) return city;
  }
  return '';
}

function isRelevant(text) {
  const low = text.toLowerCase();
  return incidentKeywords.some(k => low.includes(k));
}

async function fetchHtml(url) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'IncidentScraper/1.0 (+your@email.example)' },
      timeout: 12000
    });
    return res.data;
  } catch (err) {
    console.error('Fetch error:', url, err.message);
    return null;
  }
}

function extractLinks(html, base) {
  const $ = cheerio.load(html);
  const links = [];

  $('a[href]').each((i, el) => {
    let href = $(el).attr('href');

    if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
      if (!href.startsWith('http')) {
        try {
          href = new URL(href, base).href;
        } catch {
          return;
        }
      }

      links.push(href.split('#')[0]);
    }
  });

  return [...new Set(links)];
}

// ===============================
// MAIN SCRAPER
// ===============================
async function scrapeData() {

  // Return cache if valid
  if (fs.existsSync(CACHE_FILE)) {
    const stats = fs.statSync(CACHE_FILE);
    if (Date.now() - stats.mtimeMs < CACHE_TTL) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  }

  const collected = {};

  for (const [sourceName, url] of Object.entries(sources)) {

    const html = await fetchHtml(url);
    if (!html) continue;

    const links = extractLinks(html, url);

    for (const link of links.slice(0, 30)) {

      await sleep(300);

      const articleHtml = await fetchHtml(link);
      if (!articleHtml) continue;

      const $ = cheerio.load(articleHtml);

      const title =
        $('meta[property="og:title"]').attr('content') ||
        $('title').text() ||
        '';

      const snippet =
        $('article p, div.entry p, div.post p, p').first().text() || '';

      const body =
        $('article p, div.entry p, div.post p, p')
          .map((i, el) => $(el).text())
          .get()
          .join('\n\n');

      const combined = `${title}\n\n${snippet}\n\n${body}`;

      if (!isRelevant(combined)) continue;

      const classification = classifyIncident(combined);
      if (!classification) continue;

      const hash = crypto.createHash('md5').update(link).digest('hex');

      if (!collected[hash]) {
        collected[hash] = {
          incident_date: parseDate(combined),
          incident_city: parseCity(combined),
          incident_state: 'Isabela',
          chief_complaint: title.trim(),
          notes: snippet.trim() || body.trim(),
          injury_present: parseInjury(combined),
          treatment: parseTreatment(combined),
          incident_type_key: classification.key,
          incident_type_label: classification.label,
          source_url: link,
          source_site: new URL(link).hostname
        };
      }
    }
  }

  const finalData = Object.values(collected);

  const response = {
    success: true,
    fetched_at: new Date().toISOString(),
    count: finalData.length,
    data: finalData
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(response, null, 2));

  return response;
}

// ===============================
// EXPRESS API
// ===============================
app.get('/scraper/data', async (req, res) => {
  try {
    const data = await scrapeData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Scraper failed.' });
  }
});

app.listen(PORT, () =>
  console.log(`Scraper API running at http://localhost:${PORT}/scraper/data`)
);
