require('dotenv').config();
const { createCanvas } = require('@napi-rs/canvas');
const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger');
const { ensureFont, wrapLines, f } = require('./fontUtils');

const W = 1080;
const H = 1080;
const OUTPUT_DIR = path.join(__dirname, '../../output');

const DARK_BASE = '#0d0f1a';
const WHITE     = '#FFFFFF';
const OFF_WHITE = '#e8eaf0';

// ── helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function drawBackground(ctx, themeColor) {
  const { r, g, b } = hexToRgb(themeColor);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.28)`);
  grad.addColorStop(0.45, DARK_BASE);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0.18)`);
  ctx.fillStyle = DARK_BASE;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawAccentLine(ctx, y, themeColor) {
  ctx.fillStyle = themeColor;
  ctx.fillRect(60, y, W - 120, 3);
}

function drawBrandingBar(ctx, slideNumber, totalSlides, themeColor, category) {
  const barY = H - 88;
  ctx.fillStyle = themeColor;
  ctx.fillRect(0, barY, W, 3);

  const midY = barY + (H - barY) / 2 + 1;

  ctx.fillStyle    = WHITE;
  ctx.font         = f(26, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🇮🇳 FactWala India', 40, midY);

  if (category) {
    ctx.fillStyle = themeColor;
    ctx.font      = f(22);
    ctx.textAlign = 'center';
    ctx.fillText(category, W / 2, midY);
  }

  ctx.fillStyle = WHITE;
  ctx.font      = f(26, 'bold');
  ctx.textAlign = 'right';
  ctx.fillText(`${slideNumber}/${totalSlides}`, W - 40, midY);
}

// ── Slide 1: Hook (title + subtitle) ─────────────────────────────────────────

async function drawSlide1(ctx, slide, category) {
  const themeColor = slide.themeColor || '#FF6B00';

  drawBackground(ctx, themeColor);

  // Top category pill
  const pillY = 72;
  ctx.fillStyle    = themeColor;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.font         = f(28, 'bold');
  const pillText = `📊 ${category || 'India Ranking'}`;
  const pillW    = ctx.measureText(pillText).width + 48;
  roundRect(ctx, W / 2 - pillW / 2, pillY, pillW, 50, 25);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillText(pillText, W / 2, pillY + 11);

  // Accent line below pill
  drawAccentLine(ctx, 150, themeColor);

  // Title — large, centered
  ctx.fillStyle    = WHITE;
  ctx.font         = f(72, 'bold');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  const titleLines = wrapLines(ctx, slide.title || '', W - 120).slice(0, 3);
  const titleLineH = 88;
  let titleY = 185;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, titleY);
    titleY += titleLineH;
  }

  // Accent line after title
  drawAccentLine(ctx, titleY + 24, themeColor);

  // Subtitle — smaller, themed color
  ctx.fillStyle    = OFF_WHITE;
  ctx.font         = f(44);
  const subtitleLines = wrapLines(ctx, slide.subtitle || '', W - 160).slice(0, 3);
  let subtitleY = titleY + 60;
  const subtitleLineH = 58;
  for (const line of subtitleLines) {
    ctx.fillText(line, W / 2, subtitleY);
    subtitleY += subtitleLineH;
  }
}

// ── Slide 2 & 3: Info (title + body string) ──────────────────────────────────

async function drawInfoSlide(ctx, slide, category) {
  const themeColor = slide.themeColor || '#0F4C81';

  drawBackground(ctx, themeColor);

  // Category chip at top-left
  ctx.fillStyle    = themeColor;
  ctx.font         = f(24, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  const chip = `📊 ${category || 'India Ranking'}`;
  const chipW = ctx.measureText(chip).width + 36;
  roundRect(ctx, 60, 52, chipW, 44, 22);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillText(chip, 78, 63);

  // Title
  ctx.fillStyle    = themeColor;
  ctx.font         = f(60, 'bold');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  const titleLines = wrapLines(ctx, slide.title || '', W - 120).slice(0, 2);
  let titleY = 126;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, titleY);
    titleY += 72;
  }

  drawAccentLine(ctx, titleY + 10, themeColor);

  // Body — split by \n, each line auto-wrapped
  const rawLines = String(slide.body || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const maxLines = 7;
  const bodyStart = titleY + 46;
  const bodyEnd   = H - 110;
  const available = bodyEnd - bodyStart;

  const fontSize   = rawLines.length <= 3 ? 46 : rawLines.length <= 5 ? 38 : 32;
  const lineHeight = Math.round(fontSize * 1.55);

  ctx.font         = f(fontSize);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';

  const allWrapped = [];
  for (const raw of rawLines) {
    const wrapped = wrapLines(ctx, raw, W - 160);
    allWrapped.push(...wrapped);
    if (allWrapped.length >= maxLines) break;
  }

  const totalH  = allWrapped.length * lineHeight;
  let bodyY = bodyStart + Math.max(0, (available - totalH) / 2);

  for (const line of allWrapped.slice(0, maxLines)) {
    const isRank = /^(वर्तमान|पिछली|रैंक|रिपोर्ट|Rank|#\d)/.test(line);
    ctx.fillStyle = isRank ? themeColor : OFF_WHITE;
    ctx.fillText(line, 80, bodyY);
    bodyY += lineHeight;
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

// ── generateSlide ─────────────────────────────────────────────────────────────

async function generateSlide(content, slide, outputPath) {
  await ensureFont();

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  if (slide.slide === 1) {
    await drawSlide1(ctx, slide, content.category);
  } else {
    await drawInfoSlide(ctx, slide, content.category);
  }

  drawBrandingBar(ctx, slide.slide, content.slides.length, slide.themeColor || '#FF6B00', null);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const buffer = canvas.toBuffer('image/jpeg', 95);
  fs.writeFileSync(outputPath, buffer);
  logger.success('IndiaRank slide generated', { path: outputPath, sizeKB: Math.round(buffer.length / 1024) });
  return outputPath;
}

// ── generateIndiaRankCarouselImages ───────────────────────────────────────────

async function generateIndiaRankCarouselImages(content) {
  const { slides = [] } = content;
  const timestamp = Date.now();
  const paths = [];
  for (const slide of slides) {
    const outputPath = path.join(OUTPUT_DIR, `indiarank_slide_${slide.slide}_${timestamp}.jpg`);
    await generateSlide(content, slide, outputPath);
    paths.push(outputPath);
  }
  return paths;
}

module.exports = { generateIndiaRankCarouselImages };
