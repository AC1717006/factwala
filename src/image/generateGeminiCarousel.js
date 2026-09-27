require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');
const { ensureFont, f } = require('./fontUtils');

// ── Config ────────────────────────────────────────────────────────────────────
const W = 1080;
const H = 1080;
const OUTPUT_DIR   = path.join(__dirname, '../../output');
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// How many times to regenerate one slide if the Hindi text check fails.
const MAX_ATTEMPTS = Math.max(1, parseInt(process.env.GEMINI_MAX_ATTEMPTS || '2', 10));
// Claude reads each generated slide and confirms the Hindi text is correct.
const TEXT_CHECK   = process.env.GEMINI_TEXT_CHECK !== 'false';
// Small "AI-generated visual" tag in the corner (drawn by Canvas, not Gemini).
const AI_LABEL     = process.env.GEMINI_AI_LABEL !== 'false';

// ── Prompt ────────────────────────────────────────────────────────────────────
function buildSlidePrompt(slide, totalSlides, headline) {
  const body = (Array.isArray(slide.body) ? slide.body : []).map(l => String(l).trim());

  return `Design one square (1:1) Instagram news carousel slide for the Hindi news page "FactWala Today News".

NEWS STORY (context only, do not print this line): ${headline}

TEXT TO PRINT ON THE SLIDE — copy it EXACTLY, character for character, in Devanagari. Do not translate, shorten, rephrase or add any other words:
TITLE (large, bold, top): ${slide.title}
BODY LINES (medium, bold, readable, one per line, in this order):
${body.map((l, i) => `${i + 1}. ${l}`).join('\n')}
FOOTER (small, bottom bar): left "FactWala Today News", right "${slide.slide_number}/${totalSlides}"

DESIGN RULES:
- Bold, modern Indian TV-news style. Dark, high-contrast background so the text is very easy to read on a phone.
- Suggested colours: background ${slide.background_color || '#1a1a2e'}, accent ${slide.accent_color || '#e94560'}.
- A relevant background illustration or symbolic visual for the story, kept behind the text and never covering it.
- Do NOT draw a realistic face or likeness of any real, identifiable person (politicians, celebrities, victims, accused). Use symbolic, illustrative imagery instead (buildings, objects, maps, silhouettes, icons).
- No logos of real TV channels or newspapers, no watermarks, no fake QR codes, no extra text beyond what is listed above.
- Keep all text well inside the edges (at least 60px margin).`;
}

// ── Gemini call ───────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');

  const response = await retry(
    () => axios.post(
      GEMINI_URL,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: '1:1' },
        },
      },
      {
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    ),
    { attempts: 3, delayMs: 4000, label: `Gemini image (${GEMINI_MODEL})` }
  );

  const parts = response.data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data || p.inline_data?.data);
  if (!imgPart) {
    const reason = response.data?.candidates?.[0]?.finishReason
      || response.data?.promptFeedback?.blockReason
      || 'no image part in response';
    throw new Error(`Gemini returned no image: ${reason}`);
  }
  const data = imgPart.inlineData || imgPart.inline_data;
  return Buffer.from(data.data, 'base64');
}

// ── Normalise to 1080x1080 JPEG (+ optional AI label) ─────────────────────────
async function toInstagramJpeg(rawBuffer) {
  const img    = await loadImage(rawBuffer);
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // cover-fit into the square (Gemini is asked for 1:1, this is a safety net)
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

  if (AI_LABEL) {
    await ensureFont();
    const label = 'AI-generated visual';
    ctx.font = f(20, 'bold');
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W - tw - 36, 16, tw + 20, 34);
    ctx.fillStyle    = '#FFFFFF';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W - tw - 26, 33);
  }

  return canvas.toBuffer('image/jpeg', 92);
}

// ── Hindi text check (Claude reads the generated slide) ──────────────────────
async function checkSlideText(jpegBuffer, slide) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY environment variable is not set');
  const client = new Anthropic({ apiKey });

  const expected = [slide.title, ...(Array.isArray(slide.body) ? slide.body : [])]
    .map(l => String(l).trim()).join('\n');

  const response = await retry(
    () => client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBuffer.toString('base64') } },
          { type: 'text', text:
`This image is a Hindi news slide. The text printed on it SHOULD be exactly:
---
${expected}
---
Compare the Devanagari text visible in the image with the expected text.
Ignore emoji, bullet symbols, punctuation, line breaks, the footer and any "AI-generated visual" tag.
Flag it as NOT OK if any word is misspelled, garbled, missing, duplicated, in the wrong script, or if extra words/gibberish text appear.
Reply with ONLY JSON: {"ok": true|false, "problems": "<short English description, empty if ok>"}` },
        ],
      }],
    }),
    { attempts: 3, delayMs: 2000, label: 'Claude slide text check' }
  );

  const raw = response.content?.[0]?.text?.trim() || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Text check returned no JSON: ${raw.substring(0, 120)}`);
  const result = JSON.parse(match[0]);
  return { ok: result.ok === true, problems: result.problems || '' };
}

// ── One slide: generate → normalise → verify (retry on bad text) ─────────────
async function generateGeminiSlide(slide, totalSlides, headline, outputPath) {
  const prompt = buildSlidePrompt(slide, totalSlides, headline);
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    logger.info(`Gemini: generating slide ${slide.slide_number}/${totalSlides} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    const jpeg = await toInstagramJpeg(await callGemini(prompt));

    if (TEXT_CHECK) {
      const check = await checkSlideText(jpeg, slide);
      if (!check.ok) {
        lastProblem = check.problems;
        logger.warn(`Slide ${slide.slide_number} failed Hindi text check`, { attempt, problems: check.problems });
        continue;
      }
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, jpeg);
    logger.success('Gemini slide generated', {
      path: outputPath, sizeKB: Math.round(jpeg.length / 1024), textChecked: TEXT_CHECK,
    });
    return outputPath;
  }

  throw new Error(`Slide ${slide.slide_number}: Hindi text still wrong after ${MAX_ATTEMPTS} attempts (${lastProblem})`);
}

// ── Public API — same shape as generateCarouselImages() ──────────────────────
async function generateGeminiCarouselImages(rewritten) {
  const { slides = [], headline = '' } = rewritten;
  const timestamp = Date.now();
  logger.info(`Generating ${slides.length} slides with Gemini (${GEMINI_MODEL}), text check: ${TEXT_CHECK ? 'on' : 'off'}`);

  const paths = [];
  for (const slide of slides) {
    const outputPath = path.join(OUTPUT_DIR, `gemini_slide_${slide.slide_number}_${timestamp}.jpg`);
    paths.push(await generateGeminiSlide(slide, slides.length, headline, outputPath));
  }
  return paths;
}

module.exports = { generateGeminiCarouselImages, buildSlidePrompt };
