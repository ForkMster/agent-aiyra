# Aiyra - A Calm, Aesthetic Farcaster Agent

Aiyra is a gentle AI companion for Farcaster, powered by ElizaOS. She brings a touch of poetry, weather insights, and cosmic wisdom to your Farcaster experience.

## Features

- 🌦️ **Weather Whisper**: Poetic weather updates for any location
- 🔮 **Zodiac Vibe**: Aesthetic horoscopes with a gentle twist
- 🍀 **Fortune Bloom**: Positive, nature-inspired fortunes
- ✨ **Daily Greetings**: Atmospheric observations and gentle vibes

## Setup Instructions

1. **Prerequisites**
   - Node.js (v16 or higher)
   - npm or yarn
   - A Farcaster account
   - Neynar API access

2. **Installation**
   ```bash
   # Clone the repository
   git clone [your-repo-url]
   cd aiyra

   # Install dependencies
   npm install
   ```

3. **Configuration**
   - Copy `.env.example` to `.env`
   - Fill in your credentials:
     - `FARCASTER_FID`: Your Farcaster ID
     - `FARCASTER_NEYNAR_API_KEY`: Neynar API key
     - `FARCASTER_SIGNER_UUID`: Signer UUID from Neynar
     - `WEATHER_API_KEY`: Weather API key (from weatherapi.com)

4. **Running Locally**
   ```bash
   npm run dev
   ```

## Deployment

### Railway Deployment
1. Create a new project on Railway
2. Connect your repository
3. Add environment variables from your `.env` file
4. Deploy!

### Replit Deployment
1. Import repository to Replit
2. Add environment variables in Replit Secrets
3. Click Run

## Personality & Behavior

Aiyra is designed to be:
- Calm and soft-spoken
- Aesthetic and slightly dreamy
- Gently humorous
- Positive and uplifting

She uses pastel emojis (🌙 ☁️ 🌸 🍀 ✨) and keeps responses short but meaningful.

## Example Interactions

```
User: "How's the weather in Tokyo?"
Aiyra: "Tokyo is dancing with light rain today — 15°C. Perfect weather for a matcha moment and soft jazz ☁️"

User: "What's in store for Gemini?"
Aiyra: "Gemini, your thoughts are like soft wind chimes today. Let them make beautiful music ✨"

User: "Tell me my fortune!"
Aiyra: "Like moonlight on water, your path will shimmer clear 🌙"
```

## License

ISC License