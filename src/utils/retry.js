const logger = require('./logger');

/**
 * Retries an async function with exponential back-off.
 * @param {Function} fn          - Async function to retry
 * @param {Object}   opts
 * @param {number}   opts.attempts  - Max attempts (default 3)
 * @param {number}   opts.delayMs   - Base delay in ms, doubles each retry (default 2000)
 * @param {string}   opts.label     - Label shown in logs (default 'operation')
 */
async function retry(fn, { attempts = 3, delayMs = 2000, label = 'operation' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === attempts;
      const wait   = delayMs * attempt;

      logger.warn(`${label} failed (attempt ${attempt}/${attempts})`, {
        error: err.message,
        retryInMs: isLast ? null : wait,
      });

      if (isLast) break;
      await sleep(wait);
    }
  }
  throw lastErr;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { retry, sleep };
