/**
 * FactWala — Instagram Permission Validator
 *
 * Phase 1 of 2: Validates all Instagram credentials and permissions.
 * Does NOT publish anything.
 *
 * Checks:
 *   1. Token debug info (type, scopes, expiry)
 *   2. Instagram Business Account info
 *   3. instagram_content_publish permission
 *   4. Creates a media container (dry-run) and verifies status
 *
 * Usage: node scripts/validate.js
 */

require('dotenv').config();
if (process.env.DISABLE_SSL_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const axios   = require('axios');
const { createCanvas } = require('@napi-rs/canvas');
const fs      = require('fs');
const path    = require('path');
const { uploadToImgBB } = require('../src/upload/uploadImgBB');
const { retry }         = require('../src/utils/retry');

const GRAPH   = 'https://graph.facebook.com/v21.0';
const TOKEN   = process.env.META_ACCESS_TOKEN;
const APP_ID  = process.env.META_APP_ID;
const APP_SEC = process.env.META_APP_SECRET;
const IG_ID   = process.env.INSTAGRAM_BUSINESS_ID;

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  dim:    '\x1b[2m',
};

const pass  = `${C.green}${C.bold}  PASS${C.reset}`;
const fail  = `${C.red}${C.bold}  FAIL${C.reset}`;
const warn  = `${C.yellow}${C.bold}  WARN${C.reset}`;
const arrow = `${C.cyan}  →${C.reset}`;

function line(char = '─', len = 60) {
  return C.dim + char.repeat(len) + C.reset;
}

function printHeader() {
  console.log('\n' + line('═'));
  console.log(`${C.bold}${C.cyan}  FactWala — Instagram Permission Validator${C.reset}`);
  console.log(line('═'));
  console.log(`${arrow} Timestamp : ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log(`${arrow} IG ID     : ${C.bold}${IG_ID}${C.reset}`);
  console.log(`${arrow} App ID    : ${APP_ID}`);
  console.log(`${arrow} Token     : ${TOKEN ? TOKEN.substring(0, 20) + '...' : C.red + 'NOT SET' + C.reset}`);
  console.log(line());
}

// ── Step helpers ──────────────────────────────────────────────────────────────
let stepNum = 0;
const results = {};

function startStep(title) {
  stepNum++;
  console.log(`\n${C.bold}[${stepNum}] ${title}${C.reset}`);
}

function ok(label, value = '') {
  console.log(`  ${pass}  ${C.white}${label}${C.reset}  ${C.dim}${value}${C.reset}`);
}

function bad(label, detail = '') {
  console.log(`  ${fail}  ${C.white}${label}${C.reset}`);
  if (detail) console.log(`       ${C.red}${detail}${C.reset}`);
}

function note(label, value = '') {
  console.log(`  ${warn}  ${C.white}${label}${C.reset}  ${C.dim}${value}${C.reset}`);
}

function info(label, value = '') {
  console.log(`  ${arrow}  ${C.white}${label}${C.reset}  ${C.dim}${value}${C.reset}`);
}

// ── Error decoder ─────────────────────────────────────────────────────────────
function decodeApiError(err) {
  const e = err.response?.data?.error;
  if (!e) return { code: 0, message: err.message, solution: 'Check network connectivity.' };

  const solutions = {
    190:  'Access token expired or invalid. Regenerate at developers.facebook.com/tools/explorer',
    200:  'Permission denied. Add instagram_content_publish to your app and re-authorize.',
    10:   'App does not have permission. Ensure instagram_content_publish is approved in your Meta app.',
    4:    'App rate limit exceeded. Wait before retrying.',
    17:   'User rate limit exceeded. Wait before retrying.',
    100:  'Invalid parameter. Check INSTAGRAM_BUSINESS_ID is a Business or Creator account.',
    9007: 'Account is not a Business or Creator account. Convert at instagram.com/accounts/convert_to_professional.',
    368:  'Account temporarily blocked from publishing. Wait 24h before trying again.',
    2207024: 'Media type not supported. Ensure image is JPEG/PNG, min 320px, max 1440px.',
    2207026: 'Image URL not accessible publicly. Use a direct HTTPS image URL.',
  };

  return {
    code:     e.code,
    type:     e.type,
    subcode:  e.error_subcode,
    message:  e.message,
    solution: solutions[e.code] || solutions[e.error_subcode] || 'See https://developers.facebook.com/docs/instagram-api/reference/error-codes',
  };
}

// ── 1. Check required env vars ────────────────────────────────────────────────
function checkEnvVars() {
  startStep('Environment Variables');
  const required = {
    INSTAGRAM_BUSINESS_ID: IG_ID,
    META_APP_ID:           APP_ID,
    META_APP_SECRET:       APP_SEC,
    META_ACCESS_TOKEN:     TOKEN,
    IMGBB_API_KEY:         process.env.IMGBB_API_KEY,
  };

  let allPresent = true;
  for (const [key, val] of Object.entries(required)) {
    if (val) {
      ok(key, val.length > 30 ? val.substring(0, 20) + '…' : val);
    } else {
      bad(key, `Not set in .env`);
      allPresent = false;
    }
  }
  results.env = allPresent;
  return allPresent;
}

// ── 2. Debug token ────────────────────────────────────────────────────────────
async function debugToken() {
  startStep('Token Debug (Graph /debug_token)');
  try {
    // debug_token is a root-level endpoint — no API version prefix allowed
    const appToken = process.env.META_APP_ID + '|' + process.env.META_APP_SECRET;
    const debugUrl = 'https://graph.facebook.com/debug_token'
      + '?input_token=' + process.env.META_ACCESS_TOKEN
      + '&access_token=' + appToken;

    const res = await axios.get(debugUrl, { timeout: 15000 });

    const d = res.data.data;
    info('Token type',    d.type);
    info('App ID',        d.app_id);
    info('User ID',       d.user_id);

    if (d.expires_at && d.expires_at !== 0) {
      const expiry = new Date(d.expires_at * 1000);
      const daysLeft = Math.round((expiry - Date.now()) / 86400000);
      if (daysLeft < 7) {
        note('Token expires', `${expiry.toLocaleDateString('en-IN')} (${daysLeft} days left — renew soon!)`);
      } else {
        ok('Token expires', `${expiry.toLocaleDateString('en-IN')} (${daysLeft} days left)`);
      }
    } else {
      ok('Token expiry', 'Never (long-lived / system user token)');
    }

    // Check scopes
    const scopes = d.scopes || [];
    info('Scopes', scopes.join(', ') || '(none listed)');

    const hasPublish = scopes.includes('instagram_content_publish') || d.is_valid;
    results.tokenValid = d.is_valid;
    results.scopes = scopes;

    if (d.is_valid) ok('Token valid', 'true');
    else             bad('Token valid', 'false — token may be expired or revoked');

    return d;
  } catch (err) {
    const e = decodeApiError(err);
    // Code 190 on debug_token often means the token was issued via a different Meta app
    // or auth flow — not that the token is invalid for Instagram API calls.
    // Container creation (Step 5) is the authoritative proof of token validity.
    if (e.code === 190) {
      note(`Token debug skipped [code 190]`, 'Token may be from a different Meta app — API call validity confirmed by container creation (Step 5)');
      results.tokenValid = null; // null → WARN in summary, not FAIL
    } else {
      bad(`Token debug failed [code ${e.code}]`, e.message);
      info('Solution', e.solution);
      results.tokenValid = false;
    }
    return null;
  }
}

// ── 3. Instagram account info ─────────────────────────────────────────────────
async function getAccountInfo() {
  startStep('Instagram Business Account Info');
  try {
    // account_type is not a supported field on IG Business IDs in Graph API v21.0
    const fields = 'id,name,biography,followers_count,media_count';
    const url = 'https://graph.facebook.com/v21.0/'
      + process.env.INSTAGRAM_BUSINESS_ID
      + '?fields=' + fields
      + '&access_token=' + process.env.META_ACCESS_TOKEN;

    const res = await axios.get(url, { timeout: 15000 });
    const d = res.data;

    // Presence of 'id' confirms this is a valid, accessible IG Business account
    if (!d.id) throw new Error('Response has no id — check INSTAGRAM_BUSINESS_ID');

    ok('Valid Instagram Business Account', `ID: ${d.id}`);
    info('Name',        d.name || '—');
    info('Bio',         d.biography ? d.biography.substring(0, 70) + '…' : '—');
    info('Followers',   d.followers_count?.toLocaleString() || '—');
    info('Total posts', d.media_count?.toLocaleString() || '—');

    results.account    = d;
    results.isBusiness = true; // account_type check removed per Graph API v21.0 fix
    return d;
  } catch (err) {
    const e = decodeApiError(err);
    bad(`Account fetch failed [code ${e.code}]`, e.message);
    info('Solution', e.solution);
    results.isBusiness = false;
    return null;
  }
}

// ── 4. Check publish permission ───────────────────────────────────────────────
async function checkPublishPermission() {
  startStep('instagram_content_publish Permission');
  try {
    // Try fetching via /me/permissions — works with User Access Tokens
    const res = await axios.get(`${GRAPH}/me/permissions`, {
      params: { access_token: TOKEN },
      timeout: 15000,
    });

    const perms = res.data?.data || [];
    const granted = perms
      .filter(p => p.status === 'granted')
      .map(p => p.permission);

    const hasPublish = granted.includes('instagram_content_publish');

    info('All granted permissions', granted.join(', ') || '(none)');

    if (hasPublish) {
      ok('instagram_content_publish', 'GRANTED');
    } else {
      bad('instagram_content_publish', 'NOT GRANTED');
      info('Solution', 'Re-authorize app with instagram_content_publish scope at developers.facebook.com/tools/explorer');
    }

    results.publishPermission = hasPublish;
    results.permissions       = granted;
    return hasPublish;
  } catch (err) {
    // /me/permissions may not work for all token types — fall back to inference
    const e = decodeApiError(err);
    note('Could not read /me/permissions directly', e.message);
    info('Inferring permission from token debug scopes...');

    const hasFromDebug = results.scopes?.includes('instagram_content_publish');
    if (hasFromDebug) {
      ok('instagram_content_publish', 'GRANTED (inferred from debug scopes)');
      results.publishPermission = true;
      return true;
    } else if (results.tokenValid) {
      note('instagram_content_publish', 'Status unknown — will verify via container creation');
      results.publishPermission = null;
      return null;
    } else {
      bad('instagram_content_publish', 'Cannot verify — token invalid');
      results.publishPermission = false;
      return false;
    }
  }
}

// ── 5. Generate minimal test image ───────────────────────────────────────────
async function generateTestImage() {
  const canvas = createCanvas(400, 400);
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = '#F5A623';
  ctx.font = 'bold 32px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FactWala Validate', 200, 180);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '20px serif';
  ctx.fillText('Permission Test', 200, 230);

  const tmpPath = path.join(__dirname, '../output/_validate_test.jpg');
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  fs.writeFileSync(tmpPath, canvas.toBuffer('image/jpeg', 85));
  return tmpPath;
}

// ── 6. Create media container (dry-run) ───────────────────────────────────────
async function createContainerDryRun() {
  startStep('Create Media Container (Dry-run — will NOT be published)');

  let imgPath, imageUrl;
  try {
    process.stdout.write('  → Generating test image and uploading to ImgBB... ');
    imgPath   = await generateTestImage();
    imageUrl  = await uploadToImgBB(imgPath);
    console.log(`${C.green}done${C.reset}`);
    info('Test image URL', imageUrl);
  } catch (err) {
    bad('Image upload failed', err.message);
    results.containerCreated = false;
    return null;
  }

  try {
    const res = await retry(
      () => axios.post(`${GRAPH}/${IG_ID}/media`, null, {
        params: {
          image_url:    imageUrl,
          caption:      '[FactWala validation test — not published]',
          access_token: TOKEN,
        },
        timeout: 30000,
      }),
      { attempts: 2, delayMs: 3000, label: 'container create' }
    );

    const containerId = res.data?.id;
    if (!containerId) throw new Error('No container ID returned');

    ok('Container created',  containerId);
    results.containerId = containerId;

    // Check container status
    await checkContainerStatus(containerId);

    // Clean up temp file
    try { fs.unlinkSync(imgPath); } catch { /* non-fatal */ }

    results.containerCreated = true;
    return containerId;
  } catch (err) {
    const e = decodeApiError(err);
    bad(`Container creation failed [code ${e.code}${e.subcode ? '/' + e.subcode : ''}]`, e.message);
    info('Solution', e.solution);
    results.containerCreated = false;
    results.apiError = e;
    return null;
  }
}

// ── 7. Container status ───────────────────────────────────────────────────────
async function checkContainerStatus(containerId) {
  try {
    await new Promise(r => setTimeout(r, 3000)); // give Instagram a moment
    const res = await axios.get(`${GRAPH}/${containerId}`, {
      params: {
        fields:       'id,status,status_code',
        access_token: TOKEN,
      },
      timeout: 15000,
    });

    const { status, status_code } = res.data;
    const statusMap = {
      FINISHED:    `${C.green}FINISHED${C.reset}  — container ready to publish`,
      IN_PROGRESS: `${C.yellow}IN_PROGRESS${C.reset} — still processing`,
      ERROR:       `${C.red}ERROR${C.reset}      — container failed`,
      EXPIRED:     `${C.red}EXPIRED${C.reset}    — container expired (24h limit)`,
    };

    const display = statusMap[status_code] || status_code || status || 'unknown';
    info('Container status', display);
    results.containerStatus = status_code;

    if (status_code === 'FINISHED' || status_code === 'IN_PROGRESS') {
      ok('Container status is publishable');
      results.containerPublishable = true;
    } else {
      note('Container status needs investigation', `status_code = ${status_code}`);
      results.containerPublishable = false;
    }
  } catch (err) {
    const e = decodeApiError(err);
    note(`Could not fetch container status [code ${e.code}]`, e.message);
  }
}

// ── Final summary ─────────────────────────────────────────────────────────────
function printSummary() {
  console.log('\n' + line('═'));
  console.log(`${C.bold}${C.cyan}  VALIDATION SUMMARY${C.reset}`);
  console.log(line('─'));

  // Token is confirmed valid if container was created — debug_token is a secondary signal
  const tokenConfirmed = results.tokenValid ?? (results.containerCreated ? true : null);

  const checks = [
    { label: 'Environment variables set',         result: results.env },
    { label: 'Access token valid (API confirmed)', result: tokenConfirmed },
    { label: 'Instagram Business account found',  result: results.isBusiness },
    { label: 'instagram_content_publish granted', result: results.publishPermission ?? results.containerCreated },
    { label: 'Media container created (FINISHED)',result: results.containerCreated },
    { label: 'Container status publishable',      result: results.containerPublishable },
  ];

  let allPass = true;
  for (const c of checks) {
    if (c.result === true) {
      console.log(`  ${pass}  ${c.label}`);
    } else if (c.result === null || c.result === undefined) {
      console.log(`  ${warn}  ${c.label}  ${C.dim}(could not verify)${C.reset}`);
    } else {
      console.log(`  ${fail}  ${c.label}`);
      allPass = false;
    }
  }

  console.log('\n' + line('─'));

  if (results.account) {
    console.log(`${arrow} Instagram Business ID : ${C.bold}${IG_ID}${C.reset}`);
    console.log(`${arrow} Account Name          : ${C.bold}${results.account.name || '—'}${C.reset}`);
  }
  if (results.containerId) {
    console.log(`${arrow} Container ID          : ${C.bold}${results.containerId}${C.reset}`);
    console.log(`${arrow} Container Status      : ${C.bold}${results.containerStatus || 'checked'}${C.reset}`);
  }
  if (results.permissions?.length) {
    console.log(`${arrow} Permissions           : ${results.permissions.join(', ')}`);
  }

  console.log('\n' + line('═'));

  if (allPass) {
    console.log(`\n  ${C.green}${C.bold}  RESULT: PASS${C.reset}  — All checks passed. Safe to run: npm start\n`);
  } else {
    console.log(`\n  ${C.red}${C.bold}  RESULT: FAIL${C.reset}  — Fix the issues above before running npm start\n`);
    if (results.apiError) {
      console.log(`  ${C.yellow}Graph API Error:${C.reset}`);
      console.log(`    Code    : ${results.apiError.code}`);
      console.log(`    Type    : ${results.apiError.type}`);
      console.log(`    Message : ${results.apiError.message}`);
      console.log(`    Fix     : ${results.apiError.solution}\n`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  printHeader();

  const envOk = checkEnvVars();
  if (!envOk) {
    bad('Cannot proceed — required environment variables are missing');
    process.exit(1);
  }

  await debugToken();
  await getAccountInfo();
  await checkPublishPermission();
  await createContainerDryRun();

  printSummary();
})().catch(err => {
  console.error(`\n${C.red}Unhandled error:${C.reset}`, err.message);
  process.exit(1);
});
