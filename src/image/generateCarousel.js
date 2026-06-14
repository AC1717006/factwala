require('dotenv').config();
const { createCanvas } = require('@napi-rs/canvas');
const fs    = require('fs');
const path  = require('path');
const logger = require('../utils/logger');
const { ensureFont, wrapLines, f } = require('./fontUtils');

// ── Dimensions (Instagram square carousel) ─────────────────────────────────────
const W = 1080;
const H = 1080;

const OUTPUT_DIR  = path.join(__dirname, '../../output');

const DEFAULT_BG     = '#1a1a2e';
const DEFAULT_ACCENT = '#e94560';
const WHITE          = '#FFFFFF';

// ── drawTitle ─────────────────────────────────────────────────────────────────
function drawTitle(ctx, title, accentColor) {
  ctx.fillStyle    = accentColor;
  ctx.font         = f(60, 'bold');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  const lines = wrapLines(ctx, title || '', W - 120).slice(0, 2);
  const lineHeight = 74;
  const startY = 90;

  lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineHeight));

  return startY + lines.length * lineHeight;
}

// ── drawBody ──────────────────────────────────────────────────────────────────
// body is an array of lines. Lines starting with "•" are left-aligned bullets;
// otherwise text is centered. The whole block is vertically centered between
// titleBottom and the bottom branding bar.
function drawBody(ctx, body, titleBottom, contentBottom) {
  const hasBullets = body.some(line => String(line).trim().startsWith('•'));

  // Pick a font size that comfortably fits the number of lines.
  let fontSize;
  if (body.length <= 2)      fontSize = 56;
  else if (body.length <= 3) fontSize = 50;
  else if (body.length <= 4) fontSize = 42;
  else                        fontSize = 36;

  const lineHeight = Math.round(fontSize * 1.5);
  const maxWidth   = hasBullets ? W - 180 : W - 160;

  ctx.font = f(fontSize, 'bold');

  // Pre-wrap every line to know the total block height.
  const wrapped = [];
  for (const rawLine of body) {
    const isBullet = String(rawLine).trim().startsWith('•');
    const text = String(rawLine).trim().replace(/^•\s*/, '');
    const lines = wrapLines(ctx, text, isBullet ? maxWidth - 50 : maxWidth);
    wrapped.push({ isBullet, lines });
  }

  const totalLines = wrapped.reduce((sum, w) => sum + w.lines.length, 0);
  const blockHeight = totalLines * lineHeight;
  const available = contentBottom - titleBottom;
  let y = titleBottom + Math.max(0, (available - blockHeight) / 2);

  ctx.fillStyle    = WHITE;
  ctx.textBaseline = 'top';

  for (const { isBullet, lines } of wrapped) {
    for (let i = 0; i < lines.length; i++) {
      if (isBullet) {
        ctx.textAlign = 'left';
        if (i === 0) {
          ctx.beginPath();
          ctx.arc(70, y + fontSize / 2, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillText(lines[i], 100, y);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(lines[i], W / 2, y);
      }
      y += lineHeight;
    }
  }
}

// ── drawBrandingBar ───────────────────────────────────────────────────────────
function drawBrandingBar(ctx, slideNumber, totalSlides, accentColor) {
  const barY = H - 90;

  // Thin accent separator line
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, barY, W, 3);

  const midY = barY + (H - barY) / 2 + 1;

  // "FactWala Today News" — left
  ctx.fillStyle    = WHITE;
  ctx.font         = f(28, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('FactWala Today News', 40, midY);

  // "n/3" — right
  ctx.fillStyle = accentColor;
  ctx.font      = f(28, 'bold');
  ctx.textAlign = 'right';
  ctx.fillText(`${slideNumber}/${totalSlides}`, W - 40, midY);
}

// ── generateSlide ─────────────────────────────────────────────────────────────
async function generateSlide(slide, totalSlides, outputPath) {
  await ensureFont();

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const bg     = slide.background_color || DEFAULT_BG;
  const accent = slide.accent_color || DEFAULT_ACCENT;

  // Full-bleed background — no borders/boxes
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const titleBottom = drawTitle(ctx, slide.title, accent);
  drawBody(ctx, Array.isArray(slide.body) ? slide.body : [], titleBottom, H - 110);
  drawBrandingBar(ctx, slide.slide_number, totalSlides, accent);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const buffer = canvas.toBuffer('image/jpeg', 95);
  fs.writeFileSync(outputPath, buffer);
  logger.success('Carousel slide generated', { path: outputPath, sizeKB: Math.round(buffer.length / 1024) });
  return outputPath;
}

// ── generateCarouselImages ───────────────────────────────────────────────────
// Generates one 1080x1080 JPEG per slide. Returns an array of file paths in order.
async function generateCarouselImages(rewritten) {
  const { slides = [] } = rewritten;
  const timestamp = Date.now();

  const paths = [];
  for (const slide of slides) {
    const outputPath = path.join(OUTPUT_DIR, `slide_${slide.slide_number}_${timestamp}.jpg`);
    await generateSlide(slide, slides.length, outputPath);
    paths.push(outputPath);
  }
  return paths;
}

module.exports = { generateCarouselImages };
