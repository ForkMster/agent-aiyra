import dotenv from 'dotenv';
import axios from 'axios';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';

dotenv.config();

function sanitize(str) {
  return String(str || '')
    .replace(/^\s*["']|["']\s*$/g, '')
    .trim();
}

async function listWebhooks(client, apiKey) {
  // Try SDK methods first, then fall back to raw HTTP
  if (typeof client.listWebhooks === 'function') {
    return await client.listWebhooks();
  }
  if (typeof client.getWebhooks === 'function') {
    return await client.getWebhooks();
  }
  const resp = await axios.get('https://api.neynar.com/v2/webhooks', {
    headers: { 'X-Api-Key': apiKey }
  });
  return resp.data;
}

async function deleteWebhook(client, apiKey, webhookId) {
  if (typeof client.deleteWebhook === 'function') {
    return await client.deleteWebhook({ webhook_id: webhookId });
  }
  const url = `https://api.neynar.com/v2/webhooks/${webhookId}`;
  const resp = await axios.delete(url, {
    headers: { 'X-Api-Key': apiKey }
  });
  return resp.data;
}

async function main() {
  const apiKeyRaw = process.env.FARCASTER_NEYNAR_API_KEY;
  const targetUrlRaw = process.env.WEBHOOK_URL;

  const apiKey = sanitize(apiKeyRaw);
  let targetUrl = sanitize(targetUrlRaw);
  // Guard against accidental trailing characters like ')' in pasted URLs
  targetUrl = targetUrl.replace(/\)+$/g, '');

  if (!apiKey) {
    console.error('Missing FARCASTER_NEYNAR_API_KEY');
    process.exit(1);
  }
  if (!targetUrl) {
    console.error('Missing WEBHOOK_URL');
    process.exit(1);
  }

  const client = new NeynarAPIClient(new Configuration({ apiKey }));

  try {
    const list = await listWebhooks(client, apiKey);
    const webhooks = list?.webhooks || list?.data || list || [];
    if (!Array.isArray(webhooks)) {
      console.error('Unexpected webhook list shape:', webhooks);
      process.exit(1);
    }

    const keep = [];
    const remove = [];
    for (const wh of webhooks) {
      const url = sanitize(wh?.target_url || wh?.url);
      const title = wh?.title || wh?.name || '';
      const id = wh?.webhook_id || wh?.id || wh?.uid;
      const active = wh?.active !== false; // default to true if missing
      if (!id) continue;
      if (url === targetUrl && active) keep.push({ id, url, title });
      else if (/aiyra mentions webhook/i.test(title) || active) remove.push({ id, url, title });
    }

    // If none match target URL, do nothing destructive and exit with info
    if (keep.length === 0) {
      console.log(JSON.stringify({ status: 'noop', message: 'No active webhooks matching target URL; not deleting anything', targetUrl }, null, 2));
      process.exit(0);
    }

    // Delete all except the first keep entry (preserve one active webhook)
    const preserveId = keep[0].id;
    const toDelete = remove.filter(r => r.id !== preserveId);
    const results = [];
    for (const r of toDelete) {
      try {
        const resp = await deleteWebhook(client, apiKey, r.id);
        results.push({ id: r.id, url: r.url, title: r.title, deleted: true, resp });
      } catch (err) {
        results.push({ id: r.id, url: r.url, title: r.title, deleted: false, error: err.message });
      }
    }

    console.log(JSON.stringify({ status: 'ok', preserved: keep[0], deleted: results }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error.message);
    process.exit(1);
  }
}

main();