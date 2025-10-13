import dotenv from 'dotenv';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';

dotenv.config();

async function main() {
  const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
  const fidEnv = process.env.FARCASTER_FID;
  const webhookUrl = process.env.WEBHOOK_URL;

  if (!apiKey) {
    console.error('Missing FARCASTER_NEYNAR_API_KEY');
    process.exit(1);
  }
  if (!fidEnv) {
    console.error('Missing FARCASTER_FID');
    process.exit(1);
  }
  if (!webhookUrl) {
    console.error('Missing WEBHOOK_URL');
    process.exit(1);
  }

  const fid = Number(fidEnv);
  const client = new NeynarAPIClient(new Configuration({ apiKey }));

  try {
    // Create a webhook that triggers on casts that mention our FID
    const subscription = {
      'cast.created': {
        mentioned_fids: [fid]
      }
    };

    const resp = await client.publishWebhook({
      name: 'Aiyra Mentions Webhook',
      url: webhookUrl,
      subscription
    });

    const created = Boolean(resp?.webhook);
    const message = resp?.message || '';
    if (created || /webhook created/i.test(message)) {
      console.log(JSON.stringify({ status: 'ok', webhook: resp.webhook || null, message }, null, 2));
      process.exit(0);
    }
    console.error('Webhook creation did not report success:', message || resp);
    process.exit(1);
  } catch (error) {
    console.error('Failed to create webhook:', error.message);
    process.exit(1);
  }
}

main();