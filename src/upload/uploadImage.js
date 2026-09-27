require('dotenv').config();
const { uploadToImgBB } = require('./uploadImgBB');
const { uploadToS3 }    = require('./uploadS3');

// IMAGE_HOST=s3     → private S3 bucket + time-limited presigned link
// IMAGE_HOST=imgbb  → ImgBB (default, previous behaviour)
const IMAGE_HOST = (process.env.IMAGE_HOST || 'imgbb').toLowerCase();

async function uploadPublicImage(imagePath) {
  if (IMAGE_HOST === 's3') return uploadToS3(imagePath);
  return uploadToImgBB(imagePath);
}

// For saving to the "posted" databases/logs: drop the signature part of a
// presigned link so no temporary AWS credentials are stored on disk.
const stripSignature = (url) => String(url).split('?')[0];

module.exports = { uploadPublicImage, stripSignature, IMAGE_HOST };
