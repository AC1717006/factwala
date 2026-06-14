require('dotenv').config();
const { GlobalFonts } = require('@napi-rs/canvas');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const logger = require('../utils/logger');

const FONT_DIR    = path.join(__dirname, '../../fonts');
const FONT_PATH   = path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf');
const FONT_URL    = 'https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf';
const FONT_FAMILY = 'HindiFont';

let fontReady = false;

const f = (sz, wt = 'normal') => `${wt} ${sz}px '${FONT_FAMILY}', sans-serif`;

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

// Returns an array of word-wrapped lines (does not draw).
function wrapLines(ctx, text, maxWidth) {
  const words   = String(text).split(' ');
  const lines   = [];
  let   current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

module.exports = { ensureFont, wrapLines, f, FONT_FAMILY };
