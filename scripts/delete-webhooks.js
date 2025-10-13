import dotenv from 'dotenv';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';

dotenv.config();

function sanitize(str) {
  return String(str || '')
    .replace(/^\s*["']|["']\s*$/g, '')
    .trim();
}

async function main() {
  const apiKey = sanitize(process.env.FARCASTER_NEYNAR_API_KEY);
  const rawIds = sanitize(process.env.DELETE_WEBHOOK_IDS);
  if (!apiKey) {
    console.error('Missing FARCASTER_NEYNAR_API_KEY');
    process.exit(1);
  }
  if (!rawIds) {
    console.error('Missing DELETE_WEBHOOK_IDS');
    process.exit(1);
  }
  const ids = rawIds.split(',').map(s => sanitize(s)).filter(Boolean);
  const client = new NeynarAPIClient(new Configuration({ apiKey }));

  const results = [];
  for (const id of ids) {
    try {
      const resp = await client.deleteWebhook({ webhook_id: id });
      results.push({ id, deleted: true, resp });
    } catch (err) {
      results.push({ id, deleted: false, error: err.message });
    }
  }
  console.log(JSON.stringify({ status: 'ok', results }, null, 2));
  process.exit(0);
}

main();