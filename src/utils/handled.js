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