import express from 'express';
import dotenv from 'dotenv';
import FarcasterService from './services/farcaster.js';
import logger from './utils/logger.js';
import axios from 'axios';
import { recordTrace, getTraces } from './utils/trace.js';
import { isHandled, markHandled, getKVClient, getLastProcessedTS, setLastProcessedTS, getLastPollTS, setLastPollTS, getPollIntervalOverride, setPollIntervalOverride, clearPollIntervalOverride } from './utils/handled.js';
import {
  handleWeatherIntent,
  handleZodiacVibe,
  handleFortuneBloom,
  generateReply,
  generateDailyGreeting,
  detectPersonalIntent,
  handlePersonalReply
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

// Helper to normalize hash across different payload shapes
function getCastHash(cast) {
  return (
    cast?.hash ||
    cast?.cast?.hash ||
    cast?.data?.hash ||
    cast?.message?.hash ||
    cast?.post?.hash ||
    cast?.body?.hash ||
    null
  );
}

// Try to derive a timestamp (ms since epoch) from various cast shapes
function getCastTimestamp(cast) {
  const candidates = [
    cast?.timestamp,
    cast?.cast?.timestamp,
    cast?.published_at,
    cast?.created_at,
    cast?.data?.timestamp,
    cast?.message?.timestamp
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const num = Number(c);
    if (Number.isFinite(num)) {
      // Heuristic: seconds vs milliseconds
      return num < 1e12 ? (num * 1000) : num;
    }
    const parsed = Date.parse(String(c));
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

// Polling routine: fetch mentions, log start/end, and process new ones
async function pollMentions() {
  const startTs = new Date().toISOString();
  logger.info(`[poll] start ${startTs}`);
  recordTrace(`[poll] start ${startTs}`, 'info');
  try { await setLastPollTS(Date.now()); } catch (_) {}
  try {
    const casts = await getFarcaster().getRecentMentions();
    const lastTs = await getLastProcessedTS();
    const timestamps = casts.map(c => ({ c, ts: getCastTimestamp(c), h: getCastHash(c) }));

    if (!Number.isFinite(lastTs)) {
      // Initialize baseline to the newest cast timestamp to avoid backlog replies
      const newest = timestamps
        .map(x => x.ts)
        .filter(t => Number.isFinite(t))
        .sort((a, b) => b - a)[0];
      if (Number.isFinite(newest)) {
        await setLastProcessedTS(newest);
        logger.info(`[poll] initialized baseline last_ts=${newest}`);
        recordTrace(`[poll] initialized baseline last_ts=${newest}`, 'info');
      } else {
        logger.info(`[poll] no timestamps found to initialize baseline`);
        recordTrace(`[poll] no timestamps found to initialize baseline`, 'info');
      }
      const endTs = new Date().toISOString();
      logger.info(`[poll] end ${endTs}`);
      return { total: casts.length, new: 0, initialized: true };
    }

    // Only consider casts newer than the last processed timestamp
    const recent = timestamps.filter(x => Number.isFinite(x.ts) && x.ts > lastTs);
    let skippedHandled = 0;
    let skippedBacklog = casts.length - recent.length;
    const newCasts = [];
    for (const { c, h } of recent) {
      const handled = await isHandled(h);
      if (!handled) newCasts.push(c);
      else skippedHandled++;
    }
    logger.info(`[poll] mentions total=${casts.length} new=${newCasts.length} skipped_backlog=${skippedBacklog} skipped_handled=${skippedHandled}`);
    recordTrace(`[poll] summary total=${casts.length} new=${newCasts.length} skipped_backlog=${skippedBacklog} skipped_handled=${skippedHandled}`, 'info');

    // Process new mentions
    let maxTsProcessed = lastTs;
    for (const cast of newCasts) {
      await handleMention(cast);
      const ts = getCastTimestamp(cast);
      if (Number.isFinite(ts) && ts > maxTsProcessed) maxTsProcessed = ts;
    }
    // Update the last processed timestamp if we processed any
    if (Number.isFinite(maxTsProcessed) && maxTsProcessed > lastTs) {
      await setLastProcessedTS(maxTsProcessed);
      logger.info(`[poll] updated last_ts=${maxTsProcessed}`);
      recordTrace(`[poll] updated last_ts=${maxTsProcessed}`, 'info');
    }

    const endTs = new Date().toISOString();
    logger.info(`[poll] end ${endTs}`);
    return { total: casts.length, new: newCasts.length, skipped_backlog: skippedBacklog, skipped_handled: skippedHandled };
  } catch (error) {
    logger.error(`[poll] error ${error.message}`);
    recordTrace(`[poll] error ${error.message}`, 'error');
    return { error: error.message };
  }
}

// Weather intent is parsed inside handleWeatherIntent

// Helper function to extract zodiac sign name from text
function extractZodiacSign(text) {
  const signs = [
    'aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'
  ];
  const lower = text.toLowerCase();
  return signs.find(s => lower.includes(s)) || null;
}

// Handle incoming mentions
async function handleMention(cast) {
  try {
    const hash = getCastHash(cast);
    if (await isHandled(hash)) {
      logger.info(`[mention] skip handled hash=${hash}`);
      recordTrace(`[mention] skip handled hash=${hash}`, 'info', { hash });
      return;
    }
    const textLower = (cast.text || cast?.cast?.text || '').toLowerCase();
    const originalText = cast.text || cast?.cast?.text || '';
    let response;

    logger.info(`[mention] start hash=${cast.hash} text="${originalText}"`);
    recordTrace(`[mention] start hash=${cast.hash}`, 'info', { hash: cast.hash });

    // Check for personal Q&A intents
    const personalKind = detectPersonalIntent(textLower);
    if (personalKind) {
      logger.info('[mention] route=personal');
      recordTrace('[mention] route=personal', 'info', { hash: cast.hash, kind: personalKind });
      response = handlePersonalReply(personalKind);
    }
    // Check for weather request
    else if (textLower.includes('weather')) {
      logger.info('[mention] route=weather');
      recordTrace('[mention] route=weather', 'info', { hash: cast.hash });
      response = await handleWeatherIntent(originalText);
    }
    // Check for zodiac request
    else if (textLower.includes('zodiac') || textLower.includes('horoscope')) {
      logger.info('[mention] route=zodiac');
      recordTrace('[mention] route=zodiac', 'info', { hash: cast.hash });
      const sign = extractZodiacSign(textLower);
      if (sign) {
        response = await generateReply(`Short, thoughtful horoscope for ${sign}, grounded and human.`);
      } else {
        response = "Tell me your sign, and I'll read the stars for you.";
      }
    }
    // Check for fortune request
    else if (textLower.includes('fortune') || textLower.includes('tell me something')) {
      logger.info('[mention] route=fortune');
      recordTrace('[mention] route=fortune', 'info', { hash: cast.hash });
      response = await generateReply('Give me a calm, grounded one-line fortune with poetic realism.');
    }
    // Default response
    else {
      logger.info('[mention] route=default');
      recordTrace('[mention] route=default', 'info', { hash: cast.hash });
      response = await generateReply(originalText);
    }

    await getFarcaster().replyCast(hash, response);
    await markHandled(hash);
    logger.info(`[mention] replied hash=${hash} len=${(response||'').length}`);
    recordTrace(`[mention] replied hash=${hash} len=${(response||'').length}`, 'info', { hash });
  } catch (error) {
    logger.error(`Error handling mention: ${error.message}`);
    recordTrace(`Mention error: ${error.message}`, 'error');
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

// Manual test endpoint to verify publishing and replying
app.get('/test-reply', async (req, res) => {
  try {
    const fc = getFarcaster();
    const base = await fc.publishCast('Testing reply flow from Aiyra ✨');
    const parentHash = base?.cast?.hash || base?.hash;
    if (!parentHash) throw new Error('No parent hash returned from publishCast');
    const reply = await fc.replyCast(parentHash, 'Reply test successful ✅');
    res.status(200).json({ status: 'ok', message: '[signer] reply ok', base, reply });
  } catch (error) {
    logger.error(`test-reply error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Manual test endpoint to verify weather reply formatting and data accuracy
app.get('/test-weather', async (req, res) => {
  try {
    const city = String(req.query.city || 'Tokyo').trim();
    const text = `weather in ${city}`;
    const message = await handleWeatherIntent(text);
    res.status(200).json({ status: 'ok', city, message });
  } catch (error) {
    logger.error(`test-weather error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for mentions
app.post('/webhook', async (req, res) => {
  try {
    // Snapshot raw payload for debugging (temporary)
    try {
      const raw = JSON.stringify(req.body);
      logger.info(`[webhook] raw payload len=${raw?.length || 0} body=${raw}`);
      recordTrace(`[webhook] raw payload len=${raw?.length || 0}`, 'info');
    } catch (e) {
      logger.error(`[webhook] failed to stringify body: ${e.message}`);
      recordTrace(`[webhook] failed to stringify body: ${e.message}`, 'error');
    }
    // Accept multiple webhook envelope shapes
    const cast = req.body?.cast
      || req.body?.data?.cast
      || req.body?.event?.cast
      || req.body?.message?.cast
      || req.body?.payload?.cast
      || req.body?.body?.cast
      || req.body?.cast?.cast
      || req.body?.data?.message?.cast
      || req.body?.message?.data?.cast;
    const fid = Number(process.env.FARCASTER_FID);
    const username = (process.env.FARCASTER_USERNAME || 'agent-aiyra').toLowerCase();

    // Extract text with fallbacks
    const text = (cast?.text
      || cast?.cast?.text
      || cast?.post?.text
      || cast?.data?.text
      || cast?.body?.text
      || '') + '';

    // Normalize possible mention fid arrays/objects
    const rawMentionCandidates = [];
    if (Array.isArray(cast?.mentions)) rawMentionCandidates.push(...cast.mentions);
    if (Array.isArray(cast?.mentionFids)) rawMentionCandidates.push(...cast.mentionFids);
    if (Array.isArray(cast?.mentioned_fids)) rawMentionCandidates.push(...cast.mentioned_fids);
    if (Array.isArray(cast?.mentionedProfiles)) rawMentionCandidates.push(...cast.mentionedProfiles);
    if (Array.isArray(cast?.mentioned_profiles)) rawMentionCandidates.push(...cast.mentioned_profiles);
    if (Array.isArray(cast?.cast?.mentioned_profiles)) rawMentionCandidates.push(...cast.cast.mentioned_profiles);

    const mentionFids = rawMentionCandidates
      .map(m => {
        if (typeof m === 'number') return m;
        if (typeof m === 'string') return Number(m);
        if (m && typeof m === 'object') {
          return Number(m.fid || m.user?.fid || m.profile?.fid);
        }
        return undefined;
      })
      .filter(v => Number.isFinite(v));

    const mentionedUsernames = rawMentionCandidates
      .map(m => {
        if (m && typeof m === 'object') {
          return (m.username || m.user?.username || m.profile?.username || '').toLowerCase();
        }
        return '';
      })
      .filter(u => !!u);

    const includesFid = mentionFids.includes(fid);
    const usernamePattern = new RegExp(`@${username.replace(/[-_]/g, '[-_ ]?')}`, 'i');
    const includesUsername = usernamePattern.test(text.toLowerCase())
      || mentionedUsernames.includes(username);

    logger.info(`Webhook received: fid=${fid} includesFid=${includesFid} includesUsername=${includesUsername} text="${text}"`);
    recordTrace(`Webhook received fid=${fid} includesFid=${includesFid} includesUsername=${includesUsername}`, 'info');

    const hash = getCastHash(cast);
    if (cast && (includesFid || includesUsername)) {
      if (await isHandled(hash)) {
        logger.info(`[webhook] skipping handled hash=${hash}`);
        recordTrace(`[webhook] skipping handled hash=${hash}`, 'info', { hash });
        return res.status(200).json({ status: 'ok', message: 'Already handled' });
      }
      // Await mention handling to ensure serverless runtime does not terminate early
      try {
        await handleMention(cast);
        res.status(200).json({ status: 'ok', message: 'Reply processed' });
      } catch (error) {
        logger.error(`Async mention handling error: ${error.message}`);
        res.status(500).json({ error: 'Failed to process mention' });
      }
    } else {
      res.status(200).json({ status: 'ok', message: 'No relevant mention found' });
    }
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Environment check endpoint (booleans only)
app.get('/env', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: '[signer] reply ok',
    env: {
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
      WEATHER_API_KEY: Boolean(process.env.WEATHER_API_KEY),
      FARCASTER_NEYNAR_API_KEY: Boolean(process.env.FARCASTER_NEYNAR_API_KEY),
      FARCASTER_SIGNER_UUID: Boolean(process.env.FARCASTER_SIGNER_UUID),
      FARCASTER_FID: Boolean(process.env.FARCASTER_FID),
      FARCASTER_USERNAME: Boolean(process.env.FARCASTER_USERNAME || 'agent-aiyra'),
      KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
    }
  });
});

// KV connectivity check endpoint (diagnostics only)
app.get('/kv-check', async (req, res) => {
  try {
    const envFlags = {
      KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
    };
    const kv = getKVClient();
    if (!kv) {
      return res.status(200).json({ status: 'ok', kv: { connected: false, envFlags, message: 'KV client not initialized' } });
    }
    try {
      const key = 'aiyra:kv_check';
      const now = Date.now();
      await kv.set(key, now, { ex: 60 });
      const got = await kv.get(key);
      const ok = Boolean(got);
      return res.status(200).json({ status: 'ok', kv: { connected: ok, envFlags } });
    } catch (e) {
      return res.status(200).json({ status: 'ok', kv: { connected: false, envFlags, error: e.message } });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Poll status diagnostics endpoint
app.get('/poll-status', async (req, res) => {
  try {
    const lastPoll = await getLastPollTS();
    const lastProcessed = await getLastProcessedTS();
    res.status(200).json({ status: 'ok', poll: { lastPollTS: lastPoll, lastProcessedTS: lastProcessed } });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Convenience endpoint to inspect last poll and processed timestamps
app.get('/last-ts', async (req, res) => {
  try {
    const lastPoll = await getLastPollTS();
    const lastProcessed = await getLastProcessedTS();
    res.status(200).json({ status: 'ok', lastPollTS: lastPoll, lastProcessedTS: lastProcessed });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Temporary logs endpoint for debugging
app.get('/logs', (req, res) => {
  const limit = Number(req.query.limit) || 200;
  res.status(200).json({ status: 'ok', message: '[signer] reply ok', logs: getTraces(limit) });
});

// Start the server (Railway / persistent runtime)
const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => {
  logger.info(`✨ Aiyra server listening on port ${port}`);
  // Initialize background poller and watch for KV override changes
  (async () => {
    try {
      await startOrUpdateBackgroundTimer();
      // Check override every 60s and adjust interval if changed
      setInterval(async () => {
        try { await startOrUpdateBackgroundTimer(); } catch (_) {}
      }, 60 * 1000);
    } catch (e) {
      logger.error(`[bg] init error: ${e.message}`);
      recordTrace(`[bg] init error: ${e.message}`, 'error');
    }
  })();
});

// Admin: view current and effective poll interval
app.get('/admin/poll-interval', async (req, res) => {
  try {
    const override = await getPollIntervalOverride();
    const effective = await getEffectiveIntervalMs();
    res.status(200).json({ status: 'ok', interval: { overrideMs: override, effectiveMs: effective, envDefaultMs: BG_ENV_INTERVAL_MS } });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Admin: update poll interval override (requires ADMIN_TOKEN)
app.post('/admin/poll-interval', async (req, res) => {
  try {
    const required = String(process.env.ADMIN_TOKEN || '').trim();
    const provided = String(req.headers['x-admin-token'] || req.query.token || (req.body ? req.body.token : '') || '').trim();
    if (!required || !provided || required !== provided) {
      return res.status(403).json({ status: 'forbidden', message: 'Invalid admin token' });
    }
    const raw = (req.body && (req.body.ms ?? req.body.intervalMs)) ?? req.query.ms ?? req.query.intervalMs;
    const s = String(raw || '').trim().toLowerCase();
    if (!s || s === 'clear' || s === '0') {
      await clearPollIntervalOverride();
      await startOrUpdateBackgroundTimer();
      const effective = await getEffectiveIntervalMs();
      recordTrace('[admin] cleared poll interval override', 'info');
      return res.status(200).json({ status: 'ok', interval: { overrideMs: null, effectiveMs: effective } });
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid interval ms' });
    }
    await setPollIntervalOverride(n);
    await startOrUpdateBackgroundTimer();
    const effective = await getEffectiveIntervalMs();
    recordTrace(`[admin] set poll interval override ms=${n}`, 'info');
    res.status(200).json({ status: 'ok', interval: { overrideMs: n, effectiveMs: effective } });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});
// Background poll manager (supports hot-reload interval override via KV)
let BG_DISABLE = String(process.env.POLL_DISABLE || '').toLowerCase() === 'true';
let BG_MIN_INTERVAL_MS = Number(process.env.MIN_POLL_INTERVAL_MS || (60 * 1000));
let BG_MAX_INTERVAL_MS = Number(process.env.MAX_POLL_INTERVAL_MS || (60 * 60 * 1000));
let BG_ENV_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || (5 * 60 * 1000));
let bgPolling = false;
let bgTimer = null;
let bgIntervalMs = null;

function clampInterval(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(BG_MIN_INTERVAL_MS, Math.min(n, BG_MAX_INTERVAL_MS));
}

async function getEffectiveIntervalMs() {
  const override = await getPollIntervalOverride();
  const base = Number.isFinite(override) ? override : BG_ENV_INTERVAL_MS;
  const clamped = clampInterval(base);
  return clamped || BG_ENV_INTERVAL_MS;
}

async function startOrUpdateBackgroundTimer() {
  if (BG_DISABLE) {
    logger.info('[bg] background polling disabled');
    recordTrace('[bg] background polling disabled', 'info');
    if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
    return;
  }
  const desired = await getEffectiveIntervalMs();
  if (!Number.isFinite(desired) || desired <= 0) return;
  if (bgTimer && bgIntervalMs === desired) return;
  if (bgTimer) clearInterval(bgTimer);
  bgIntervalMs = desired;
  logger.info(`[bg] polling interval set to ${bgIntervalMs}ms`);
  recordTrace(`[bg] polling interval set to ${bgIntervalMs}ms`, 'info');
  bgTimer = setInterval(async () => {
    if (bgPolling) return;
    bgPolling = true;
    try {
      await pollMentions();
    } catch (e) {
      logger.error(`[bg] poll error: ${e.message}`);
      recordTrace(`[bg] poll error: ${e.message}`, 'error');
    } finally {
      bgPolling = false;
    }
  }, bgIntervalMs);
}