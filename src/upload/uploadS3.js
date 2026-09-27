require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

// Uploads a slide to a PRIVATE S3 bucket and returns a time-limited
// (presigned) HTTPS link that Instagram can download from.
// The bucket stays private — no public bucket policy, Block Public Access stays ON.
//
// AWS credentials come from the default chain: EC2 instance role (preferred)
// or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env.
// Minimum IAM permissions: s3:PutObject and s3:GetObject on
//   arn:aws:s3:::<S3_BUCKET>/<S3_PREFIX>/*

const EXPIRES = Math.min(
  Math.max(parseInt(process.env.S3_URL_EXPIRES || '7200', 10), 900), // at least 15 min
  6 * 3600                                                           // at most 6 h
);

let client;
function s3() {
  if (!client) client = new S3Client({ region: process.env.S3_REGION || 'ap-south-1' });
  return client;
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

async function uploadToS3(imagePath) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET environment variable is not set');

  const prefix = (process.env.S3_PREFIX || 'factwala').replace(/^\/+|\/+$/g, '');
  const key    = `${prefix}/${todayIST()}/${path.basename(imagePath)}`;
  const body   = fs.readFileSync(imagePath);

  logger.info('Uploading image to S3...', { bucket, key, sizeKB: Math.round(body.length / 1024) });

  await retry(
    () => s3().send(new PutObjectCommand({
      Bucket:       bucket,
      Key:          key,
      Body:         body,
      ContentType:  'image/jpeg',
      CacheControl: 'private, max-age=86400',
    })),
    { attempts: 3, delayMs: 3000, label: 'S3 upload' }
  );

  const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: EXPIRES });
  logger.success('Image uploaded to S3', { key, linkValidMinutes: Math.round(EXPIRES / 60) });
  return url;
}

module.exports = { uploadToS3 };
