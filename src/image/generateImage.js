require('dotenv').config();
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const logger = require('../utils/logger');

// ── Dimensions (Instagram square carousel) ─────────────────────────────────────
const W = 1080;
const H = 1080;

// ── Font ───────────────────────────────────────────────────────────────────────
const FONT_DIR    = path.join(__dirname, '../../fonts');
const FONT_PATH   = path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf');
const FONT_URL    = 'https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf';
const FONT_FAMILY = 'HindiFont';
const OUTPUT_DIR  = path.join(__dirname, '../../output');

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  white:      '#FFFFFF',
  black:      '#000000',
  red:        '#CC0000',
  darkRed:    '#990000',
  yellow:     '#FFD700',
  navy:       '#1a1a2e',
  lightGray:  '#F0F0F0',
  blueGray:   '#e8f4f8',
  blue:       '#1565C0',
  green:      '#2d6a2d',
  lightGreen: '#f0f7f0',
  orange:     '#e6a817',
  lightYellow:'#fdf8e8',
  warnBg:     '#fff3cd',
  warnBorder: '#DDAA00',
  gray:       '#888888',
  dark:       '#222222',
};

let fontReady = false;

const f = (sz, wt = 'normal') => `${wt} ${sz}px '${FONT_FAMILY}', sans-serif`;

// ── downloadFile ───────────────────────────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve(dest); return; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tlsOpts = { rejectUnauthorized: process.env.DISABLE_SSL_VERIFY !== 'true' };
    function doGet(target) {
      const proto = target.startsWith('https') ? https : http;
      proto.get(target, tlsOpts, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, target).toString();
          doGet(next);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed HTTP ${res.statusCode}: ${target}`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(dest)));
        out.on('error',  (e) => { fs.unlink(dest, () => {}); reject(e); });
      }).on('error', (e) => { try { fs.unlinkSync(dest); } catch { /**/ } reject(e); });
    }
    doGet(url);
  });
}

// ── ensureFont ─────────────────────────────────────────────────────────────────
async function ensureFont() {
  if (fontReady) return;
  try {
    await downloadFile(FONT_URL, FONT_PATH);
    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
    GlobalFonts.loadSystemFonts();
    fontReady = true;
    logger.info('HindiFont registered', { path: FONT_PATH });
  } catch (err) {
    logger.warn('Hindi font unavailable', { error: err.message });
  }
}

// ── roundRect ─────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── wrapText ──────────────────────────────────────────────────────────────────
/**
 * Draws word-wrapped text. ctx.font / fillStyle / textAlign / textBaseline must
 * be set by the caller before invoking.
 * @returns {number} Y position immediately after the last drawn line.
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const words   = String(text).split(' ');
  const lines   = [];
  let   current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = trial;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  let curY = y;
  for (const line of lines) {
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  }
  return curY;
}

// ── drawBrandingBar ───────────────────────────────────────────────────────────
function drawBrandingBar(ctx) {
  const barH = 80;
  const barY = H - barH;

  ctx.fillStyle = C.darkRed;
  ctx.fillRect(0, barY, W, barH);

  ctx.fillStyle    = C.white;
  ctx.font         = f(30, 'bold');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Fact Wala Today News', W / 2, barY + barH / 2);

  return barY;
}

// ── drawDots ──────────────────────────────────────────────────────────────────
// Draws the 3 slide-indicator dots just above the branding bar.
function drawDots(ctx, activeIndex, brandingBarY) {
  const dotR    = 8;
  const gap     = 28;
  const totalW  = gap * 2;
  const startX  = W / 2 - totalW / 2;
  const y       = brandingBarY - 24;

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i === activeIndex ? C.red : '#D0D0D0';
    ctx.fill();
  }
}

// ── SLIDE 1 — Breaking News Hero ────────────────────────────────────────────────
function drawSlide1(ctx, slide1 = {}, category) {
  const {
    headline      = '',
    subHeadline   = '',
    bullet        = '',
    location      = '',
    breakingLabel = 'BREAKING NEWS',
  } = slide1;

  // Background
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, H);

  // Top bar — red, 80px
  ctx.fillStyle = C.red;
  ctx.fillRect(0, 0, W, 80);

  ctx.fillStyle    = C.white;
  ctx.font         = f(32, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(breakingLabel, 30, 40);

  ctx.fillStyle    = C.yellow;
  ctx.font         = f(32, 'bold');
  ctx.textAlign    = 'right';
  ctx.fillText('ताज़ा खबर', W - 30, 40);

  // Category tag — left, below top bar
  if (category) {
    ctx.font = f(22, 'bold');
    const tagLabel = `# ${category}`;
    const tagW = ctx.measureText(tagLabel).width + 36;
    const tagH = 44;
    ctx.fillStyle = C.lightGray;
    roundRect(ctx, 30, 100, tagW, tagH, tagH / 2);
    ctx.fill();
    ctx.fillStyle    = C.dark;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagLabel, 30 + 18, 100 + tagH / 2);
  }

  // Location badge — top right corner
  if (location) {
    ctx.font = f(24, 'bold');
    const label = `📍 ${location}`;
    const padX  = 22;
    const boxH  = 46;
    const boxW  = ctx.measureText(label).width + padX * 2;
    const boxX  = W - boxW - 30;
    const boxY  = 100;

    ctx.strokeStyle = C.red;
    ctx.lineWidth   = 2;
    roundRect(ctx, boxX, boxY, boxW, boxH, boxH / 2);
    ctx.stroke();

    ctx.fillStyle    = C.red;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, boxX + boxW / 2, boxY + boxH / 2);
  }

  // Main headline — large bold, left aligned, max 3 lines
  ctx.fillStyle    = C.black;
  ctx.font         = f(76, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  let y = wrapText(ctx, headline, 30, 190, W - 60, 90, 3);

  // Sub-headline box — red left border, light gray bg, bullet point
  y += 40;
  const boxPadding = 30;
  ctx.font = f(34, 'normal');

  // Pre-measure box height by wrapping into a temp count (max 4 lines)
  const maxBoxWidth = W - 60 - 6 - boxPadding * 2 - 40;
  const tmpLines = [];
  {
    const words = String(subHeadline || bullet || '').split(' ');
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (ctx.measureText(trial).width > maxBoxWidth && current) {
        tmpLines.push(current);
        current = word;
        if (tmpLines.length >= 4) break;
      } else {
        current = trial;
      }
    }
    if (current && tmpLines.length < 4) tmpLines.push(current);
  }
  const lineHeight = 46;
  const boxH = boxPadding * 2 + Math.max(1, tmpLines.length) * lineHeight;

  // Light gray background
  ctx.fillStyle = C.lightGray;
  ctx.fillRect(30, y, W - 60, boxH);

  // Red left border
  ctx.fillStyle = C.red;
  ctx.fillRect(30, y, 6, boxH);

  // Bullet dot + text
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(30 + 6 + 26, y + boxPadding + 14, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle    = C.dark;
  ctx.font         = f(34, 'normal');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  wrapText(ctx, subHeadline || bullet, 30 + 6 + 50, y + boxPadding, maxBoxWidth, lineHeight, 4);

  // Branding + dots
  const barY = drawBrandingBar(ctx);
  drawDots(ctx, 0, barY);
}

// ── SLIDE 2 — Details ───────────────────────────────────────────────────────────
function drawSlide2(ctx, slide2 = {}) {
  const {
    sectionTitle = 'क्या है मामला?',
    bullet1 = '',
    bullet2 = '',
    bullet3 = '',
    infoBox = '',
    infoBoxLabel = 'प्रारंभिक जानकारी:',
  } = slide2;

  // Background
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, H);

  // Top header bar — dark navy, 70px
  const headerH = 70;
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, W, headerH);

  // Red bullet dot
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(50, headerH / 2, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle    = C.white;
  ctx.font         = f(32, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(sectionTitle, 80, headerH / 2);

  // Body — 3 bullet points with red circle bullets
  const bullets = [bullet1, bullet2, bullet3].filter(Boolean);
  let y = headerH + 60;
  const maxWidth = W - 60 - 50;

  ctx.font = f(36, 'normal');
  for (const item of bullets) {
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(50, y + 18, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle    = C.dark;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    y = wrapText(ctx, item, 80, y, maxWidth, 50, 3);
    y += 40;
  }

  // Info box — bottom half, blue-gray bg with blue left border
  const boxY = Math.max(y + 30, 560);
  const boxH = H - 80 - boxY - 40;

  ctx.fillStyle = C.blueGray;
  ctx.fillRect(30, boxY, W - 60, boxH);

  ctx.fillStyle = C.blue;
  ctx.fillRect(30, boxY, 6, boxH);

  const padX = 36;
  ctx.fillStyle    = C.blue;
  ctx.font         = f(32, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  let infoY = boxY + 34;
  ctx.fillText(infoBoxLabel, 30 + padX, infoY);
  infoY += 56;

  ctx.fillStyle = C.dark;
  ctx.font      = f(32, 'normal');
  wrapText(ctx, infoBox, 30 + padX, infoY, W - 60 - padX * 2, 46, 6);

  // Branding + dots
  const barY = drawBrandingBar(ctx);
  drawDots(ctx, 1, barY);
}

// ── SLIDE 3 — Fact Check + Reaction ─────────────────────────────────────────────
function drawSlide3(ctx, slide3 = {}, hashtags = '') {
  const {
    factCheckTitle = '✔ फैक्ट चेक',
    factCheck1 = '',
    factCheck2 = '',
    reactionTitle = '▶ लोगों की प्रतिक्रिया',
    reaction1 = '',
    reaction2 = '',
    noteText = '',
  } = slide3;

  // Background
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, H);

  let y = 0;

  // ── Section 1: फैक्ट चेक — green header ─────────────────────────────────────
  const sec1HeaderH = 60;
  ctx.fillStyle = C.green;
  ctx.fillRect(0, y, W, sec1HeaderH);

  ctx.fillStyle    = C.white;
  ctx.font         = f(30, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(factCheckTitle, 30, y + sec1HeaderH / 2);
  y += sec1HeaderH;

  const factItems = [factCheck1, factCheck2].filter(Boolean);
  const sec1BodyH = 60 + factItems.length * 80;
  ctx.fillStyle = C.lightGreen;
  ctx.fillRect(0, y, W, sec1BodyH);

  let factY = y + 28;
  ctx.font = f(32, 'normal');
  for (const item of factItems) {
    ctx.fillStyle    = C.green;
    ctx.font         = f(32, 'bold');
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('✔', 30, factY);

    ctx.fillStyle = C.dark;
    ctx.font      = f(30, 'normal');
    wrapText(ctx, item, 70, factY, W - 60 - 40, 42, 2);
    factY += 80;
  }
  y += sec1BodyH;

  // ── Section 2: लोगों की प्रतिक्रिया — orange header ──────────────────────────
  const sec2HeaderH = 60;
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, y, W, sec2HeaderH);

  ctx.fillStyle    = C.white;
  ctx.font         = f(30, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(reactionTitle, 30, y + sec2HeaderH / 2);
  y += sec2HeaderH;

  const reactionItems = [reaction1, reaction2].filter(Boolean);
  const sec2BodyH = 60 + reactionItems.length * 80;
  ctx.fillStyle = C.lightYellow;
  ctx.fillRect(0, y, W, sec2BodyH);

  let reactY = y + 28;
  for (const item of reactionItems) {
    ctx.fillStyle    = C.orange;
    ctx.font         = f(32, 'bold');
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('▶', 30, reactY);

    ctx.fillStyle = C.dark;
    ctx.font      = f(30, 'normal');
    wrapText(ctx, item, 70, reactY, W - 60 - 40, 42, 2);
    reactY += 80;
  }
  y += sec2BodyH;

  // ── Warning box ───────────────────────────────────────────────────────────
  y += 30;
  const warnPadding = 26;
  ctx.font = f(28, 'normal');
  const warnMaxWidth = W - 60 - warnPadding * 2 - 50;
  const warnLines = [];
  {
    const words = String(noteText).split(' ');
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (ctx.measureText(trial).width > warnMaxWidth && current) {
        warnLines.push(current);
        current = word;
        if (warnLines.length >= 3) break;
      } else {
        current = trial;
      }
    }
    if (current && warnLines.length < 3) warnLines.push(current);
  }
  const warnLineHeight = 38;
  const warnH = warnPadding * 2 + Math.max(1, warnLines.length) * warnLineHeight;

  ctx.fillStyle = C.warnBg;
  roundRect(ctx, 30, y, W - 60, warnH, 10);
  ctx.fill();
  ctx.strokeStyle = C.warnBorder;
  ctx.lineWidth   = 1.5;
  roundRect(ctx, 30, y, W - 60, warnH, 10);
  ctx.stroke();

  ctx.fillStyle    = '#7A5500';
  ctx.font         = f(28, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('⚠️ नोट:', 30 + warnPadding, y + warnPadding);

  ctx.font = f(28, 'normal');
  wrapText(ctx, noteText, 30 + warnPadding + 110, y + warnPadding, warnMaxWidth - 60, warnLineHeight, 3);
  y += warnH;

  // ── Hashtags row ──────────────────────────────────────────────────────────
  y += 24;
  ctx.fillStyle    = C.gray;
  ctx.font         = f(22, 'normal');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  const hashtagLine = String(hashtags).split(/\s+/).filter(Boolean).join(', ');
  wrapText(ctx, hashtagLine, 30, y, W - 60, 30, 2);

  // Branding + dots
  const barY = drawBrandingBar(ctx);
  drawDots(ctx, 2, barY);
}

// ── generateCarouselImages ───────────────────────────────────────────────────
/**
 * Generates 3 branded 1080x1080 PNG slides for "Fact Wala Today News".
 * @param {object} data      - { slide1, slide2, slide3, hashtags, category }
 * @param {string|number} articleId - unique identifier used in output filenames
 * @returns {Promise<string[]>} array of 3 file paths (slide_{articleId}_1.png ... _3.png)
 */
async function generateCarouselImages(data = {}, articleId) {
  await ensureFont();

  const { slide1 = {}, slide2 = {}, slide3 = {}, hashtags = '', category = '' } = data;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const paths = [];
  const slideDrawFns = [
    (ctx) => drawSlide1(ctx, slide1, category),
    (ctx) => drawSlide2(ctx, slide2),
    (ctx) => drawSlide3(ctx, slide3, hashtags),
  ];

  for (let i = 0; i < 3; i++) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
    slideDrawFns[i](ctx);

    const outputPath = path.join(OUTPUT_DIR, `slide_${articleId}_${i + 1}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    logger.success('Carousel slide generated', { path: outputPath, sizeKB: Math.round(buffer.length / 1024) });
    paths.push(outputPath);
  }

  return paths;
}

module.exports = { generateCarouselImages };
