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
  const raw = String(cond || '').trim();
  const c = raw.toLowerCase();

  function pickWeatherEmoji(tempC, condLower) {
    const cold = tempC <= 5;
    const hot = tempC >= 28;
    const isSnow = condLower.includes('snow');
    const isRain = condLower.includes('rain') || condLower.includes('drizzle');
    const isThunder = condLower.includes('thunder') || condLower.includes('storm');
    const isFog = condLower.includes('fog') || condLower.includes('mist') || condLower.includes('haze');
    const isCloud = condLower.includes('cloud');
    const isClear = condLower.includes('clear') || condLower.includes('sun') || condLower.includes('sky');

    if (isThunder) return '⚡';
    if (isSnow) return '❄️';
    if (isRain) return '☔';
    if (isFog) return '🌫️';
    if (cold && (isClear || isCloud)) return '🧣';
    if (isCloud) return '☁️';
    if (isClear) return hot ? '🌞' : '☀️';
    return '✨';
  }

  function buildSuggestion(tempC, condLower) {
    const cold = tempC <= 5;
    const chilly = tempC > 5 && tempC <= 12;
    const mild = tempC > 12 && tempC <= 20;
    const warm = tempC > 20 && tempC <= 27;
    const hot = tempC >= 28;
    const isSnow = condLower.includes('snow');
    const isRain = condLower.includes('rain') || condLower.includes('drizzle');
    const isThunder = condLower.includes('thunder') || condLower.includes('storm');
    const isFog = condLower.includes('fog') || condLower.includes('mist') || condLower.includes('haze');
    const isCloud = condLower.includes('cloud');
    const isClear = condLower.includes('clear') || condLower.includes('sun') || condLower.includes('sky');

    if (isThunder) return 'It’s stormy, best to stay indoors.';
    if (isSnow) return 'It’s snowy and cold, bundle up.';
    if (isRain) return condLower.includes('drizzle')
      ? 'Light rain today, a cozy cafe could be nice.'
      : 'It’s rainy, grab an umbrella.';
    if (isFog) return 'It’s foggy, move with care.';
    if (isCloud) {
      if (cold) return 'Cloudy and cold, bring layers.';
      if (chilly) return 'Cloudy and cool, a light jacket helps.';
      return 'Cloudy and soft, good for a calm stroll.';
    }
    if (isClear) {
      if (cold) return 'It’s pretty chilly and clear, better take a scarf!';
      if (chilly) return 'It’s cool and clear, a light jacket helps.';
      if (mild) return 'It’s calm and clear, perfect for a walk outside.';
      if (warm) return 'Warm and clear, good time to be outside.';
      if (hot) return 'It’s hot and clear, stay cool and hydrated.';
    }
    if (hot) return 'It’s hot, find shade and hydrate.';
    if (cold) return 'It’s very cold, bundle up well.';
    return 'Feels simple and steady, enjoy your day.';
  }

  const main = `${city} feels around ${t}°C, ${raw || c}.`;
  const suggestion = buildSuggestion(t, c);
  const emoji = pickWeatherEmoji(t, c);
  const combined = `${main} ${suggestion}`;
  return finalizeReply(combined, name, emoji);
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
export function finalizeReply(text, toneName = 'casual', overrideEmoji = null) {
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
  const emoji = overrideEmoji || pickEmoji(toneName) || '✨';
  return `${cleaned} ${emoji}`.trim();
}