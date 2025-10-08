import express from 'express';
import dotenv from 'dotenv';
import FarcasterService from './services/farcaster.js';
import logger from './utils/logger.js';
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

// Initialize Farcaster service
const farcaster = new FarcasterService(process.env.FARCASTER_NEYNAR_API_KEY);

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

    await farcaster.replyCast(cast.hash, response);
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

// Export the Express app for Vercel serverless runtime
export default app;