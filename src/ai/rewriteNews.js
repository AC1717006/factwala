require('dotenv').config();
const Groq   = require('groq-sdk');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Tu FactWala ka Hindi news writer hai. Teri job hai raw news article ko Instagram ke liye rewrite karna.

OUTPUT FORMAT (strict JSON only, no extra text):
{
  "headline": "< 10 words mein catchy Hindi headline >",
  "summary": "< 3-4 lines mein simple Hindi mein news summary, aam aadmi samjhe >",
  "caption": "< Instagram caption — headline + 2 line summary + call to action >",
  "hashtags": "< 15-20 relevant Hindi + English hashtags >"
}

RULES:
1. Sirf verified facts likho — koi speculation nahi
2. Sensational ya misleading headline mat banao (Meta policy)
3. Hindi mein likho — Devanagari script preferred
4. Caption 2200 characters se kam ho
5. Hashtags mein #FactWala #SachKiKhabar hamesha include karo
6. Koi adult, violent, ya hateful content nahi
7. Agar news unclear ho toh summary mein "Zyada jaankari ka intezaar hai" likho`;

function buildUserPrompt(article) {
  return `Neeche diye gaye news article ko Instagram ke liye rewrite karo:

Title: ${article.title}
Description: ${article.description || ''}
Content: ${(article.content || '').substring(0, 600)}
Source: ${article.source?.name || 'Unknown'}

Important: "caption" field mein headline + summary + hashtags sab kuch include karo
(yahi field directly Instagram post mein jaata hai).
Sirf valid JSON return karo, koi extra text nahi.`;
}

async function rewriteNews(article) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set');

  const groq = new Groq({ apiKey });

  logger.info(`Sending article to Groq AI (${MODEL})...`);

  const completion = await retry(
    () => groq.chat.completions.create({
      model:           MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(article) },
      ],
      temperature:     0.65,
      max_tokens:      1024,
      response_format: { type: 'json_object' },
    }),
    { attempts: 3, delayMs: 2000, label: 'Groq AI rewrite' }
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Groq returned empty response');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Groq sometimes wraps JSON in ```json ... ``` despite json_object mode
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Could not extract JSON from Groq response: ${raw.substring(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  const required = ['headline', 'summary', 'caption', 'hashtags'];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Groq response missing field: "${field}"`);
  }

  // hashtags may be a string (new format) or array (legacy) — normalise to string
  if (Array.isArray(parsed.hashtags)) {
    parsed.hashtags = parsed.hashtags.join(' ');
  }

  logger.success('Article rewritten by Groq AI', {
    model:    MODEL,
    headline: parsed.headline,
    tokens:   completion.usage?.total_tokens,
  });

  return parsed;
}

module.exports = { rewriteNews };
