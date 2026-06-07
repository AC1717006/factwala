require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const logger = require('../utils/logger');

// Uploads image to ImgBB and returns the public URL.
// Free API key: https://imgbb.com/api
async function uploadToImgBB(imagePath) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) throw new Error('IMGBB_API_KEY environment variable is not set. Get a free key at https://imgbb.com/api');

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  logger.info('Uploading image to ImgBB...', { path: imagePath });

  const params = new URLSearchParams();
  params.append('key', apiKey);
  params.append('image', base64Image);

  const response = await axios.post('https://api.imgbb.com/1/upload', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });

  if (!response.data?.success) {
    throw new Error(`ImgBB upload failed: ${JSON.stringify(response.data)}`);
  }

  const imageUrl = response.data.data.url;
  logger.success('Image uploaded to ImgBB', { url: imageUrl });
  return imageUrl;
}

module.exports = { uploadToImgBB };
