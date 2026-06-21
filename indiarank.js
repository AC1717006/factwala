require('dotenv').config();

if (process.env.DISABLE_SSL_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const fs   = require('fs');
const path = require('path');

const { generateIndiaRank }             = require('./src/ai/rewriteIndiaRank');
const { generateIndiaRankCarouselImages } = require('./src/image/generateIndiaRankCarousel');
const { uploadToImgBB }                 = require('./src/upload/uploadImgBB');
const { createCarouselItem,
        createCarouselContainer }       = require('./src/instagram/createMedia');
const { publishMedia }                  = require('./src/instagram/publishMedia');
const { sleep }                         = require('./src/utils/retry');
const logger                            = require('./src/utils/logger');

const TEST_MODE = process.argv.includes('--test');
const SEP = '─'.repeat(65);

const DB_PATH = path.join(__dirname, 'src/storage/postedIndiaRank.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { posted: [] };
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { return { posted: [] }; }
}

function saveToDB(entry) {
  const db = loadDB();
  db.posted.push(entry);
  if (db.posted.length > 365) db.posted = db.posted.slice(-365);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  logger.info('Saved to IndiaRank database', { date: entry.date, category: entry.category });
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

async function main() {
  logger.info(SEP);
  logger.info(`FactWala IndiaRank Bot  |  mode: ${TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
  logger.info(`Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  logger.info(SEP);

  const date = todayIST();
  const db   = loadDB();

  // ── 1. Skip if already posted today ──────────────────────────────────────
  if (!TEST_MODE && db.posted.some(item => item.date === date)) {
    logger.warn(`IndiaRank for ${date} already posted. Exiting.`);
    process.exit(0);
  }

  // Pass recently used categories so Claude avoids repeating them
  const recentCategories = db.posted.slice(-30).map(item => item.category).filter(Boolean);

  // ── 2. Generate content with Claude AI ───────────────────────────────────
  const content = await generateIndiaRank(date, recentCategories);

  // ── 3. Generate carousel images (1080x1080 x3) ───────────────────────────
  const imagePaths = await generateIndiaRankCarouselImages(content);

  // ── 4. Preview ────────────────────────────────────────────────────────────
  const hashtagStr = Array.isArray(content.hashtags)
    ? content.hashtags.join(' ')
    : content.hashtags;

  console.log(`\n${SEP}`);
  console.log(`CATEGORY : ${content.category}`);
  console.log(`SOURCE   : ${content.source} (${content.year})`);
  console.log(SEP);
  console.log('CAPTION PREVIEW');
  console.log(SEP);
  console.log(content.caption);
  console.log();
  console.log(hashtagStr);
  console.log(SEP);
  console.log(`Slides: ${imagePaths.join(', ')}`);
  console.log(`${SEP}\n`);

  // ── 5. Upload slides to ImgBB ─────────────────────────────────────────────
  const imageUrls = [];
  for (const imagePath of imagePaths) {
    imageUrls.push(await uploadToImgBB(imagePath));
  }

  // ── TEST MODE: stop before Instagram ─────────────────────────────────────
  if (TEST_MODE) {
    logger.success('TEST PASSED — all steps up to ImgBB upload succeeded.');
    console.log(`\nPublic image URLs:\n${imageUrls.join('\n')}`);
    logger.info('Run  node indiarank.js  to enable full Instagram publishing.');
    process.exit(0);
  }

  // ── 6. Create carousel item containers ───────────────────────────────────
  const childContainerIds = [];
  for (const imageUrl of imageUrls) {
    childContainerIds.push(await createCarouselItem(imageUrl));
  }

  // ── 7. Create carousel parent container ──────────────────────────────────
  await sleep(5000);
  const caption    = `${content.caption}\n\n${hashtagStr}`;
  const containerId = await createCarouselContainer(childContainerIds, caption);

  // ── 8. Publish to Instagram ───────────────────────────────────────────────
  const postId = await publishMedia(containerId);

  // ── 9. Save to database ───────────────────────────────────────────────────
  saveToDB({
    date,
    category:          content.category,
    source:            content.source,
    year:              content.year,
    published_post_id: postId,
    image_urls:        imageUrls,
    timestamp:         new Date().toISOString(),
    status:            'published',
  });

  logger.success(SEP);
  logger.success('IndiaRank carousel published to Instagram!', {
    postId,
    date,
    category: content.category,
    slides:   imageUrls.length,
  });
  logger.success(SEP);
}

main().catch(err => {
  logger.error('Fatal error — indiarank bot stopped', { message: err.message });
  if (err.response?.data) {
    logger.error('API response body', { body: JSON.stringify(err.response.data) });
  }
  process.exit(1);
});
