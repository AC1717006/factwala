require('dotenv').config();
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const logger = require('../utils/logger');

// ── Dimensions ─────────────────────────────────────────────────────────────────
const W = 1080;
const H = 1920;

// Section layout — heights must sum to H (1920)
// Original spec: 120+300+380+280+280+180+120 = 1660 → extra 260 distributed to s3/s4/s5
const L = {
  header:    { y: 0,    h: 120 },  // 120
  headline:  { y: 120,  h: 300 },  // 300
  matter:    { y: 420,  h: 480 },  // 380 + 100
  factcheck: { y: 900,  h: 360 },  // 280 + 80
  reaction:  { y: 1260, h: 360 },  // 280 + 80
  caption:   { y: 1620, h: 180 },  // 180
  footer:    { y: 1800, h: 120 },  // 120  → total 1920
};

// ── Font ───────────────────────────────────────────────────────────────────────
const FONT_DIR    = path.join(__dirname, '../../fonts');
const FONT_PATH   = path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf');
const FONT_URL    = 'https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf';
const FONT_FAMILY = 'HindiFont';
const OUTPUT_DIR  = path.join(__dirname, '../../output');

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  white:   '#FFFFFF',
  black:   '#000000',
  red:     '#CC0000',
  navy:    '#111827',
  green:   '#1a7a3c',
  amber:   '#E67E00',
  amberBg: '#FFF8E7',
  gold:    '#FFD700',
  bodyBg:  '#F8F8F8',
  dark:    '#222222',
  mid:     '#333333',
  gray:    '#888888',
};

let fontReady = false;

// ── Font helpers ───────────────────────────────────────────────────────────────
const f  = (sz, wt = 'normal') => `${wt} ${sz}px '${FONT_FAMILY}', sans-serif`;
const fi = (sz)                 => `italic normal ${sz}px '${FONT_FAMILY}', sans-serif`;

// ── downloadFile ───────────────────────────────────────────────────────────────
// Follows HTTP redirects; skips download if file already exists.
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

// ── wrapText ──────────────────────────────────────────────────────────────────
/**
 * Draw word-wrapped text. ctx.font / fillStyle / textAlign / textBaseline must
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

// ── drawSectionHeader ─────────────────────────────────────────────────────────
// Fills a full-width band and draws left-aligned bold white text at x=50.
// Caller adds any icon/circle at x=22-28 before or after.
function drawSectionHeader(ctx, y, height, bgColor, text, textColor) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, y, W, height);
  ctx.fillStyle    = textColor;
  ctx.font         = f(28, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 52, y + height / 2);
}

// ── splitSentences ────────────────────────────────────────────────────────────
function splitSentences(text) {
  const parts = [];
  for (const chunk of String(text).split('।')) {
    for (const sub of chunk.split(/\.\s+/)) {
      const s = sub.trim().replace(/[।.]$/, '').trim();
      if (s.length > 5) parts.push(s);
    }
  }
  return parts;
}

// ── generateImage ─────────────────────────────────────────────────────────────
async function generateImage(newsData, outputPath) {
  const {
    headline = '',
    summary  = '',
    hashtags = '',
    caption  = '',
  } = newsData;

  await ensureFont();

  const canvas    = createCanvas(W, H);
  const ctx       = canvas.getContext('2d');
  const sentences = splitSentences(summary);

  // ── [1] TOP HEADER  y=0, h=120 ──────────────────────────────────────────────
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, L.header.y, W, L.header.h);

  const hMidY = L.header.y + L.header.h / 2;

  // Left badge: "बड़ी खबर" — red pill, gold text
  ctx.font = f(22, 'bold');
  const lbW = ctx.measureText('बड़ी खबर').width + 30;
  const lbH = 46;
  const lbY = hMidY - lbH / 2;

  ctx.fillStyle = C.red;
  roundRect(ctx, 20, lbY, lbW, lbH, lbH / 2);
  ctx.fill();

  ctx.fillStyle    = C.gold;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('बड़ी खबर', 20 + lbW / 2, hMidY);

  // Right badge: "BREAKING" — red, white text
  ctx.font = f(20, 'bold');
  const rbW = ctx.measureText('BREAKING').width + 26;
  const rbH = 46;
  const rbX = W - rbW - 20;
  const rbY = hMidY - rbH / 2;

  ctx.fillStyle = C.red;
  roundRect(ctx, rbX, rbY, rbW, rbH, 8);
  ctx.fill();

  ctx.fillStyle    = C.white;
  ctx.font         = f(20, 'bold');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BREAKING', rbX + rbW / 2, hMidY);

  // Center: FW red circle + "FactWala" — horizontally centred as a group
  ctx.font = f(34, 'bold');
  const fwTxtW = ctx.measureText('FactWala').width;
  const circD  = 48;
  const fwGap  = 12;
  const grpW   = circD + fwGap + fwTxtW;
  const grpX   = W / 2 - grpW / 2;
  const fwCX   = grpX + circD / 2;

  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(fwCX, hMidY, circD / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle    = C.white;
  ctx.font         = f(18, 'bold');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FW', fwCX, hMidY);

  ctx.fillStyle    = C.white;
  ctx.font         = f(34, 'bold');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('FactWala', grpX + circD + fwGap, hMidY);

  // ── [2] MAIN HEADLINE  y=120, h=300 ─────────────────────────────────────────
  ctx.fillStyle = C.red;
  ctx.fillRect(0, L.headline.y, W, L.headline.h);

  // Large bold headline — centered, max 3 lines
  ctx.fillStyle    = C.white;
  ctx.font         = f(52, 'bold');
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  let hlY = L.headline.y + 22;
  hlY = wrapText(ctx, headline, W / 2, hlY, W - 80, 62, 3);

  // Thin divider
  hlY += 14;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(80, hlY, W - 160, 2);
  hlY += 16;

  // Sub-headline: first summary sentence, italic, smaller
  if (sentences[0]) {
    ctx.fillStyle    = 'rgba(255,255,255,0.88)';
    ctx.font         = fi(26);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    wrapText(ctx, sentences[0], W / 2, hlY, W - 100, 36, 2);
  }

  // ── [3] क्या है मामला?  y=420, h=480 ─────────────────────────────────────────
  // Header bar (60px)
  drawSectionHeader(ctx, L.matter.y, 60, C.navy, 'क्या है मामला?', C.white);

  // Red circle bullet in header
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(28, L.matter.y + 30, 9, 0, Math.PI * 2);
  ctx.fill();

  // Content area background
  ctx.fillStyle = C.bodyBg;
  ctx.fillRect(0, L.matter.y + 60, W, L.matter.h - 60);

  // Up to 4 bullet points from first 4 sentences
  const matterItems  = sentences.slice(0, 4);
  const matterBottom = L.matter.y + L.matter.h - 20;
  let   bulletY      = L.matter.y + 60 + 28;

  for (const sentence of matterItems) {
    if (bulletY > matterBottom - 44) break;

    // Red filled circle
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(44, bulletY + 14, 7, 0, Math.PI * 2);
    ctx.fill();

    // Sentence text
    ctx.fillStyle    = C.dark;
    ctx.font         = f(26, 'normal');
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    const linesLeft = Math.max(1, Math.floor((matterBottom - bulletY) / 44));
    bulletY = wrapText(ctx, sentence, 68, bulletY, W - 108, 44, Math.min(2, linesLeft));
    bulletY += 16;
  }

  // ── [4] फैक्ट चेक  y=900, h=360 ──────────────────────────────────────────────
  // Header bar (55px)
  drawSectionHeader(ctx, L.factcheck.y, 55, C.green, 'फैक्ट चेक', C.white);

  // Diamond accent in header (drawn as rotated square)
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.save();
  ctx.translate(28, L.factcheck.y + 27);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();

  // Content area background
  ctx.fillStyle = C.white;
  ctx.fillRect(0, L.factcheck.y + 55, W, L.factcheck.h - 55);

  // 2 fact points (sentences 2-3 if available)
  const len = sentences.length;
  const factItems = len >= 4 ? sentences.slice(2, 4)
                  : len >= 2 ? sentences.slice(-2)
                  : sentences.slice(0, 1);
  const factBottom = L.factcheck.y + L.factcheck.h - 20;
  let   factY      = L.factcheck.y + 55 + 32;

  for (const fact of factItems) {
    if (factY > factBottom - 38) break;

    // Green checkmark path
    const ckX = 38, ckY = factY + 4, ckSz = 22;
    ctx.strokeStyle = C.green;
    ctx.lineWidth   = 3.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(ckX, ckY + ckSz * 0.52);
    ctx.lineTo(ckX + ckSz * 0.38, ckY + ckSz * 0.9);
    ctx.lineTo(ckX + ckSz, ckY + ckSz * 0.05);
    ctx.stroke();

    ctx.fillStyle    = C.green;
    ctx.font         = f(24, 'normal');
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    const factLinesLeft = Math.max(1, Math.floor((factBottom - factY) / 38));
    factY = wrapText(ctx, fact, 76, factY, W - 110, 38, Math.min(2, factLinesLeft));
    factY += 22;
  }

  // Amber warning if not enough facts
  if (factItems.length < 2 && factY + 60 < factBottom) {
    ctx.fillStyle = '#FFF3CD';
    roundRect(ctx, 28, factY + 10, W - 56, 54, 8);
    ctx.fill();
    ctx.strokeStyle = '#DDAA00';
    ctx.lineWidth   = 1;
    roundRect(ctx, 28, factY + 10, W - 56, 54, 8);
    ctx.stroke();
    ctx.fillStyle    = '#7A5500';
    ctx.font         = f(22, 'normal');
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('[!]  अभी तक कोई आधिकारिक पुष्टि नहीं', 48, factY + 10 + 27);
  }

  // ── [5] लोगों की प्रतिक्रिया  y=1260, h=360 ────────────────────────────────────
  // Header bar (55px)
  drawSectionHeader(ctx, L.reaction.y, 55, C.amber, 'लोगों की प्रतिक्रिया', C.white);

  // Triangle accent in header
  const trHX = 24, trHY = L.reaction.y + 16, trHH = 22;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(trHX, trHY);
  ctx.lineTo(trHX, trHY + trHH);
  ctx.lineTo(trHX + trHH * 0.75, trHY + trHH / 2);
  ctx.closePath();
  ctx.fill();

  // Content area background
  ctx.fillStyle = C.amberBg;
  ctx.fillRect(0, L.reaction.y + 55, W, L.reaction.h - 55);

  const genericReactions = [
    'इस खबर पर सोशल मीडिया में जमकर चर्चा है',
    'पाठकों ने इस मामले पर अपनी कड़ी प्रतिक्रिया दी',
    'लोग इस खबर को तेजी से शेयर कर रहे हैं',
  ];
  const reactionPool = len >= 5 ? sentences.slice(-3)
                     : len >= 3 ? [sentences[len - 1], ...genericReactions.slice(0, 2)]
                     : genericReactions;

  const reactBottom = L.reaction.y + L.reaction.h - 20;
  let   reactY      = L.reaction.y + 55 + 28;

  for (let i = 0; i < 3; i++) {
    const text = reactionPool[i] || genericReactions[i];
    if (!text || reactY > reactBottom - 38) break;

    // Amber triangle bullet
    const trX = 34, trY = reactY + 6, trH = 18;
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.moveTo(trX, trY);
    ctx.lineTo(trX, trY + trH);
    ctx.lineTo(trX + trH * 0.75, trY + trH / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle    = C.mid;
    ctx.font         = f(24, 'normal');
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    const reactLinesLeft = Math.max(1, Math.floor((reactBottom - reactY) / 38));
    reactY = wrapText(ctx, text, 68, reactY, W - 108, 38, Math.min(2, reactLinesLeft));
    reactY += 20;
  }

  // ── [6] CAPTION BAR  y=1620, h=180 ───────────────────────────────────────────
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, L.caption.y, W, L.caption.h);

  // "CAPTION" pill label
  ctx.font = f(17, 'bold');
  const cpW = ctx.measureText('CAPTION').width + 22;
  const cpH = 30;
  const cpX = 22;
  const cpY = L.caption.y + 14;

  ctx.fillStyle = C.red;
  roundRect(ctx, cpX, cpY, cpW, cpH, cpH / 2);
  ctx.fill();

  ctx.fillStyle    = C.white;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CAPTION', cpX + cpW / 2, cpY + cpH / 2);

  // Caption text (max 3 lines)
  const captionText = caption || summary.substring(0, 200) || '';
  ctx.fillStyle    = 'rgba(255,255,255,0.9)';
  ctx.font         = f(22, 'normal');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  wrapText(ctx, captionText, 22, L.caption.y + 56, W - 44, 32, 3);

  // "SHARE >" button — bottom right
  ctx.font = f(19, 'bold');
  const shareLabel = 'SHARE  >';
  const shW = ctx.measureText(shareLabel).width + 28;
  const shH = 38;
  const shX = W - shW - 22;
  const shY = L.caption.y + L.caption.h - shH - 14;

  ctx.fillStyle = C.red;
  roundRect(ctx, shX, shY, shW, shH, 6);
  ctx.fill();

  ctx.fillStyle    = C.white;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(shareLabel, shX + shW / 2, shY + shH / 2);

  // ── [7] FOOTER  y=1800, h=120 ─────────────────────────────────────────────────
  ctx.fillStyle = C.black;
  ctx.fillRect(0, L.footer.y, W, L.footer.h);

  // Red top accent
  ctx.fillStyle = C.red;
  ctx.fillRect(0, L.footer.y, W, 3);

  const ftMidY = L.footer.y + L.footer.h / 2;

  // First 3 hashtags — golden, left
  const hashArr  = String(hashtags).split(/\s+/).filter(h => h.startsWith('#')).slice(0, 3);
  const hashLine = hashArr.length ? hashArr.join(' ') : '#FactWala #SachKiKhabar';

  ctx.fillStyle    = C.gold;
  ctx.font         = f(20, 'normal');
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(hashLine, 28, ftMidY);

  // "factwala.in" — center, white bold
  ctx.fillStyle = C.white;
  ctx.font      = f(22, 'bold');
  ctx.textAlign = 'center';
  ctx.fillText('factwala.in', W / 2, ftMidY);

  // Date — right, gray
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  ctx.fillStyle = C.gray;
  ctx.font      = f(20, 'normal');
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - 28, ftMidY);

  // ── Save ───────────────────────────────────────────────────────────────────────
  const savePath = outputPath || path.join(OUTPUT_DIR, `news_${Date.now()}.jpg`);
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  const buffer = canvas.toBuffer('image/jpeg', 95);
  fs.writeFileSync(savePath, buffer);
  logger.success('News image generated', { path: savePath, sizeKB: Math.round(buffer.length / 1024) });
  return savePath;
}

// Backwards-compatible wrapper — index.js calls generateNewsImage(headline, summary)
async function generateNewsImage(headline, summary) {
  return generateImage({ headline, summary, hashtags: '#FactWala #SachKiKhabar' });
}

module.exports = { generateImage, generateNewsImage };
