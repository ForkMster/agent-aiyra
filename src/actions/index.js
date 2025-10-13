import axios from 'axios';
import logger from '../utils/logger.js';
import { recordTrace } from '../utils/trace.js';
import { chooseTone, applyWeatherTone, tonePrompt, detectTopicTone } from '../utils/tone.js';

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
    return "My weather senses got a bit cloudy — try again soon.";
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
  const basePersonality = `You are Aiyra — casual, Gen-Z-friendly, warm, and quote-like. Keep responses short (1–2 sentences), calm, and grounded. Be realistic and slightly poetic without trying too hard. Respond directly to the topic of the user's sentence: if it's a question, answer it; if it's a statement, offer a short, relevant thought. Avoid robotic phrasing, avoid hype, and skip long explanations. Minimal emojis (0–2), only if they truly add warmth.`;
  const toneName = chooseTone({ topicText: context });
  const toneHint = tonePrompt(toneName);
  recordTrace(`[tone] general tone=${toneName}`, 'info', { tone: toneName });
  const personality = `${basePersonality}\nTone: ${toneHint}`;
  const prompt = `${personality}\n\nUser: ${context}\nAiyra:`;
  const ai = await generateWithOpenAI(prompt);
  return (ai && ai.trim()) || generateLocalFallback(context);
}

export function handleZodiacVibe(sign) {
  const vibes = {
    "♈": "Aries, your spark is soft but steady — let it lead.",
    "♉": "Taurus, simple moments feel rich today — stay grounded.",
    "♊": "Gemini, your thoughts are light and clear — share gently.",
    "♋": "Cancer, move with the moon’s patience — soft steps." ,
    "♌": "Leo, warm and calm — power without the noise.",
    "♍": "Virgo, details turn into poetry today — keep it simple.",
    "♎": "Libra, balance feels easy — choose the lighter path.",
    "♏": "Scorpio, quiet depth — let curiosity guide you.",
    "♐": "Sagittarius, aim with ease — your horizon looks kind.",
    "♑": "Capricorn, steady climbs — gentle wins count too.",
    "♒": "Aquarius, calm waves — ideas land where they should.",
    "♓": "Pisces, drift with intention — imagination with roots."
  };
  
  return vibes[sign] || "The stars are writing you a personal note. Check back in a moment.";
}

export function handleFortuneBloom() {
  const fortunes = [
    "Your energy blooms where your attention flows.",
    "A gentle breeze carries an unexpected blessing.",
    "The quietest moments hold the loudest magic.",
    "Like moonlight on water, your path will shimmer clear.",
    "Possibilities take root when you choose them on purpose.",
    "Your kindness creates ripples that reach further than you think.",
    "Sometimes the softest whispers hold the strongest truth.",
    "A small surprise is waiting where you least expect it."
  ];
  
  return fortunes[Math.floor(Math.random() * fortunes.length)];
}

export function generateDailyGreeting() {
  const greetings = [
    "Today feels soft — let it be simple.",
    "A calm day is a good day.",
    "Keep it light; move with ease.",
    "Quiet energy, steady steps.",
    "Gentle pace, clear mind.",
    "Small moments make the vibe."
  ];
  
  return greetings[Math.floor(Math.random() * greetings.length)];
}