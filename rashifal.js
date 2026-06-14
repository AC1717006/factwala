require('dotenv').config();

// Allow disabling SSL verification for corporate proxy / VPN environments.
// Set DISABLE_SSL_VERIFY=true in .env ONLY for local development — never production.
if (process.env.DISABLE_SSL_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const fs   = require('fs');
const path = require('path');

const { generateRashifal }            = require('./src/ai/rewriteRashifal');
const { generateRashifalCarouselImages } = require('./src/image/generateRashifalCarousel');
const { uploadToImgBB }               = require('./src/upload/uploadImgBB');
const { createCarouselItem,
        createCarouselContainer }      = require('./src/instagram/createMedia');
const { publishMedia }                = require('./src/instagram/publishMedia');
const { sleep }                       = require('./src/utils/retry');
const logger                          = require('./src/utils/logger');

const TEST_MODE = process.argv.includes('--test');
const SEP = '─'.repeat(65);

const DB_PATH = path.join(__dirname, 'src/storage/postedRashifal.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { posted: [] };
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { return { posted: [] }; }
}

function saveToDB(entry) {
  const db = loadDB();
  db.posted.push(entry);
  if (db.posted.length > 100) db.posted = db.posted.slice(-100);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  logger.info('Saved rashifal to database', { date: entry.date });
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

async function main() {
  logger.info(SEP);
  logger.info(`FactWala Rashifal Bot  |  mode: ${TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
  logger.info(`Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  logger.info(SEP);

  const date = todayIST();

  // ── 1. Skip if already posted today ──────────────────────────────────────
  if (!TEST_MODE && loadDB().posted.some(item => item.date === date)) {
    logger.warn(`Rashifal for ${date} already posted. Exiting.`);
    process.exit(0);
  }

  // ── 2. Generate Rashifal content with Claude AI ──────────────────────────
  const rashifal = await generateRashifal(date);

  // ── 3. Generate FactWala Astrology carousel slides (1080x1080 x3) ────────
  const imagePaths = await generateRashifalCarouselImages(rashifal);

  // ── 4. Preview ─────────────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('CAPTION PREVIEW');
  console.log(SEP);
  console.log(rashifal.caption);
  console.log(SEP);
  console.log(`Slides: ${imagePaths.join(', ')}`);
  console.log(`${SEP}\n`);

  // ── 5. Upload slides to ImgBB (Instagram needs public URLs) ──────────────
  const imageUrls = [];
  for (const imagePath of imagePaths) {
    imageUrls.push(await uploadToImgBB(imagePath));
  }

  // ── TEST MODE: stop here (before Instagram) ──────────────────────────────
  if (TEST_MODE) {
    logger.success('TEST PASSED — all steps up to ImgBB upload succeeded.');
    console.log(`\nPublic image URLs:\n${imageUrls.join('\n')}`);
    logger.info('Run  node rashifal.js  to enable full Instagram publishing.');
    process.exit(0);
  }

  // ── 6. Create carousel item containers ───────────────────────────────────
  const childContainerIds = [];
  for (const imageUrl of imageUrls) {
    childContainerIds.push(await createCarouselItem(imageUrl));
  }

  // ── 7. Create carousel parent container ──────────────────────────────────
  await sleep(5000); // give Instagram time to process the carousel items
  const containerId = await createCarouselContainer(childContainerIds, rashifal.caption);

  // ── 8. Publish to Instagram ──────────────────────────────────────────────
  const postId = await publishMedia(containerId);

  // ── 9. Save to local database ────────────────────────────────────────────
  saveToDB({
    date:              date,
    published_post_id: postId,
    image_urls:        imageUrls,
    timestamp:         new Date().toISOString(),
    status:            'published',
  });

  logger.success(SEP);
  logger.success('Rashifal carousel published to Instagram!', {
    postId,
    date,
    slides: imageUrls.length,
  });
  logger.success(SEP);
}

main().catch(err => {
  logger.error('Fatal error — rashifal bot stopped', { message: err.message });
  if (err.response?.data) {
    logger.error('API response body', { body: JSON.stringify(err.response.data) });
  }
  process.exit(1);
});
