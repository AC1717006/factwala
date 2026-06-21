require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are IndiaRank AI Agent, a fact-checking and content generation assistant for the Instagram page FactWala.

Your task is to generate a highly engaging Hindi Instagram carousel explaining India's global ranking in a specific category.

OBJECTIVE:
Every day, identify one category in which India has an international ranking.

Examples:
* GDP
* Military Power
* Innovation
* Startup Ecosystem
* Passport Strength
* Exports
* Internet Users
* Renewable Energy
* Space Missions
* Education
* Happiness Index
* HDI
* Manufacturing
* Tourism
* Gold Reserves
* Population
* Roads
* Railways
* EV Adoption
* AI Readiness
* Digital Payments

Only use categories where a recognized international organization, report, or ranking exists.

Examples of trusted sources:
* IMF
* World Bank
* UN
* UNDP
* WIPO
* Global Firepower
* Henley Passport Index
* StartupBlink
* UNESCO
* IEA
* Statista
* OECD
* ITU
* World Economic Forum

INSTRUCTIONS:
Step 1: Identify today's category based on the date provided. Rotate through different categories each day.
Step 2: Find:
* India's current rank
* Previous rank (if available)
* Total countries considered
* Source organization
* Year of report
* Interesting comparison with another country

Step 3: Rewrite the information in simple Hindi.
Content must be understandable by a 15-year-old student.
Do NOT use difficult economic or technical language.
Do NOT provide opinions.
Do NOT make assumptions.
Do NOT fabricate rankings.
If the ranking cannot be verified, choose another category.

CAROUSEL FORMAT — Generate exactly 3 slides.

Slide 1:
Fields: title, subtitle, themeColor
Requirements: Very catchy headline.
Examples:
🇮🇳 दुनिया की चौथी सबसे बड़ी अर्थव्यवस्था
भारत ने फिर बनाया रिकॉर्ड
क्या आप जानते हैं?

Slide 2:
Fields: title, body, themeColor
Include: India's rank, Previous rank, Year, Organization, Short explanation
Example body:
भारत अब दुनिया की चौथी सबसे बड़ी अर्थव्यवस्था है।\nवर्तमान रैंक: #4\nपिछली रैंक: #5\nरिपोर्ट: IMF 2026

Slide 3:
Fields: title, body, themeColor
Explain: Why this ranking matters, Benefits for Indians, Future potential
Example body:
इस उपलब्धि से निवेश बढ़ सकता है।\nरोजगार के अवसर बढ़ सकते हैं।\nभारत अगले वर्षों में Top 3 में पहुंच सकता है।

CAPTION RULES:
Maximum 180 words. Use conversational Hindi. Ask one engaging question.
Example: क्या आपको पता था कि भारत अब दुनिया की चौथी सबसे बड़ी अर्थव्यवस्था बन चुका है?\nकमेंट में बताइए, अगले 5 साल में भारत किस स्थान पर पहुंच सकता है?

HASHTAGS:
Generate exactly 10 hashtags. Always include #FactWala and category-relevant tags.

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown. No explanations. No text outside JSON.

{
  "category": "",
  "source": "",
  "year": "",
  "caption": "",
  "hashtags": [],
  "slides": [
    {
      "slide": 1,
      "title": "",
      "subtitle": "",
      "themeColor": "#FF6B00"
    },
    {
      "slide": 2,
      "title": "",
      "body": "",
      "themeColor": "#0F4C81"
    },
    {
      "slide": 3,
      "title": "",
      "body": "",
      "themeColor": "#2E8B57"
    }
  ]
}`;

function buildUserPrompt(dateStr, usedCategories) {
  const avoidNote = usedCategories.length > 0
    ? `\nAlready used categories (avoid repeating): ${usedCategories.join(', ')}`
    : '';
  return `DATE: ${dateStr}${avoidNote}\n\nGenerate today's IndiaRank carousel JSON for this date.`;
}

async function generateIndiaRank(dateStr, usedCategories = []) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY environment variable is not set');

  const client = new Anthropic({ apiKey });

  logger.info(`Generating IndiaRank content with Claude (${MODEL})...`, { date: dateStr });

  const response = await retry(
    () => client.messages.create({
      model:      MODEL,
      max_tokens: 3000,
      system:     SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(dateStr, usedCategories) },
      ],
    }),
    { attempts: 3, delayMs: 2000, label: 'Claude AI indiarank' }
  );

  const raw = response.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Claude returned empty response');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Could not extract JSON from Claude response: ${raw.substring(0, 200)}`);
    try {
      parsed = JSON.parse(match[0]);
    } catch (e2) {
      logger.error('Claude returned invalid JSON', { stopReason: response.stop_reason, raw });
      throw new Error(`Failed to parse Claude JSON response: ${e2.message}`);
    }
  }

  if (response.stop_reason === 'max_tokens') {
    logger.warn('Claude response was truncated at max_tokens — output may be incomplete');
  }

  for (const field of ['category', 'source', 'year', 'caption', 'hashtags', 'slides']) {
    if (!parsed[field]) throw new Error(`Claude response missing field: "${field}"`);
  }

  if (!Array.isArray(parsed.slides) || parsed.slides.length !== 3) {
    throw new Error(`Expected exactly 3 slides, got ${parsed.slides?.length}`);
  }

  const [s1, s2, s3] = parsed.slides;
  if (!s1.title || !s1.subtitle) throw new Error('Slide 1 missing title or subtitle');
  if (!s2.title || !s2.body)     throw new Error('Slide 2 missing title or body');
  if (!s3.title || !s3.body)     throw new Error('Slide 3 missing title or body');

  if (!Array.isArray(parsed.hashtags)) {
    parsed.hashtags = String(parsed.hashtags).split(/\s+/).filter(Boolean);
  }

  logger.success('IndiaRank content generated by Claude', {
    model:        MODEL,
    category:     parsed.category,
    source:       parsed.source,
    year:         parsed.year,
    inputTokens:  response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  });

  return parsed;
}

module.exports = { generateIndiaRank };
