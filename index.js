require('dotenv').config();

// Allow disabling SSL verification for corporate proxy / VPN environments.
// Set DISABLE_SSL_VERIFY=true in .env ONLY for local development — never production.
if (process.env.DISABLE_SSL_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const { fetchLatestNews, saveToDB }   = require('./src/news/fetchNews');
const { rewriteNews }                 = require('./src/ai/rewriteNews');
const { generateNewsImage }           = require('./src/image/generateImage');
const { uploadToImgBB }               = require('./src/upload/uploadImgBB');
const { createMediaContainer }        = require('./src/instagram/createMedia');
const { publishMedia }                = require('./src/instagram/publishMedia');
const logger                          = require('./src/utils/logger');

const TEST_MODE = process.argv.includes('--test');
const SEP = '─'.repeat(65);

async function main() {
  logger.info(SEP);
  logger.info(`FactWala Instagram Bot  |  mode: ${TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
  logger.info(`Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  logger.info(SEP);

  // ── 1. Fetch news ────────────────────────────────────────────────────────
  const article = await fetchLatestNews();
  if (!article) {
    logger.warn('No new articles available. Exiting.');
    process.exit(0);
  }

  // ── 2. Rewrite with Groq AI ──────────────────────────────────────────────
  const rewritten = await rewriteNews(article);

  // ── 3. Generate FactWala branded image ───────────────────────────────────
  const imagePath = await generateNewsImage(rewritten.headline, rewritten.summary);

  // ── 4. Preview ───────────────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('CAPTION PREVIEW');
  console.log(SEP);
  console.log(rewritten.caption);
  console.log(SEP);
  console.log(`Image: ${imagePath}`);
  console.log(`${SEP}\n`);

  // ── 5. Upload image to ImgBB (Instagram needs a public URL) ─────────────
  const imageUrl = await uploadToImgBB(imagePath);

  // ── TEST MODE: stop here (before Instagram) ──────────────────────────────
  if (TEST_MODE) {
    logger.success('TEST PASSED — all steps up to ImgBB upload succeeded.');
    console.log(`\nPublic image URL: ${imageUrl}`);
    logger.info('Run  npm start  to enable full Instagram publishing.');
    process.exit(0);
  }

  // ── 6. Create Instagram media container ─────────────────────────────────
  const containerId = await createMediaContainer(imageUrl, rewritten.caption);

  // ── 7. Publish to Instagram ──────────────────────────────────────────────
  const postId = await publishMedia(containerId);

  // ── 8. Save to local database ────────────────────────────────────────────
  saveToDB({
    title:             article.title,
    source:            article.source?.name || 'GNews',
    article_url:       article.url,
    published_post_id: postId,
    image_url:         imageUrl,
    timestamp:         new Date().toISOString(),
    status:            'published',
  });

  logger.success(SEP);
  logger.success('Post published to Instagram!', {
    postId,
    headline:  rewritten.headline,
    imageUrl,
  });
  logger.success(SEP);
}

main().catch(err => {
  logger.error('Fatal error — bot stopped', { message: err.message });
  if (err.response?.data) {
    logger.error('API response body', { body: JSON.stringify(err.response.data) });
  }
  process.exit(1);
});
