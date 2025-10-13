import dotenv from 'dotenv';
import FarcasterService from '../src/services/farcaster.js';

dotenv.config();

async function main() {
  const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
  const username = (process.env.FARCASTER_USERNAME || 'agent-aiyra').toLowerCase();
  if (!apiKey) {
    console.error('Missing FARCASTER_NEYNAR_API_KEY');
    process.exit(1);
  }
  if (!process.env.FARCASTER_SIGNER_UUID) {
    console.error('Missing FARCASTER_SIGNER_UUID');
    process.exit(1);
  }

  const fc = new FarcasterService(apiKey);
  try {
    const text = `@${username} what's the weather in Paris?`;
    const base = await fc.publishCast(text);
    console.log(JSON.stringify({ status: 'ok', base }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Post mention failed:', error.message);
    process.exit(1);
  }
}

main();