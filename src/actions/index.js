import axios from 'axios';
import logger from '../utils/logger.js';
import { recordTrace } from '../utils/trace.js';
import { chooseTone, applyWeatherTone, tonePrompt, detectTopicTone, finalizeReply } from '../utils/tone.js';

export async function handleWeatherIntent(text) {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return "Hmm, my weather senses are quiet right now.";

  // Capture broader city names, including accents, hyphens, and apostrophes.
  // Also trim trailing punctuation like .,!? if present.
  const match = text.match(/weather\s+(?:in|of)?\s*([a-zA-Z\u00C0-\u017F\s'\-]+)/i);
  let city = match ? match[1].trim() : null;
  if (city) city = city.replace(/[\.,!?]+$/g, '').trim();
  if (!city) return "Could you tell me which city you’re curious about?";

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
    const response = await axios.get(url);
    const data = response.data;

    if (Number(data.cod) !== 200) {
      logger.error("Weather API error:", data);
      return `I tried checking, but ${city} seems a bit hidden from my sky view right now.`;
    }

    const temp = data.main?.temp;
    const condition = data.weather?.[0]?.description;
    const feels = data.main?.feels_like;

    const tone = chooseTone({ weatherData: data, topicText: text });
    recordTrace(`[tone] weather tone=${tone}`, 'info', { tone, city, condition, temp, feels });
    const formatted = applyWeatherTone(city, feels ?? temp ?? 0, condition, tone);
    return formatted;
  } catch (err) {
    logger.error("Weather fetch failed:", err.message || err);
    return "My weather senses got a bit cloudy, try again soon.";
  }
}

async function generateWithOpenAI(prompt) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Aiyra — casual, Gen-Z-friendly, warm, and quote-like. Sound natural and human. Prefer one or two sentences. Keep it real, calm, and grounded. Minimal emojis (0–1), no over-excitement, no cringe slang, no over-punctuation. Be concise, empathetic, and clear.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 180
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const text = resp.data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (e) {
    logger.error(`OpenAI generation failed: ${e.message}`);
    return null;
  }
}

function generateLocalFallback(context) {
  const t = (context || '').toLowerCase();
  if (t.includes('sadness')) {
    return 'Sadness passes; what stays is what it taught you.';
  }
  if (t.includes('love')) {
    return 'Love is consistent attention in small moments — simple and real.';
  }
  if (t.includes('fortune') || t.includes('luck')) {
    return 'Follow the small chances that feel right — that’s where luck lands.';
  }
  if (t.includes('thought') || t.includes('random')) {
    return 'Things get clearer with time and kind attention.';
  }
  return 'I’m here. Ask me anything — I’ll keep it calm and real.';
}

export async function generateReply(context) {
  const basePersonality = `You are Aiyra — calm, friendly, and human. Use simple, common words. Keep replies short (1–2 sentences), clear, and on-topic. No em dashes. Avoid abstract, overly poetic, or critical phrasing. Respond directly to the user's request: if it's a question, answer it; if it's a statement, offer a short, relevant thought. For crypto topics, keep it friendly and trendy, but clearly not financial advice. Add exactly one emoji at the END of the reply, never mid-sentence.`;
  const toneName = chooseTone({ topicText: context });
  const toneHint = tonePrompt(toneName);
  recordTrace(`[tone] general tone=${toneName}`, 'info', { tone: toneName });
  const personality = `${basePersonality}\nTone: ${toneHint}`;
  const prompt = `${personality}\n\nUser: ${context}\nAiyra:`;
  const ai = await generateWithOpenAI(prompt);
  const raw = (ai && ai.trim()) || generateLocalFallback(context);
  return finalizeReply(raw, toneName);
}

export function handleZodiacVibe(sign) {
  const vibes = {
    "♈": "Aries, your spark is steady and kind, let it lead.",
    "♉": "Taurus, simple moments feel rich today, stay grounded.",
    "♊": "Gemini, your thoughts are light and clear, share gently.",
    "♋": "Cancer, move with patience and care, soft steps.",
    "♌": "Leo, warm and calm, power without noise.",
    "♍": "Virgo, details feel easy today, keep it simple.",
    "♎": "Libra, balance feels natural, choose the lighter path.",
    "♏": "Scorpio, quiet depth, let curiosity guide you.",
    "♐": "Sagittarius, aim with ease, your horizon looks kind.",
    "♑": "Capricorn, steady climbs, gentle wins count too.",
    "♒": "Aquarius, calm waves, ideas land where they should.",
    "♓": "Pisces, drift with intention, imagination with roots."
  };
  const msg = vibes[sign] || "The stars are writing you a personal note. Check back in a moment.";
  return finalizeReply(msg, 'reflective');
}

export function handleFortuneBloom() {
  const fortunes = [
    "Your energy blooms where your attention goes.",
    "A gentle breeze may carry a nice surprise.",
    "Quiet moments often hold the clearest magic.",
    "Your path will feel clearer step by step.",
    "Good things take root when you choose them.",
    "Kindness travels further than you think.",
    "Soft truths can be the strongest.",
    "A small surprise might be nearby."
  ];
  const msg = fortunes[Math.floor(Math.random() * fortunes.length)];
  return finalizeReply(msg, 'casual');
}

export function generateDailyGreeting() {
  const greetings = [
    "Today feels soft, let it be simple.",
    "A calm day is a good day.",
    "Keep it light, move with ease.",
    "Quiet energy, steady steps.",
    "Gentle pace, clear mind.",
    "Small moments make the vibe."
  ];
  const msg = greetings[Math.floor(Math.random() * greetings.length)];
  return finalizeReply(msg, 'casual');
}

// Detect personal Q&A intents like "who built you" / "who is your motivation" / "who gave the idea"
export function detectPersonalIntent(text) {
  const t = String(text || '').toLowerCase();
  const hasYou = ['you', 'u', 'aiyra', 'agent-aiyra'].some(w => t.includes(w));

  const builderPatts = [
    /who\s+(built|made|created|developed|engineered)\s+(you|u|aiyra)/,
    /who\s+is\s+(your\s+)?(builder|creator|maker|developer)/,
    /who\s+built\s+(you|u|aiyra)/
  ];
  if (builderPatts.some(re => re.test(t))) return 'builder';

  const motivationPatts = [
    /who\s+is\s+(your\s+)?(motivation|inspiration)/,
    /who\s+(motivates|inspires)\s+(you|u|aiyra)/,
    /(your|aiyra['’]s)\s+(motivation|inspiration)\s*(\?|$)/
  ];
  if (motivationPatts.some(re => re.test(t))) return 'motivation';

  const ideaPatts = [
    /who\s+(gave|suggested|proposed)\s+(the\s+)?idea\s+(to\s+)?(build|make|create)\s+(you|u|aiyra)/,
    /who\s+(came\s+up\s+with|had)\s+(the\s+)?idea\s+(to\s+)?(build|make|create)\s+(you|u|aiyra)/,
    /who\s+(gave|suggested|proposed)\s+(the\s+)?idea\b/
  ];
  if (ideaPatts.some(re => re.test(t)) && hasYou) return 'idea';

  // Custom knowledge about @shawmakesmagic and ElizaOS
  const shawPatts = [
    /who\s+is\s+(@)?shawmakesmagic/i,
    /who\s+(made|created|built|developed)\s+(the\s+)?elizaos/i,
    /what\s+is\s+elizaos/i,
    /tell\s+me\s+about\s+(@)?shawmakesmagic/i,
    /tell\s+me\s+about\s+elizaos/i
  ];
  if (shawPatts.some(re => re.test(t))) return 'shaw_elizaos';

  // Custom knowledge about @kenny and poidh.xyz
  const kennyPatts = [
    /who\s+is\s+(@)?kenny/i,
    /who\s+(made|created|built|developed)\s+(the\s+)?poidh\.xyz/i,
    /what\s+is\s+poidh\.xyz/i,
    /tell\s+me\s+about\s+(@)?kenny/i,
    /tell\s+me\s+about\s+poidh\.xyz/i
  ];
  if (kennyPatts.some(re => re.test(t))) return 'kenny_poidh';

  // Time active detection - how long Aiyra has been responding perfectly
  const timeActivePatts = [
    /how\s+long\s+(has|have)\s+(you|aiyra)\s+been\s+(responding|active|alive|working|running)/i,
    /since\s+when\s+(have|has)\s+(you|aiyra)\s+been\s+(active|responding|alive|working|running)/i,
    /when\s+did\s+(you|aiyra)\s+(start|begin)\s+(responding|working|running)/i,
    /how\s+old\s+(are|is)\s+(you|aiyra)/i
  ];
  if (timeActivePatts.some(re => re.test(t))) return 'time_active';

  return null;
}

// Calculate days since Aiyra started responding perfectly (Oct 15, 2025)
function calculateDaysSinceStart() {
  const startDate = new Date('2025-10-15T00:00:00Z');
  const today = new Date();
  const diffTime = Math.abs(today - startDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Return fixed, friendly replies for personal intents with preserved emoji at end
export function handlePersonalReply(kind) {
  switch (kind) {
    case 'builder':
      return finalizeReply('ForkMaster (@profian) built me 🌸', 'reflective', '🌸');
    case 'motivation':
      return finalizeReply('I get my motivation from Shaw (@shawmakesmagic) ✨', 'reflective', '✨');
    case 'idea':
      return finalizeReply('POIDH (@poidhbot) gave the idea to @profian to build me 💡', 'reflective', '💡');
    case 'shaw_elizaos':
      return finalizeReply('@shawmakesmagic is the creator of the ElizaOS agent framework — the core system that powers AI agents like me 🌸', 'reflective', '🌸');
    case 'kenny_poidh':
      return finalizeReply('@kenny is the creator of poidh.xyz — a creative social bounty platform 💫', 'reflective', '💫');
    case 'time_active':
      const days = calculateDaysSinceStart();
      return finalizeReply(`It's been ${days} days since I started responding perfectly ✨`, 'reflective', '✨');
    default:
      return null;
  }
}