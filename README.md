# ⚡ FactWala — Instagram Hindi News Bot

> Automatically fetches top Hindi news → rewrites into a **3-slide carousel** with **Claude AI** → generates branded **1080x1080 slide images** → publishes a **carousel post** to **Instagram** twice daily via GitHub Actions.

---

## Architecture

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
postedNews.json — mark as done (prevent duplicates)
```

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env — add all API keys

# 3. Test (no Instagram posting)
npm test

# 4. Go live
npm start
```

---

## Required API Keys

| Variable | Free? | Get it at |
|---|---|---|
| `News_API` | Yes (100 req/day) | [gnews.io](https://gnews.io) |
| `CLAUDE_API_KEY` | Paid | [console.anthropic.com](https://console.anthropic.com) |
| `IMGBB_API_KEY` | Yes | [imgbb.com/api](https://imgbb.com/api) |
| `META_ACCESS_TOKEN` | Yes | [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer/) |
| `INSTAGRAM_BUSINESS_ID` | - | Meta Business Suite |
| `FACEBOOK_PAGE_ID` | - | Meta Business Suite |
| `META_APP_ID` | - | [developers.facebook.com](https://developers.facebook.com) |
| `META_APP_SECRET` | - | Meta Developer Portal |
| `GROQ_API_KEY` | Yes (legacy, unused) | [console.groq.com](https://console.groq.com) |

> `CLAUDE_MODEL` (optional) overrides the default `claude-sonnet-4-6` model.

---

## Project Structure

```
instagram-news-bot/
├── index.js                          # Entry point (--test flag)
├── package.json
├── .env.example
├── .gitignore
│
├── src/
│   ├── news/
│   │   └── fetchNews.js              # GNews API — top Hindi news
│   ├── ai/
│   │   └── rewriteNews.js            # Claude AI — 3-slide carousel rewrite
│   ├── image/
│   │   ├── generateCarousel.js       # Canvas — 3x 1080×1080 carousel slides
│   │   └── generateImage.js          # (legacy) single 1080×1920 image
│   ├── upload/
│   │   └── uploadImgBB.js            # ImgBB — upload & get public URL
│   ├── instagram/
│   │   ├── createMedia.js            # Graph API — create container(s) / carousel
│   │   └── publishMedia.js           # Graph API — publish post
│   ├── storage/
│   │   └── postedNews.json           # Duplicate prevention database
│   └── utils/
│       ├── logger.js                 # Structured logging → logs/activity.log
│       └── retry.js                  # Exponential back-off retry helper
│
├── output/                           # Generated images (auto-created)
├── logs/
│   └── activity.log                  # All log entries
│
└── .github/
    └── workflows/
        └── autopost.yml              # 8 AM & 8 PM IST cron
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

4. Bot runs automatically at **8:00 AM IST** and **8:00 PM IST** every day
5. Manual trigger: Actions tab → Run workflow → choose `production` or `test`

---

## Test Mode

```bash
npm test
```

Runs the full pipeline **except** the Instagram publish step:
- Fetches latest Hindi news article
- Rewrites it into a 3-slide carousel with Claude AI
- Generates & saves 3x 1080x1080 slide images to `output/`
- Uploads all 3 images to ImgBB
- Prints the Instagram caption to console

When all steps pass, run `npm start` to go live.

---

## Duplicate Prevention

Every article URL is saved to `src/storage/postedNews.json` after posting. The bot skips any URL already in this file, so the same article is never posted twice.

In GitHub Actions, the updated `postedNews.json` is committed back to the repo after each successful run.

---

## Logging

All activity is written to `logs/activity.log` with timestamps and structured JSON data. In GitHub Actions, logs are uploaded as downloadable artifacts.

---

## Error Handling

Every external API call uses exponential back-off retry (3 attempts, 2-6s delay). Specific error messages for:

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
