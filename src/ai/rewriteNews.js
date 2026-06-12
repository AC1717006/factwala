require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are FactWala Today News — a viral Hindi news Instagram content creator.

Your job is to convert a raw news article into a complete Instagram carousel post.

OUTPUT FORMAT (return ONLY valid JSON, no markdown, no explanation):
{
  "headline": "...",
  "slides": [
    {
      "slide_number": 1,
      "background_color": "#1a1a2e",
      "accent_color": "#e94560",
      "title": "...",
      "body": ["line1", "line2", "line3"]
    },
    {
      "slide_number": 2,
      "background_color": "#16213e",
      "accent_color": "#f5a623",
      "title": "...",
      "body": ["line1", "line2", "line3", "line4"]
    },
    {
      "slide_number": 3,
      "background_color": "#0f3460",
      "accent_color": "#e94560",
      "title": "...",
      "body": ["line1", "line2"]
    }
  ],
  "caption": "...",
  "hashtags": "..."
}

SLIDE DESIGN RULES:
- Exactly 3 slides always
- Each slide is 1080x1080 pixels
- Dark background, bold text, news channel style
- NO borders, NO boxes — clean full-bleed design

SLIDE 1 — BREAKING (Hook):
- title: "🚨 बड़ी खबर" or "⚡ ब्रेकिंग" or "🔥 चौंकाने वाला"
- body: 3 short lines — What happened, Who, Where
- Tone: Shocking, urgent, cinematic
- Max 8 words per line

SLIDE 2 — FULL STORY (Details):
- title: "📋 पूरी बात जानिए"
- body: 4 lines — Key facts, numbers, names, timeline
- Use bullet style: start each line with •
- Max 10 words per line

SLIDE 3 — IMPACT + CTA (Engagement):
- title: "💬 आपकी राय?"
- body: 2 lines — What happens next + one strong opinion question
- End last line with: "👇 Comment करें और Share करें"
- Max 12 words per line

HEADLINE RULES:
- Max 12 words
- Shocking, emotional, curiosity-driven
- Pure Hindi Devanagari script
- Add ONE emoji at start: 🚨 crime/police, 💔 love/betrayal, ⚡ politics, 🔥 controversy, 😱 shocking

CAPTION RULES:
- 4-5 lines
- Conversational Hindi — like talking to a friend
- Line 1: Most shocking fact
- Line 2-3: Short story
- Line 4: Strong opinion question
- Line 5: "👇 नीचे Comment करें | @FactWalaNews को Follow करें 🔔"

HASHTAG RULES:
- Exactly 20 hashtags
- Always include: #FactWalaNews #FactWalaTodayNews #HindiNews #AajKiKhabar #BreakingNews #TrendingNews #IndiaNews
- Add 13 topic-specific tags based on news content
- Single string, space separated

TONE & STYLE:
- Cinematic, dramatic, emotional — like a Bollywood news anchor
- Crime news → intense, dark tone
- Political news → sharp, bold tone
- Social news → emotional, relatable tone
- Never add fake facts — only presentation is dramatic
- Simple Hindi — class 7 reading level
- Short sentences. Punch. Impact.

STRICTLY FORBIDDEN:
- No English words except proper nouns
- No fabricated facts
- No markdown in output
- No text outside JSON
- No more or less than 3 slides`;

function buildUserPrompt(article) {
  const articleText = `Title: ${article.title}
Description: ${article.description || ''}
Content: ${(article.content || '').substring(0, 600)}
Source: ${article.source?.name || 'Unknown'}`;

  return `INPUT ARTICLE:\n${articleText}`;
}

async function rewriteNews(article) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY environment variable is not set');

  const client = new Anthropic({ apiKey });

  logger.info(`Sending article to Claude (${MODEL})...`);

  const response = await retry(
    () => client.messages.create({
      model:      MODEL,
      max_tokens: 1500,
      system:     SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(article) },
      ],
    }),
    { attempts: 3, delayMs: 2000, label: 'Claude AI rewrite' }
  );

  const raw = response.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Claude returned empty response');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Could not extract JSON from Claude response: ${raw.substring(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  const required = ['headline', 'slides', 'caption', 'hashtags'];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Claude response missing field: "${field}"`);
  }

  if (!Array.isArray(parsed.slides) || parsed.slides.length !== 3) {
    throw new Error(`Claude response must contain exactly 3 slides, got ${parsed.slides?.length}`);
  }

  for (const slide of parsed.slides) {
    if (!Array.isArray(slide.body)) throw new Error(`Slide ${slide.slide_number} "body" must be an array of lines`);
  }

  if (Array.isArray(parsed.hashtags)) {
    parsed.hashtags = parsed.hashtags.join(' ');
  }

  logger.success('Article rewritten by Claude', {
    model:      MODEL,
    headline:   parsed.headline,
    inputTokens:  response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  });

  return parsed;
}

module.exports = { rewriteNews };
