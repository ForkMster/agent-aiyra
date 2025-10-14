import { recordTrace } from './trace.js';

// Tone catalog with light style hints and emoji sets
const TONES = {
  playful_genz: { emojis: ['🔥','😎','✨','🌞'], style: 'Playful, Gen-Z, fun, relaxed. Light slang, concise.' },
  calm_cozy: { emojis: ['🌧️','☕','🧣','🌫️'], style: 'Calm, cozy, gentle. Warm phrasing, inviting.' },
  witty_sarcastic: { emojis: ['🧣','💨','😅'], style: 'Witty, lightly sarcastic, minimal snark. Keep it friendly.' },
  thoughtful_poetic: { emojis: ['✨','🌇','🌙'], style: 'Thoughtful, slightly poetic, grounded. Keep it real.' },
  casual: { emojis: ['😄','🙂','✨'], style: 'Friendly, emoji-rich, relaxed and human.' },
  formal: { emojis: ['💼','✅'], style: 'Polite, efficient, professional tone.' },
  reflective: { emojis: ['🤔','🌙','✨'], style: 'Calm, reflective, slightly philosophical.' }
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
  const formalHints = ['meeting','plan','deadline','schedule','proposal','review','deliverable','client'];
  const reflectiveHints = ['life','meaning','think','thought','why','feeling','quiet','night'];
  const casualHints = ['haha','lol','bro','omg','right','totally','yeah','hey'];
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
  const emoji = pickEmoji(name);
  return `${base} Use 0–2 fitting emojis like ${emoji || '✨'} when natural.`;
}

export function applyWeatherTone(city, temp, cond, name) {
  const emoji = pickEmoji(name);
  const t = Math.round(Number.isFinite(temp) ? temp : 0);
  const c = (cond || '').toLowerCase();
  // Always lead with real data, then add tone flavor without em dashes
  switch (name) {
    case 'playful_genz':
      return `${city} feels around ${t}°C, ${c}. ${emoji || '🔥'} Chill vibes only`;
    case 'calm_cozy':
      return `${city} feels around ${t}°C, ${c}. Perfect for tea and slow moments ${emoji || '🌧️'}`;
    case 'witty_sarcastic':
      return `${city} feels around ${t}°C, ${c}. ${emoji || '🧣'} Dramatic skies, bring the scarf`;
    case 'thoughtful_poetic':
      return `${city} feels around ${t}°C, ${c}. The kind of weather that makes you think a little ${emoji || '✨'}`;
    default:
      return `${city} feels around ${t}°C, ${c}. ${emoji || '✨'} Easy day`;
  }
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