require('dotenv').config();
const { createCanvas } = require('@napi-rs/canvas');
const fs    = require('fs');
const path  = require('path');
const logger = require('../utils/logger');
const { ensureFont, wrapLines, f } = require('./fontUtils');

// ── Dimensions (Instagram square carousel) ─────────────────────────────────────
const W = 1080;
const H = 1080;
const OUTPUT_DIR = path.join(__dirname, '../../output');

// ── Premium Astrology Theme: Dark Blue + Gold ───────────────────────────────────
const BG_TOP    = '#0a0e2a';
const BG_BOTTOM = '#101b3d';
const CARD_BG   = '#16213e';
const GOLD      = '#d4af37';
const WHITE     = '#FFFFFF';
const LIGHT     = '#c9d6f0';

const SECTIONS = [
  { key: 'career', emoji: '💼' },
  { key: 'money',  emoji: '💰' },
  { key: 'love',   emoji: '❤️' },
  { key: 'advice', emoji: '👉' },
];

// ── drawHeader ────────────────────────────────────────────────────────────────
function drawHeader(ctx, postTitle, slideTitle) {
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  ctx.fillStyle = GOLD;
  ctx.font = f(50, 'bold');
  ctx.fillText(`🔮 ${postTitle || 'आज का राशिफल'}`, W / 2, 36);

  ctx.fillStyle = WHITE;
  ctx.font = f(38, 'bold');
  ctx.fillText(slideTitle || '', W / 2, 100);
}

// ── drawCard ──────────────────────────────────────────────────────────────────
function drawCard(ctx, rashi, x, y, cardW, cardH) {
  // Card background
  ctx.fillStyle = CARD_BG;
  roundRect(ctx, x, y, cardW, cardH, 18);
  ctx.fill();

  // Gold border
  ctx.lineWidth = 3;
  ctx.strokeStyle = GOLD;
  roundRect(ctx, x, y, cardW, cardH, 18);
  ctx.stroke();

  const pad = 26;
  let cy = y + 22;

  // Symbol + name
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = GOLD;
  ctx.font = f(54, 'bold');
  ctx.fillText(rashi.symbol || '', x + cardW / 2, cy);

  ctx.fillStyle = WHITE;
  ctx.font = f(30, 'bold');
  ctx.fillText(rashi.name || '', x + cardW / 2, cy + 60);

  cy += 60 + 44;

  // Sections
  const maxWidth = cardW - pad * 2;
  const fontSize = 21;
  const lineHeight = 27;
  ctx.textAlign = 'left';
  ctx.font = f(fontSize);

  for (const { key, emoji } of SECTIONS) {
    const text = String(rashi[key] || '').trim();
    const lines = wrapLines(ctx, `${emoji} ${text}`, maxWidth);
    for (const line of lines) {
      ctx.fillStyle = LIGHT;
      ctx.fillText(line, x + pad, cy);
      cy += lineHeight;
    }
    cy += 6;
  }
}

// ── roundRect ─────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ── drawBrandingBar ───────────────────────────────────────────────────────────
function drawBrandingBar(ctx, slideNumber, totalSlides) {
  const barY = H - 90;

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, barY, W, 3);

  const midY = barY + (H - barY) / 2 + 1;

  ctx.fillStyle    = WHITE;
  ctx.font         = f(28, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('FactWala Astrology', 40, midY);

  ctx.fillStyle = GOLD;
  ctx.font      = f(28, 'bold');
  ctx.textAlign = 'right';
  ctx.fillText(`${slideNumber}/${totalSlides}`, W - 40, midY);
}

// ── generateSlide ─────────────────────────────────────────────────────────────
async function generateSlide(rashifal, slide, totalSlides, outputPath) {
  await ensureFont();

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, BG_TOP);
  gradient.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, rashifal.post_title, slide.title);

  // 2x2 card grid
  const margin = 36;
  const gap    = 24;
  const top    = 170;
  const bottom = H - 90;
  const cardW  = (W - margin * 2 - gap) / 2;
  const cardH  = (bottom - top - gap) / 2;

  const positions = [
    [margin,               top],
    [margin + cardW + gap, top],
    [margin,               top + cardH + gap],
    [margin + cardW + gap, top + cardH + gap],
  ];

  slide.rashis.forEach((rashi, i) => {
    const [x, y] = positions[i];
    drawCard(ctx, rashi, x, y, cardW, cardH);
  });

  drawBrandingBar(ctx, slide.slide, totalSlides);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const buffer = canvas.toBuffer('image/jpeg', 95);
  fs.writeFileSync(outputPath, buffer);
  logger.success('Rashifal slide generated', { path: outputPath, sizeKB: Math.round(buffer.length / 1024) });
  return outputPath;
}

// ── generateRashifalCarouselImages ──────────────────────────────────────────────
// Generates one 1080x1080 JPEG per slide. Returns an array of file paths in order.
async function generateRashifalCarouselImages(rashifal) {
  const { slides = [] } = rashifal;
  const timestamp = Date.now();

  const paths = [];
  for (const slide of slides) {
    const outputPath = path.join(OUTPUT_DIR, `rashifal_slide_${slide.slide}_${timestamp}.jpg`);
    await generateSlide(rashifal, slide, slides.length, outputPath);
    paths.push(outputPath);
  }
  return paths;
}

module.exports = { generateRashifalCarouselImages };
