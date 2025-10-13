const buffer = [];
const MAX = 300;

export function recordTrace(message, level = 'info', meta = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message: String(message),
      meta
    };
    buffer.push(entry);
    if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  } catch (_) {
    // best-effort; avoid crashing on trace failure
  }
}

export function getTraces(limit = 200) {
  const n = Math.max(1, Number(limit) || 200);
  const start = Math.max(0, buffer.length - n);
  return buffer.slice(start);
}