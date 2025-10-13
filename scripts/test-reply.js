import dotenv from 'dotenv';
import FarcasterService from '../src/services/farcaster.js';

dotenv.config();

async function main() {
  const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
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
    const base = await fc.publishCast('Testing reply flow from Aiyra ✨');
    const parentHash = base?.cast?.hash || base?.hash;
    if (!parentHash) throw new Error('No parent hash returned from publishCast');
    const reply = await fc.replyCast(parentHash, 'Reply test successful ✅');
    console.log(JSON.stringify({ status: 'ok', base, reply }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

main();