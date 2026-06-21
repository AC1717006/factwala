# FactWala — Instagram Hindi News & Rashifal Bot

> Automatically fetches top Hindi news → rewrites into a **3-slide carousel** with **Claude AI** → generates branded **1080x1080 slide images** → publishes a **carousel post** to **Instagram** — twice daily via GitHub Actions.
> A second independent bot posts a daily **Hindi Rashifal (astrology)** carousel every morning.

---

## Architecture

### News Bot (`index.js`)

```
GNews API (Hindi/India)
     ↓  top 10 articles, pick best
Claude AI — claude-sonnet-4-6
     ↓  headline + 3 slides (title/body/colors) + hashtags + caption
Canvas  — 3x 1080×1080 FactWala branded slide images
     ↓  saved locally
ImgBB CDN
     ↓  3x public HTTPS URLs
Instagram Graph API v21.0
     ↓  Step 1: create carousel item containers (x3)
     ↓  Step 2: create carousel parent container
     ↓  Step 3: publish carousel post
src/storage/postedNews.json — duplicate prevention
```

### Rashifal Bot (`rashifal.js`)

```
Claude AI — claude-sonnet-4-6
     ↓  12 rashis across 3 slides (career/money/love/advice + caption)
Canvas — 3x 1080×1080 FactWala Astrology slides (Dark Blue + Gold theme)
ImgBB CDN → 3x public HTTPS URLs
Instagram Graph API → carousel post
src/storage/postedRashifal.json — one post per day
```

### IndiaRank Bot (`indiarank.js`)

```
Claude AI — claude-sonnet-4-6
     ↓  picks one India global ranking category per day (GDP, Military, EV, etc.)
     ↓  verifies rank from trusted source (IMF / World Bank / UN / WEF etc.)
     ↓  writes 3-slide Hindi carousel (hook → facts → impact) + caption + hashtags
Canvas — 3x 1080×1080 FactWala India slides (Saffron / Navy / Green theme)
ImgBB CDN → 3x public HTTPS URLs
Instagram Graph API → carousel post
src/storage/postedIndiaRank.json — one post per day, tracks past categories
```

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env — add all API keys

# 3. Test news bot (no Instagram posting)
npm test

# 4. Go live — news bot
npm start

# 5. Test rashifal bot (no Instagram posting)
npm run rashifal:test

# 6. Go live — rashifal bot
npm run rashifal

# 7. Test indiarank bot (no Instagram posting)
npm run indiarank:test

# 8. Go live — indiarank bot
npm run indiarank
```

---

## Utility Scripts

```bash
# Validate Instagram/Meta credentials & permissions (no posting)
node scripts/validate.js

# Publish a single test post to Instagram
node scripts/testPost.js
```

---

## GitHub Actions Schedule

| Workflow | Schedule | Trigger file |
|---|---|---|
| News Bot | **8:00 AM IST** & **8:00 PM IST** daily | `.github/workflows/autopost.yml` |
| Rashifal Bot | **6:00 AM IST** daily | `.github/workflows/rashifal.yml` |
| IndiaRank Bot | **12:00 PM IST** daily | `.github/workflows/indiarank.yml` |

Both workflows support manual dispatch with `production` or `test` mode from the **Actions** tab.

---

## Required API Keys

| Variable | Free? | Get it at |
|---|---|---|
| `News_API` | Yes (100 req/day) | [gnews.io](https://gnews.io) |
| `CLAUDE_API_KEY` | Paid | [console.anthropic.com](https://console.anthropic.com) |
| `IMGBB_API_KEY` | Yes | [imgbb.com/api](https://imgbb.com/api) |
| `META_ACCESS_TOKEN` | Yes | [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer/) |
| `INSTAGRAM_BUSINESS_ID` | — | Meta Business Suite |
| `FACEBOOK_PAGE_ID` | — | Meta Business Suite |
| `META_APP_ID` | — | [developers.facebook.com](https://developers.facebook.com) |
| `META_APP_SECRET` | — | Meta Developer Portal |
| `GROQ_API_KEY` | Yes (legacy, unused) | [console.groq.com](https://console.groq.com) |

> `CLAUDE_MODEL` (optional) overrides the default `claude-sonnet-4-6` model.

---

## Project Structure

```
instagram-news-bot/
├── index.js                              # News bot entry point (--test flag)
├── rashifal.js                           # Rashifal bot entry point (--test flag)
├── indiarank.js                          # IndiaRank bot entry point (--test flag)
├── package.json
├── .env.example
├── .gitignore
│
├── scripts/
│   ├── validate.js                       # Validate Instagram/Meta credentials
│   └── testPost.js                       # Publish a single test post
│
├── src/
│   ├── news/
│   │   └── fetchNews.js                  # GNews API — top Hindi news
│   ├── ai/
│   │   ├── rewriteNews.js                # Claude AI — 3-slide news carousel
│   │   ├── rewriteRashifal.js            # Claude AI — 12-rashi astrology content
│   │   └── rewriteIndiaRank.js           # Claude AI — India global ranking content
│   ├── image/
│   │   ├── generateCarousel.js           # Canvas — 3x 1080×1080 news slides
│   │   ├── generateRashifalCarousel.js   # Canvas — 3x 1080×1080 astrology slides
│   │   ├── generateIndiaRankCarousel.js  # Canvas — 3x 1080×1080 India rank slides
│   │   ├── generateImage.js              # (legacy) single 1080×1920 image
│   │   ├── uploadImage.js                # Image upload helper
│   │   └── fontUtils.js                  # Font loading & text wrap utilities
│   ├── upload/
│   │   └── uploadImgBB.js                # ImgBB — upload & get public URL
│   ├── instagram/
│   │   ├── createMedia.js                # Graph API — create container(s) / carousel
│   │   └── publishMedia.js               # Graph API — publish post
│   ├── storage/
│   │   ├── postedNews.json               # News duplicate prevention DB
│   │   ├── postedRashifal.json           # Rashifal duplicate prevention DB (1/day)
│   │   └── postedIndiaRank.json          # IndiaRank DB — date + category history
│   └── utils/
│       ├── logger.js                     # Structured logging → logs/activity.log
│       └── retry.js                      # Exponential back-off retry helper
│
├── output/                               # Generated images (auto-created)
├── logs/
│   └── activity.log                      # All log entries
│
└── .github/
    └── workflows/
        ├── autopost.yml                  # News bot — 8 AM & 8 PM IST cron
        ├── rashifal.yml                  # Rashifal bot — 6 AM IST cron
        └── indiarank.yml                 # IndiaRank bot — 12 PM IST cron
```

---

## GitHub Actions Setup

1. Push repo to GitHub
2. **Settings → Secrets → Actions → New repository secret**
3. Add all keys from `.env.example`:

| GitHub Secret Name | Maps to env var |
|---|---|
| `INSTAGRAM_BUSINESS_ID` | `INSTAGRAM_BUSINESS_ID` |
| `FACEBOOK_PAGE_ID` | `FACEBOOK_PAGE_ID` |
| `META_APP_ID` | `META_APP_ID` |
| `META_APP_SECRET` | `META_APP_SECRET` |
| `META_ACCESS_TOKEN` | `META_ACCESS_TOKEN` |
| `NEWS_API` | `News_API` |
| `CLAUDE_API_KEY` | `CLAUDE_API_KEY` |
| `GROQ_API_KEY` | `GROQ_API_KEY` |
| `IMGBB_API_KEY` | `IMGBB_API_KEY` |

4. News bot runs at **8:00 AM IST** and **8:00 PM IST** every day
5. Rashifal bot runs at **6:00 AM IST** every day
6. IndiaRank bot runs at **12:00 PM IST** every day
7. Manual trigger: Actions tab → Run workflow → choose `production` or `test`

---

## Test Mode

### News Bot

```bash
npm test
```

Runs the full news pipeline **except** the Instagram publish step:
- Fetches latest Hindi news article
- Rewrites it into a 3-slide carousel with Claude AI
- Generates & saves 3x 1080x1080 slide images to `output/`
- Uploads all 3 images to ImgBB
- Prints the Instagram caption to console

### Rashifal Bot

```bash
npm run rashifal:test
```

Runs the full rashifal pipeline **except** the Instagram publish step:
- Generates 12-rashi content via Claude AI
- Generates 3x 1080x1080 astrology slide images to `output/`
- Uploads all 3 images to ImgBB

### IndiaRank Bot

```bash
npm run indiarank:test
```

Runs the full IndiaRank pipeline **except** the Instagram publish step:
- Claude AI picks a global ranking category for today (rotates, avoids repeats)
- Verifies India's rank from a trusted source (IMF, World Bank, UN, WEF, etc.)
- Generates 3-slide Hindi carousel: hook → facts → impact
- Generates 3x 1080x1080 India-themed slide images to `output/`
- Uploads all 3 images to ImgBB
- Prints caption + hashtags to console

When all steps pass, run `npm start` or `npm run rashifal` or `npm run indiarank` to go live.

---

## Duplicate Prevention

- **News:** Every article URL is saved to `src/storage/postedNews.json` after posting. The bot skips any URL already in this file.
- **Rashifal:** Today's date is saved to `src/storage/postedRashifal.json` — only one post per calendar day.
- **IndiaRank:** Today's date + category is saved to `src/storage/postedIndiaRank.json`. The bot posts once per day and passes the last 30 used categories to Claude so it rotates through different topics automatically.

Both JSON files are committed back to the repo by GitHub Actions after each successful run.

---

## Logging

All activity is written to `logs/activity.log` with timestamps and structured JSON data. In GitHub Actions, logs are uploaded as downloadable artifacts (retained 30 days).

---

## Error Handling

Every external API call uses exponential back-off retry (3 attempts, 2-6s delay).

| Error | Cause |
|---|---|
| Instagram `190` | Access token expired — regenerate |
| Instagram `9007` | Not a Business/Creator account |
| Claude `401 invalid x-api-key` | Check `CLAUDE_API_KEY` |
| Claude `429` | Rate limit — auto-retried |
| `ImgBB upload failed` | Check `IMGBB_API_KEY` |
| `GNews no articles` | API quota or network issue |

---

## Security

- **Never commit `.env`** — it's in `.gitignore`
- All credentials loaded exclusively via `process.env`
- Meta Access Token expires in ~60 days — rotate it regularly
- `DISABLE_SSL_VERIFY=true` only for local dev behind corporate proxy/VPN
