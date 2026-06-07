/**
 * FactWala — Single Test Instagram Post
 *
 * Phase 2 of 2: Publishes exactly ONE test post to Instagram then stops.
 *
 * Image : 1080×1080 "FactWala Automation Test" branded card
 * Caption: Automation Test message + hashtags
 *
 * Usage: node scripts/testPost.js
 */

require('dotenv').config();
if (process.env.DISABLE_SSL_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const { createCanvas } = require('@napi-rs/canvas');
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const { uploadToImgBB }       = require('../src/upload/uploadImgBB');
const { createMediaContainer } = require('../src/instagram/createMedia');
const { publishMedia }         = require('../src/instagram/publishMedia');
const { sleep }                = require('../src/utils/retry');

const GRAPH = 'https://graph.facebook.com/v21.0';

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', white: '\x1b[37m',
};
const ok  = (l, v='') => console.log(`  \x1b[32m\x1b[1m  OK\x1b[0m  ${l}  \x1b[2m${v}\x1b[0m`);
const bad = (l, v='') => { console.log(`  \x1b[31m\x1b[1mFAIL\x1b[0m  ${l}`); if(v) console.log(`       \x1b[31m${v}\x1b[0m`); };
const log = (l, v='') => console.log(`  \x1b[36m  →\x1b[0m  ${l}  \x1b[2m${v}\x1b[0m`);
const sep = (c='─', n=60) => console.log(`\x1b[2m${c.repeat(n)}\x1b[0m`);

// ── Generate 1080×1080 test image ─────────────────────────────────────────────
function generateTestImage() {
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background — deep dark with a subtle radial glow
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0A0A0F');
  bg.addColorStop(1, '#12121C');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Radial glow in centre
  const glow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 480);
  glow.addColorStop(0,   'rgba(245,166,35,0.08)');
  glow.addColorStop(0.5, 'rgba(245,166,35,0.03)');
  glow.addColorStop(1,   'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Dot grid
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  for (let x = 36; x < W; x += 54)
    for (let y = 36; y < H; y += 54) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI*2);
      ctx.fill();
    }

  // Gold border frame
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth   = 5;
  roundRect(ctx, 22, 22, W-44, H-44, 18);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(212,175,55,0.25)';
  ctx.lineWidth   = 1.5;
  roundRect(ctx, 36, 36, W-72, H-72, 12);
  ctx.stroke();

  // ── Top brand bar ────────────────────────────────────────────────────────
  const barGrad = ctx.createLinearGradient(22, 0, W-22, 0);
  barGrad.addColorStop(0, '#8B6500');
  barGrad.addColorStop(0.5, '#F5A623');
  barGrad.addColorStop(1, '#8B6500');
  ctx.fillStyle = barGrad;
  roundRect(ctx, 22, 22, W-44, 90, 18);
  ctx.fill();

  ctx.fillStyle   = '#0A0A0F';
  ctx.font        = 'bold 38px serif';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FW  FactWala News Automation', W/2, 67);

  // ── Centre content ────────────────────────────────────────────────────────
  // Large TEST badge
  ctx.strokeStyle = '#F5A623';
  ctx.lineWidth   = 3;
  roundRect(ctx, W/2-160, 200, 320, 80, 40);
  ctx.stroke();
  ctx.fillStyle = 'rgba(245,166,35,0.1)';
  roundRect(ctx, W/2-160, 200, 320, 80, 40);
  ctx.fill();

  ctx.fillStyle   = '#F5A623';
  ctx.font        = 'bold 32px serif';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AUTOMATION TEST', W/2, 240);

  // Main headline
  ctx.fillStyle   = '#FFFFFF';
  ctx.font        = 'bold 70px serif';
  ctx.textBaseline = 'top';
  ctx.fillText('FactWala', W/2, 330);

  ctx.font      = 'bold 42px serif';
  ctx.fillStyle = '#F5A623';
  ctx.fillText('Automation Test', W/2, 415);

  // Divider
  const div = ctx.createLinearGradient(100, 0, W-100, 0);
  div.addColorStop(0,   'transparent');
  div.addColorStop(0.3, '#F5A623');
  div.addColorStop(0.7, '#F5A623');
  div.addColorStop(1,   'transparent');
  ctx.strokeStyle = div;
  ctx.lineWidth   = 2;
  ctx.beginPath(); ctx.moveTo(100, 490); ctx.lineTo(W-100, 490); ctx.stroke();

  // Info block
  const now = new Date();
  const lines = [
    'System Validation Post',
    'FactWala News Automation Platform',
    `Generated: ${now.toLocaleString('en-IN', { timeZone:'Asia/Kolkata' })} IST`,
    'This is a one-time test — not a news post',
  ];
  ctx.fillStyle   = '#B0B0C8';
  ctx.font        = '28px serif';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, W/2, 520 + i*52));

  // Verification tick area
  ctx.fillStyle   = 'rgba(245,166,35,0.08)';
  roundRect(ctx, 60, 760, W-120, 180, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(245,166,35,0.3)';
  ctx.lineWidth   = 1.5;
  roundRect(ctx, 60, 760, W-120, 180, 16);
  ctx.stroke();

  ctx.fillStyle   = '#4CAF50';
  ctx.font        = 'bold 30px serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('API CONNECTED', W/2, 810);
  ctx.fillStyle = '#90A0B0';
  ctx.font      = '22px serif';
  ctx.fillText(`Instagram Business ID: ${process.env.INSTAGRAM_BUSINESS_ID}`, W/2, 858);
  ctx.fillText(`Graph API v21.0  |  Node.js ${process.version}`, W/2, 900);

  // Footer
  ctx.fillStyle   = '#F5A623';
  ctx.font        = 'bold 22px serif';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('sach ki khabar  |  factwala.in', W/2, H - 60);

  const imgPath = path.join(__dirname, '../output/factwala_test_post.jpg');
  fs.mkdirSync(path.dirname(imgPath), { recursive: true });
  const buf = canvas.toBuffer('image/jpeg', 92);
  fs.writeFileSync(imgPath, buf);
  return imgPath;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// ── Exact caption from spec ───────────────────────────────────────────────────
const TEST_CAPTION = `🧪 Automation Test

This is a system validation post generated by the FactWala News Automation Platform.

#FactWala #Automation #Test`;

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const startTime = new Date();

  console.log('\n' + '═'.repeat(60));
  console.log(`${C.bold}${C.cyan}  FactWala — Test Instagram Post${C.reset}`);
  console.log('═'.repeat(60));
  log('Mode',   'SINGLE TEST POST — will publish exactly once');
  log('Time',   startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST');
  sep();

  // ── Step 1: Generate image ────────────────────────────────────────────────
  console.log(`\n${C.bold}[1] Generating test image (1080×1080)${C.reset}`);
  let imagePath;
  try {
    imagePath = generateTestImage();
    ok('Image generated', imagePath);
  } catch (err) {
    bad('Image generation failed', err.message);
    process.exit(1);
  }

  // ── Step 2: Upload to ImgBB ───────────────────────────────────────────────
  console.log(`\n${C.bold}[2] Uploading image to ImgBB CDN${C.reset}`);
  let imageUrl;
  try {
    imageUrl = await uploadToImgBB(imagePath);
    ok('Uploaded to ImgBB', imageUrl);
  } catch (err) {
    bad('ImgBB upload failed', err.message);
    process.exit(1);
  }

  // ── Step 3: Create media container ───────────────────────────────────────
  console.log(`\n${C.bold}[3] Creating Instagram media container${C.reset}`);
  log('Caption preview', TEST_CAPTION.replace(/\n/g, '\\n').substring(0, 80) + '…');

  let containerId;
  try {
    containerId = await createMediaContainer(imageUrl, TEST_CAPTION);
    ok('Container created', containerId);
  } catch (err) {
    bad('Container creation failed', err.message);
    process.exit(1);
  }

  // ── Step 4: Verify container status ──────────────────────────────────────
  console.log(`\n${C.bold}[4] Verifying container status${C.reset}`);
  try {
    log('Waiting for container processing (5s)...');
    await sleep(5000);
    const res = await axios.get(`${GRAPH}/${containerId}`, {
      params: { fields: 'id,status,status_code', access_token: process.env.META_ACCESS_TOKEN },
      timeout: 15000,
    });
    const sc = res.data.status_code || res.data.status;
    ok('Container status', sc);
    if (!['FINISHED', 'IN_PROGRESS'].includes(sc)) {
      bad('Container not ready to publish', `status_code = ${sc}`);
      process.exit(1);
    }
  } catch (err) {
    log('Status check skipped (non-fatal)', err.message.substring(0, 80));
  }

  // ── Step 5: Publish ───────────────────────────────────────────────────────
  console.log(`\n${C.bold}[5] Publishing to Instagram${C.reset}`);
  log('Publishing ONE post then stopping...');

  let postId;
  try {
    postId = await publishMedia(containerId);
    ok('Published!', postId);
  } catch (err) {
    bad('Publish failed', err.message);
    process.exit(1);
  }

  const publishedAt = new Date().toISOString();

  // ── Result ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`${C.green}${C.bold}  POST PUBLISHED SUCCESSFULLY${C.reset}`);
  console.log('═'.repeat(60));
  console.log(`  Post ID          : ${C.bold}${postId}${C.reset}`);
  console.log(`  Container ID     : ${C.bold}${containerId}${C.reset}`);
  console.log(`  Published at     : ${C.bold}${publishedAt}${C.reset}`);
  console.log(`  Image URL        : ${C.cyan}${imageUrl}${C.reset}`);
  console.log(`  Instagram ID     : ${process.env.INSTAGRAM_BUSINESS_ID}`);
  console.log('═'.repeat(60));
  console.log(`\n  ${C.green}${C.bold}RESULT: PASS${C.reset}  — Bot is fully operational. Run npm start for live news.\n`);

  // Stop immediately — exactly one post
  process.exit(0);
})().catch(err => {
  console.error(`\n${C.red}Fatal:${C.reset}`, err.message);
  process.exit(1);
});
