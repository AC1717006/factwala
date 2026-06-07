require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const DB_PATH    = path.join(__dirname, '../storage/postedNews.json');
const GNEWS_URL  = 'https://gnews.io/api/v4/top-headlines';

// ── Database helpers ──────────────────────────────────────────────────────────

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { posted: [] };
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { return { posted: [] }; }
}

function isAlreadyPosted(url) {
  return loadDB().posted.some(item => item.article_url === url);
}

function saveToDB(entry) {
  const db = loadDB();
  db.posted.push(entry);
  if (db.posted.length > 500) db.posted = db.posted.slice(-500);
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  logger.info('Saved to database', { title: entry.title });
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchLatestNews() {
  const apiKey = process.env.News_API;
  if (!apiKey) throw new Error('News_API environment variable is not set');

  logger.info('Fetching top Hindi news from GNews API...');

  const response = await retry(
    () => axios.get(GNEWS_URL, {
      params:  { lang: 'hi', country: 'in', max: 10, apikey: apiKey },
      timeout: 15000,
    }),
    { attempts: 3, delayMs: 3000, label: 'GNews fetch' }
  );

  const articles = response.data?.articles;
  if (!articles?.length) throw new Error('GNews returned no articles');

  logger.info(`Fetched ${articles.length} articles`);

  // Filter: must have title + description + not already posted
  const fresh = articles.filter(a =>
    a.title && a.description && a.url && !isAlreadyPosted(a.url)
  );

  logger.info(`${fresh.length} new articles not yet posted`);

  if (fresh.length === 0) {
    logger.warn('All articles already posted — nothing to publish today');
    return null;
  }

  // Pick article with the longest description (most content to rewrite)
  const best = fresh.reduce((prev, cur) =>
    (cur.description?.length || 0) > (prev.description?.length || 0) ? cur : prev
  );

  logger.info('Selected article', { title: best.title, source: best.source?.name });
  return best;
}

module.exports = { fetchLatestNews, saveToDB, isAlreadyPosted };
