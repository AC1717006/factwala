require('dotenv').config();
const axios  = require('axios');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Step 1 of 2: Creates an Instagram media container.
 * Returns the container ID which is then passed to publishMedia().
 *
 * Note: Instagram Graph API requires image_url to be a publicly accessible HTTPS URL.
 * Error codes: https://developers.facebook.com/docs/instagram-api/reference/error-codes
 */
async function createMediaContainer(imageUrl, caption) {
  const igUserId    = process.env.INSTAGRAM_BUSINESS_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!igUserId)    throw new Error('INSTAGRAM_BUSINESS_ID is not set');
  if (!accessToken) throw new Error('META_ACCESS_TOKEN is not set');

  logger.info('Creating Instagram media container...', { igUserId });

  const response = await retry(
    () => axios.post(`${GRAPH_BASE}/${igUserId}/media`, null, {
      params: {
        image_url:    imageUrl,
        caption:      caption,
        access_token: accessToken,
      },
      timeout: 30000,
    }),
    { attempts: 3, delayMs: 5000, label: 'Instagram createMedia' }
  ).catch(err => {
    const apiErr = err.response?.data?.error;
    if (apiErr) {
      const msg = `Instagram API ${apiErr.code} (${apiErr.type}): ${apiErr.message}`;
      if (apiErr.code === 190) throw new Error(`${msg} — Access token expired, regenerate it.`);
      if (apiErr.code === 9007) throw new Error(`${msg} — Account is not a Business/Creator account.`);
      throw new Error(msg);
    }
    throw err;
  });

  const containerId = response.data?.id;
  if (!containerId) throw new Error(`No container ID in response: ${JSON.stringify(response.data)}`);

  logger.success('Media container created', { containerId });
  return containerId;
}

module.exports = { createMediaContainer };
