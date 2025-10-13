import fs from 'fs';
import { Redis } from '@upstash/redis';

let redis = null;
function getRedis() {
  try {
    if (redis) return redis;
    const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
    const rawToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
    const url = String(rawUrl).replace(/^\s*["'`]|["'`]\s*$/g, '').trim();
    const token = String(rawToken).replace(/^\s*["'`]|["'`]\s*$/g, '').trim();
    if (url && token) {
      redis = new Redis({ url, token });
    }
  } catch (_) {}
  return redis;
}

const DEFAULT_PATH = process.env.HANDLED_PATH || '/tmp/aiyra-handled.json';
const MAX_ENTRIES = 5000;
const TTL_MS = Number(process.env.HANDLED_TTL_MS || (14 * 24 * 60 * 60 * 1000)); // 14 days
const TTL_SECONDS = Math.floor(TTL_MS / 1000);
const LAST_PROCESSED_TS_KEY = process.env.HANDLED_LAST_TS_KEY || 'aiyra:last_cast_ts';
const LAST_POLL_TS_KEY = process.env.HANDLED_LAST_POLL_TS_KEY || 'aiyra:last_poll_ts';
const POLL_INTERVAL_OVERRIDE_KEY = process.env.POLL_INTERVAL_OVERRIDE_KEY || 'aiyra:poll_interval_ms';

function safeLoad() {
  try {
    if (fs.existsSync(DEFAULT_PATH)) {
      const raw = fs.readFileSync(DEFAULT_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') return data;
    }
  } catch (_) {}
  return { items: {} };
}

function safeSave(store) {
  try {
    const dir = DEFAULT_PATH.substring(0, DEFAULT_PATH.lastIndexOf('/')) || '/tmp';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DEFAULT_PATH, JSON.stringify(store), 'utf8');
  } catch (_) {}
}

function prune(store) {
  try {
    const now = Date.now();
    const items = store.items || {};
    const keys = Object.keys(items);
    for (const k of keys) {
      const ts = Number(items[k] || 0);
      if (!Number.isFinite(ts) || now - ts > TTL_MS) {
        delete items[k];
      }
    }
    // Cap total entries
    const remaining = Object.keys(items);
    if (remaining.length > MAX_ENTRIES) {
      remaining.sort((a, b) => (items[a] - items[b]));
      const toRemove = remaining.slice(0, remaining.length - MAX_ENTRIES);
      for (const k of toRemove) delete items[k];
    }
  } catch (_) {}
}

export async function isHandled(hash) {
  if (!hash) return false;
  const client = getRedis();
  if (client) {
    try {
      const v = await client.get(`handled:${hash}`);
      return Boolean(v);
    } catch (_) {
      // fall through to fs
    }
  }
  const store = safeLoad();
  prune(store);
  return Boolean(store.items?.[hash]);
}

export async function markHandled(hash) {
  if (!hash) return;
  const client = getRedis();
  if (client) {
    try {
      await client.set(`handled:${hash}`, Date.now(), { ex: TTL_SECONDS });
      return;
    } catch (_) {
      // fall through to fs
    }
  }
  const store = safeLoad();
  prune(store);
  store.items = store.items || {};
  store.items[hash] = Date.now();
  safeSave(store);
}

export function clearHandled() {
  try { fs.unlinkSync(DEFAULT_PATH); } catch (_) {}
}

export function getKVClient() {
  return getRedis();
}

export async function getLastProcessedTS() {
  try {
    const client = getRedis();
    if (!client) return null;
    const v = await client.get(LAST_PROCESSED_TS_KEY);
    if (v === null || v === undefined) return null;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const d = Date.parse(String(v));
    return Number.isFinite(d) ? d : null;
  } catch (_) {
    return null;
  }
}

export async function setLastProcessedTS(ts) {
  try {
    const client = getRedis();
    if (!client) return;
    if (!Number.isFinite(ts)) return;
    await client.set(LAST_PROCESSED_TS_KEY, ts);
  } catch (_) {
    // ignore
  }
}

export async function getLastPollTS() {
  try {
    const client = getRedis();
    if (!client) return null;
    const v = await client.get(LAST_POLL_TS_KEY);
    if (v === null || v === undefined) return null;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const d = Date.parse(String(v));
    return Number.isFinite(d) ? d : null;
  } catch (_) {
    return null;
  }
}

export async function setLastPollTS(ts) {
  try {
    const client = getRedis();
    if (!client) return;
    if (!Number.isFinite(ts)) return;
    await client.set(LAST_POLL_TS_KEY, ts);
  } catch (_) {
    // ignore
  }
}

export async function getPollIntervalOverride() {
  try {
    const client = getRedis();
    if (!client) return null;
    const v = await client.get(POLL_INTERVAL_OVERRIDE_KEY);
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (_) {
    return null;
  }
}

export async function setPollIntervalOverride(ms) {
  try {
    const client = getRedis();
    if (!client) return;
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return;
    await client.set(POLL_INTERVAL_OVERRIDE_KEY, n);
  } catch (_) {
    // ignore
  }
}

export async function clearPollIntervalOverride() {
  try {
    const client = getRedis();
    if (!client) return;
    await client.del(POLL_INTERVAL_OVERRIDE_KEY);
  } catch (_) {
    // ignore
  }
}