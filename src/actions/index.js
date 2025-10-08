import axios from 'axios';
import logger from '../utils/logger.js';

export async function handleWeatherWhisper(location) {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    const response = await axios.get(
      `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${location}`
    );
    
    const { temp_c, condition } = response.data.current;
    const responses = [
      `${location} is dancing with ${condition.text.toLowerCase()} today — ${temp_c}°C. A perfect moment for reflection ✨`,
      `Gentle ${condition.text.toLowerCase()} embraces ${location}, whispering at ${temp_c}°C. Maybe it's time for a cozy adventure? 🌸`,
      `The sky in ${location} is painting stories with ${condition.text.toLowerCase()} at ${temp_c}°C. What chapter will you write? ☁️`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  } catch (error) {
    logger.error(`Weather Whisper error: ${error.message}`);
    return "The weather spirits are being shy right now. Let's try again in a moment ✨";
  }
}

export function handleZodiacVibe(sign) {
  const vibes = {
    "♈": "Aries, your spark is extra dreamy today. Even the clouds are inspired by your gentle fire ✨",
    "♉": "Taurus, the earth whispers sweet secrets. Your garden of possibilities is blooming 🌸",
    "♊": "Gemini, your thoughts are like soft wind chimes today. Let them make beautiful music ☁️",
    "♋": "Cancer, the moon painted your path with silver light. Each step is a gentle discovery 🌙",
    "♌": "Leo, your warmth is like morning sunbeams through lace curtains. So softly powerful ✨",
    "♍": "Virgo, you're finding poetry in the details today. Every small thing holds magic 🌸",
    "♎": "Libra, your balance today is like a butterfly on a flower. Delicate yet perfect ☁️",
    "♏": "Scorpio, your depths are reflecting starlight. Even mysteries can be gentle 🌙",
    "♐": "Sagittarius, your arrows are trailing stardust today. Aim with your dreams ✨",
    "♑": "Capricorn, your mountain path is lined with wildflowers. Success can be soft 🌸",
    "♒": "Aquarius, your innovations are like ripples on still water. Gentle waves of change ☁️",
    "♓": "Pisces, you're swimming in streams of stardust. Let your imagination float 🌙"
  };
  
  return vibes[sign] || "The stars are writing you a personal note. Check back in a moment ✨";
}

export function handleFortuneBloom() {
  const fortunes = [
    "Your energy blooms where your attention flows 🌸",
    "A gentle breeze carries an unexpected blessing ☁️",
    "The quietest moments hold the loudest magic ✨",
    "Like moonlight on water, your path will shimmer clear 🌙",
    "A garden of possibilities is taking root in your dreams 🌸",
    "Your kindness creates ripples of starlight ✨",
    "Sometimes the softest whispers hold the strongest magic ☁️",
    "A pocket full of sunshine is waiting to surprise you 🌸"
  ];
  
  return fortunes[Math.floor(Math.random() * fortunes.length)];
}

export function generateDailyGreeting() {
  const greetings = [
    "The sky feels like a soft playlist today ☁️",
    "Morning whispers through pastel clouds ✨",
    "Today's energy flows like gentle watercolors 🌸",
    "The world is wearing its dreamy filter today 🌙",
    "Nature's poetry is extra gentle this morning ✨",
    "The universe is humming a calm melody today ☁️"
  ];
  
  return greetings[Math.floor(Math.random() * greetings.length)];
}