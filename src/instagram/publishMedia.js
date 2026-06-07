require('dotenv').config();
const axios  = require('axios');
const logger = require('../utils/logger');
const { retry, sleep } = require('../utils/retry');

const GRAPH_BASE               = 'https://graph.facebook.com/v21.0';
const CONTAINER_PROCESSING_MS  = 5000; // Instagram needs time to process the media container

/**
 * Step 2 of 2: Publishes a created media container to Instagram.
 * Returns the published post ID.
 */
async function publishMedia(containerId) {
  const igUserId    = process.env.INSTAGRAM_BUSINESS_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!igUserId)    throw new Error('INSTAGRAM_BUSINESS_ID is not set');
  if (!accessToken) throw new Error('META_ACCESS_TOKEN is not set');

  logger.info(`Waiting ${CONTAINER_PROCESSING_MS}ms for container to be ready...`);
  await sleep(CONTAINER_PROCESSING_MS);

  logger.info('Publishing media to Instagram...', { containerId });

  const response = await retry(
    () => axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, null, {
      params: {
        creation_id:  containerId,
        access_token: accessToken,
      },
      timeout: 30000,
    }),
    { attempts: 3, delayMs: 6000, label: 'Instagram publish' }
  ).catch(err => {
    const apiErr = err.response?.data?.error;
    if (apiErr) {
      const msg = `Instagram publish error ${apiErr.code} (${apiErr.type}): ${apiErr.message}`;
      if (apiErr.code === 9007) throw new Error(`${msg} — Rate limit hit, wait before retrying.`);
      throw new Error(msg);
    }
    throw err;
  });

  // Guard: Instagram occasionally returns HTTP 200 with an error body instead of 4xx
  if (response.data?.error) {
    const code = response.data.error.code;
    if (code === 190) throw new Error('TOKEN_EXPIRED: Regenerate META_ACCESS_TOKEN');
    if (code === 9007) throw new Error('NOT_BUSINESS_ACCOUNT: Check IG account type');
    if (code === 32)   throw new Error('RATE_LIMIT: Too many posts. Wait 24h');
    if (code === 10)   throw new Error('PERMISSION_DENIED: Check instagram_content_publish');
    throw new Error('INSTAGRAM_ERROR_' + code + ': ' + response.data.error.message);
  }

  const postId = response.data?.id;
  if (!postId) throw new Error(`No post ID in publish response: ${JSON.stringify(response.data)}`);

  logger.success('Post published to Instagram!', { postId });
  return postId;
}

module.exports = { publishMedia };
