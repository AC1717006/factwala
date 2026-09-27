require('dotenv').config();

// Allow disabling SSL verification for corporate proxy / VPN environments.
// Set DISABLE_SSL_VERIFY=true in .env ONLY for local development — never production.
if (process.env.DISABLE_SSL_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const { fetchLatestNews, saveToDB }   = require('./src/news/fetchNews');
const { rewriteNews }                 = require('./src/ai/rewriteNews');
const { generateCarouselImages }      = require('./src/image/generateCarousel');
const { generateGeminiCarouselImages } = require('./src/image/generateGeminiCarousel');
const { uploadPublicImage, stripSignature }               = require('./src/upload/uploadImage');
const { createCarouselItem,
        createCarouselContainer }      = require('./src/instagram/createMedia');
const { publishMedia }                = require('./src/instagram/publishMedia');
const { sleep }                       = require('./src/utils/retry');
const logger                          = require('./src/utils/logger');

const TEST_MODE = process.argv.includes('--test');
const IMAGE_ENGINE = (process.env.IMAGE_ENGINE || 'canvas').toLowerCase();
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

  // ── 2. Rewrite with Claude AI (3-slide carousel) ─────────────────────────
  const rewritten = await rewriteNews(article);

  // ── 3. Generate FactWala carousel slides (1080x1080 x3) ──────────────────
  // IMAGE_ENGINE=gemini → Gemini designs the slides; if Gemini fails or the
  // Hindi text check keeps failing, fall back to the Canvas slides so the
  // post still goes out. IMAGE_ENGINE=canvas (default) → Canvas only.
  let imagePaths;
  if (IMAGE_ENGINE === 'gemini') {
    try {
      imagePaths = await generateGeminiCarouselImages(rewritten);
    } catch (err) {
      if (process.env.GEMINI_STRICT === 'true') throw err;
      logger.warn('Gemini slides failed — falling back to Canvas slides', { error: err.message });
      imagePaths = await generateCarouselImages(rewritten);
    }
  } else {
    imagePaths = await generateCarouselImages(rewritten);
  }

  // ── 4. Preview ───────────────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('CAPTION PREVIEW');
  console.log(SEP);
  console.log(rewritten.caption);
  console.log(SEP);
  console.log(`Slides: ${imagePaths.join(', ')}`);
  console.log(`${SEP}\n`);

  // ── 5. Upload slides to image host — ImgBB or S3 (Instagram needs public URLs) ──────────────
  const imageUrls = [];
  for (const imagePath of imagePaths) {
    imageUrls.push(await uploadPublicImage(imagePath));
  }

  // ── TEST MODE: stop here (before Instagram) ──────────────────────────────
  if (TEST_MODE) {
    logger.success('TEST PASSED — all steps up to image upload succeeded.');
    console.log(`\nPublic image URLs (S3 links expire after S3_URL_EXPIRES):\n${imageUrls.join('\n')}`);
    logger.info('Run  npm start  to enable full Instagram publishing.');
    process.exit(0);
  }

  // ── 6. Create carousel item containers ───────────────────────────────────
  const childContainerIds = [];
  for (const imageUrl of imageUrls) {
    childContainerIds.push(await createCarouselItem(imageUrl));
  }

  // ── 7. Create carousel parent container ──────────────────────────────────
  await sleep(5000); // give Instagram time to process the carousel items
  const containerId = await createCarouselContainer(childContainerIds, rewritten.caption);

  // ── 8. Publish to Instagram ──────────────────────────────────────────────
  const postId = await publishMedia(containerId);

  // ── 9. Save to local database ────────────────────────────────────────────
  saveToDB({
    title:             article.title,
    source:            article.source?.name || 'GNews',
    article_url:       article.url,
    published_post_id: postId,
    image_urls:        imageUrls.map(stripSignature),
    timestamp:         new Date().toISOString(),
    status:            'published',
  });

  logger.success(SEP);
  logger.success('Carousel post published to Instagram!', {
    postId,
    headline: rewritten.headline,
    slides:   imageUrls.length,
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
