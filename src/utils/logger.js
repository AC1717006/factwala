const fs   = require('fs');
const path = require('path');

const LOG_DIR  = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'activity.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatLine(level, message, data) {
  const ts      = new Date().toISOString();
  const dataStr = data && Object.keys(data).length ? ' ' + JSON.stringify(data) : '';
  return `[${ts}] [${level.padEnd(7)}] ${message}${dataStr}`;
}

function writeLog(level, message, data = {}) {
  ensureLogDir();
  const line = formatLine(level, message, data);
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8'); } catch { /* non-fatal */ }
}

module.exports = {
  info:    (msg, data = {}) => writeLog('INFO',    msg, data),
  warn:    (msg, data = {}) => writeLog('WARN',    msg, data),
  error:   (msg, data = {}) => writeLog('ERROR',   msg, data),
  success: (msg, data = {}) => writeLog('SUCCESS', msg, data),
};
