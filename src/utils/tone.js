import { recordTrace } from './trace.js';

// Tone catalog with light style hints and emoji sets
const TONES = {
  playful_genz: { emojis: ['🔥','😎','✨','🌞'], style: 'Playful, Gen-Z, fun, relaxed. Light slang, concise.' },
  calm_cozy: { emojis: ['🌧️','☕','🧣','🌫️'], style: 'Calm, cozy, gentle. Warm phrasing, inviting.' },
  witty_sarcastic: { emojis: ['🧣','💨','😅'], style: 'Witty, lightly sarcastic, minimal snark. Keep it friendly.' },
  thoughtful_poetic: { emojis: ['✨','🌇','🌙'], style: 'Thoughtful, slightly poetic, grounded. Keep it real.' },
  casual: { emojis: ['😄','🙂','✨'], style: 'Friendly, emoji-rich, relaxed and human.' },
  formal: { emojis: ['💼','✅'], style: 'Polite, efficient, professional tone.' },
  reflective: { emojis: ['🤔','🌙','✨'], style: 'Calm, reflective, slightly philosophical.' },
  crypto_trendy: { emojis: ['📈','🪙','🚀','✨'], style: 'Crypto-aware, friendly, simple. Trendy but calm; no financial advice.' }
};

function pickEmoji(name) {
  const set = TONES[name]?.emojis || [];
  if (!set.length) return '';
  return set[Math.floor(Math.random() * set.length)];
}

function getLocalHourFromWeather(data) {
  try {
    const dt = Number(data?.dt);
    const tz = Number(data?.timezone);
    if (!Number.isFinite(dt) || !Number.isFinite(tz)) return null;
    const localMs = (dt + tz) * 1000;
    const hour = new Date(localMs).getUTCHours();
    return Number.isFinite(hour) ? hour : null;
  } catch (_) {
    return null;
  }
}

export function detectTopicTone(text) {
  const t = String(text || '').toLowerCase();
  const cryptoHints = [
    'crypto','bitcoin','btc','eth','ethereum','sol','solana','ton','doge','shib','apt','sui','arb','arbitrum','op','optimism','token','price','market','chart','gas','fee','airdrop','staking','yield','defi','nft','protocol','chain','layer2','l2','layer1','l1','exchange','dex','cex','bull','bear'
  ];
  const formalHints = ['meeting','plan','deadline','schedule','proposal','review','deliverable','client'];
  const reflectiveHints = ['life','meaning','think','thought','why','feeling','quiet','night'];
  const casualHints = ['haha','lol','bro','omg','right','totally','yeah','hey'];
  if (cryptoHints.some(k => t.includes(k))) return 'crypto_trendy';
  if (formalHints.some(k => t.includes(k))) return 'formal';
  if (reflectiveHints.some(k => t.includes(k))) return 'reflective';
  if (casualHints.some(k => t.includes(k))) return 'casual';
  return 'casual';
}

export function selectWeatherTone(data) {
  const temp = Number(data?.main?.temp);
  const cond = String(data?.weather?.[0]?.description || data?.weather?.[0]?.main || '').toLowerCase();
  const wind = Number(data?.wind?.speed);
  const hour = getLocalHourFromWeather(data);

  // Evening / Golden hour preference
  if (Number.isFinite(hour) && hour >= 17 && hour <= 19) return 'thoughtful_poetic';

  const isSunny = cond.includes('sun') || cond.includes('clear');
  const isRainy = cond.includes('rain') || cond.includes('drizzle');
  const isCloudy = cond.includes('cloud');
  const isWindy = Number.isFinite(wind) && wind >= 8; // ~moderate breeze

  if ((Number.isFinite(temp) && temp >= 30) || (isSunny && Number.isFinite(temp) && temp >= 27)) {
    return 'playful_genz';
  }
  if (isRainy || isCloudy) {
    return 'calm_cozy';
  }
  if ((Number.isFinite(temp) && temp <= 12) || isWindy) {
    return 'witty_sarcastic';
  }
  return 'casual';
}

export function tonePrompt(name) {
  const base = TONES[name]?.style || 'Stay human and grounded.';
  const extra = name === 'crypto_trendy'
    ? ' Keep it friendly, on-topic, and clearly not financial advice.'
    : '';
  return `${base}.${extra} Use common words. Place one emoji at the end only.`;
}

export function applyWeatherTone(city, temp, cond, name) {
  const t = Math.round(Number.isFinite(temp) ? temp : 0);
  const c = (cond || '').toLowerCase();
  // Always lead with real data, then add simple tone flavor. No em dashes. Emoji at end only.
  let base;
  switch (name) {
    case 'playful_genz':
      base = `${city} feels around ${t}°C, ${c}. Easy vibes today`;
      break;
    case 'calm_cozy':
      base = `${city} feels around ${t}°C, ${c}. Cozy and gentle`;
      break;
    case 'witty_sarcastic':
      base = `${city} feels around ${t}°C, ${c}. Better bring a scarf`;
      break;
    case 'thoughtful_poetic':
      base = `${city} feels around ${t}°C, ${c}. Quiet and steady`;
      break;
    default:
      base = `${city} feels around ${t}°C, ${c}.`;
  }
  return finalizeReply(base, name);
}

export function chooseTone({ weatherData, topicText }) {
  const override = String(process.env.AIYRA_TONE_MODE || '').trim().toLowerCase();
  let name = null;
  if (override) name = override;
  else if (weatherData) name = selectWeatherTone(weatherData);
  else name = detectTopicTone(topicText);
  recordTrace(`[tone] selected ${name || 'unknown'}`, 'info', { tone: name || 'unknown' });
  return name || 'casual';
}

// Normalize any reply to keep emoji at the end, avoid em dashes, and simplify spacing.
export function finalizeReply(text, toneName = 'casual') {
  let cleaned = String(text || '').trim();
  // Replace em/en dashes with commas
  cleaned = cleaned.replace(/[—–]+/g, ',');
  // Remove mid-sentence emojis
  cleaned = cleaned.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}]/gu, '');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  // Ensure punctuation looks natural
  cleaned = cleaned.replace(/\s*\.,/g, '.');
  // Append a single emoji at the end
  const emoji = pickEmoji(toneName) || '✨';
  return `${cleaned} ${emoji}`.trim();
}