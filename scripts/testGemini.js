// Gemini slide test — generates 3 sample slides locally.
// Does NOT call GNews, ImgBB or Instagram. Uses GEMINI_API_KEY (+ CLAUDE_API_KEY
// for the Hindi text check unless GEMINI_TEXT_CHECK=false).
//
//   node scripts/testGemini.js
//
// Output: output/gemini_slide_*.jpg — open them and check the Hindi text.
require('dotenv').config();
const { generateGeminiCarouselImages } = require('../src/image/generateGeminiCarousel');
const logger = require('../src/utils/logger');

const SAMPLE = {
  headline: '⚡ जयपुर में नई मेट्रो लाइन का काम शुरू',
  slides: [
    {
      slide_number: 1,
      background_color: '#1a1a2e',
      accent_color: '#e94560',
      title: '⚡ ब्रेकिंग',
      body: ['जयपुर मेट्रो का नया चरण शुरू', 'शहर को मिलेगी तेज़ यात्रा', 'काम आज से शुरू हुआ'],
    },
    {
      slide_number: 2,
      background_color: '#16213e',
      accent_color: '#f5a623',
      title: '📋 पूरी बात जानिए',
      body: ['• यह एक टेस्ट स्लाइड है', '• असली खबर नहीं है', '• केवल डिज़ाइन जांच के लिए', '• इसे पोस्ट न करें'],
    },
    {
      slide_number: 3,
      background_color: '#0f3460',
      accent_color: '#e94560',
      title: '💬 आपकी राय?',
      body: ['क्या इससे ट्रैफिक कम होगा?', '👇 Comment करें और Share करें'],
    },
  ],
};

generateGeminiCarouselImages(SAMPLE)
  .then(paths => {
    logger.success('Gemini test slides ready (not posted anywhere)', { paths });
    process.exit(0);
  })
  .catch(err => {
    logger.error('Gemini test failed', { message: err.message, body: err.response?.data ? JSON.stringify(err.response.data).substring(0, 800) : undefined });
    process.exit(1);
  });
