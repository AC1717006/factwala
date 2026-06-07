require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const IMGBB_URL = 'https://api.imgbb.com/1/upload';

/**
 * Uploads a local image file to ImgBB and returns the public HTTPS URL.
 * Instagram Graph API requires a publicly accessible image URL.
 * Free API key: https://imgbb.com/api
 */
async function uploadToImgBB(imagePath) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) throw new Error('IMGBB_API_KEY is not set. Get a free key at https://imgbb.com/api');

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  logger.info('Uploading image to ImgBB CDN...', { file: imagePath });

  const response = await retry(
    () => {
      const params = new URLSearchParams();
      params.append('key',   apiKey);
      params.append('image', base64Image);

      return axios.post(IMGBB_URL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 45000,
      });
    },
    { attempts: 3, delayMs: 3000, label: 'ImgBB upload' }
  );

  if (!response.data?.success) {
    throw new Error(`ImgBB upload failed: ${JSON.stringify(response.data)}`);
  }

  const { url, delete_url, display_url } = response.data.data;
  logger.success('Image uploaded to ImgBB', { url, display_url });

  return url; // HTTPS URL usable by Instagram Graph API
}

module.exports = { uploadToImgBB };
