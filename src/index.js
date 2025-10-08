import express from 'express';
import dotenv from 'dotenv';
import FarcasterService from './services/farcaster.js';
import logger from './utils/logger.js';
import axios from 'axios';
import {
  handleWeatherWhisper,
  handleZodiacVibe,
  handleFortuneBloom,
  generateDailyGreeting
} from './actions/index.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// Lazy Farcaster service to avoid crashes on cold start
let farcasterInstance;
function getFarcaster() {
  if (!farcasterInstance) {
    const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
    farcasterInstance = new FarcasterService(apiKey);
  }
  return farcasterInstance;
}

// In-memory seen mentions cache (best-effort; persistence is limited on serverless)
const seenMentions = new Set();

// Polling routine: fetch mentions, log start/end, and process new ones
async function pollMentions() {
  const startTs = new Date().toISOString();
  logger.info(`[poll] start ${startTs}`);
  try {
    const casts = await getFarcaster().getRecentMentions();
    const newCasts = casts.filter(c => !seenMentions.has(c.hash));
    newCasts.forEach(c => seenMentions.add(c.hash));
    logger.info(`[poll] mentions total=${casts.length} new=${newCasts.length}`);

    // Optionally process new mentions
    for (const cast of newCasts) {
      await handleMention(cast);
    }

    const endTs = new Date().toISOString();
    logger.info(`[poll] end ${endTs}`);
    return { total: casts.length, new: newCasts.length };
  } catch (error) {
    logger.error(`[poll] error ${error.message}`);
    return { error: error.message };
  }
}

// Helper function to extract location from text
function extractLocation(text) {
  const match = text.match(/weather (?:in|at|for) ([^.!?,]+)/i);
  return match ? match[1].trim() : null;
}

// Helper function to extract zodiac sign from text
function extractZodiacSign(text) {
  const signs = {
    'aries': '♈', 'taurus': '♉', 'gemini': '♊', 'cancer': '♋',
    'leo': '♌', 'virgo': '♍', 'libra': '♎', 'scorpio': '♏',
    'sagittarius': '♐', 'capricorn': '♑', 'aquarius': '♒', 'pisces': '♓'
  };
  
  for (const [sign, symbol] of Object.entries(signs)) {
    if (text.toLowerCase().includes(sign)) {
      return symbol;
    }
  }
  return null;
}

// Handle incoming mentions
async function handleMention(cast) {
  try {
    const text = cast.text.toLowerCase();
    let response;

    // Check for weather request
    const location = extractLocation(text);
    if (location) {
      response = await handleWeatherWhisper(location);
    }
    // Check for zodiac request
    else if (text.includes('zodiac') || text.includes('horoscope')) {
      const sign = extractZodiacSign(text);
      if (sign) {
        response = handleZodiacVibe(sign);
      } else {
        response = "Tell me your sign, and I'll read the stars for you ✨";
      }
    }
    // Check for fortune request
    else if (text.includes('fortune') || text.includes('tell me something')) {
      response = handleFortuneBloom();
    }
    // Default response
    else {
      response = "✨ I can tell you about the weather, your zodiac vibes, or share a fortune. What would you like to know?";
    }

    await getFarcaster().replyCast(cast.hash, response);
    logger.info(`Replied to cast ${cast.hash}`);
  } catch (error) {
    logger.error(`Error handling mention: ${error.message}`);
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: '✨ Aiyra is awake and dreaming...',
    version: process.env.npm_package_version
  });
});

// Keep-alive endpoint (for scheduled pings)
app.get('/keepalive', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'keepalive' });
});

// Cron-poll endpoint (invoked by Vercel Cron or manual)
app.get('/poll', async (req, res) => {
  const result = await pollMentions();
  res.status(200).json({ status: 'ok', result });
});

// Webhook endpoint for mentions
app.post('/webhook', async (req, res) => {
  try {
    const { cast } = req.body;
    const fid = Number(process.env.FARCASTER_FID);
    if (cast && cast.mentions && cast.mentions.includes(fid)) {
      // Process mention asynchronously
      handleMention(cast).catch(error => 
        logger.error(`Async mention handling error: ${error.message}`)
      );
      // Return immediately to acknowledge receipt
      res.status(200).json({ status: 'ok', message: 'Processing mention' });
    } else {
      res.status(200).json({ status: 'ok', message: 'No relevant mention found' });
    }
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start a local server when not running on Vercel
const isVercel = !!process.env.VERCEL;
if (!isVercel) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    logger.info(`✨ Aiyra server listening on port ${port}`);
  });

  // Lightweight local scheduler: self-ping /poll to keep the loop active
  const intervalMs = 90 * 1000; // ~1.5 minutes
  setInterval(async () => {
    try {
      await axios.get(`http://localhost:${port}/poll`);
      await axios.get(`http://localhost:${port}/keepalive`);
    } catch (e) {
      logger.error(`self-ping error: ${e.message}`);
    }
  }, intervalMs);
}

// Export the Express app for Vercel serverless runtime
// Export a handler for Vercel serverless runtime
export default (req, res) => app(req, res);