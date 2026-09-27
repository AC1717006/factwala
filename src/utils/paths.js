const path = require('path');

// Where the "already posted" JSON databases live.
// Default = src/storage (same as before, used by GitHub Actions).
// On EC2 set DATA_DIR to a folder outside the git checkout, so bot state
// never makes the working tree dirty and survives code updates.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '../storage');

const dbPath = (fileName) => path.join(DATA_DIR, fileName);

module.exports = { DATA_DIR, dbPath };
