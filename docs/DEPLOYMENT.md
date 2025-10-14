# Deployment and Technical Setup

This document captures the technical details for deploying and operating Aiyra on Railway. It keeps the main README calm and user-focused while preserving everything you need to run Aiyra reliably.

## Production Base URL

- Production: `https://agent-aiyra-production-7299.up.railway.app`
- Local: `http://localhost:8080`

## Prerequisites

- Node.js 18+
- A Farcaster account and API access (Neynar)
- Weather API key
- Redis (Upstash or compatible)

## Environment Variables

Required:

- `FARCASTER_NEYNAR_API_KEY`: Neynar API key
- `FARCASTER_SIGNER_UUID`: Signer UUID used for posting
- `FARCASTER_FID`: Your Farcaster FID
- `FARCASTER_USERNAME`: Username for mentions targeting (optional but recommended)
- `WEATHER_API_KEY`: Weather provider API key
- `UPSTASH_REDIS_REST_URL`: Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN`: Redis REST token

Recommended:

- `WEBHOOK_URL`: Base webhook URL, e.g. `https://agent-aiyra-production-7299.up.railway.app/webhook`
- `PORT`: Set to `8080` on Railway

Optional:

- `ADMIN_TOKEN`: Enables admin endpoints for tuning
- `AIYRA_TONE_MODE`: Override tone for quick experiments
- `POLL_INTERVAL_MS`: Default polling cadence (KV and admin endpoints can override)
- `HANDLED_TTL_MS`: TTL for processed items in Redis (defaults sensible if omitted)

## Webhook Setup

Use the provided scripts to create and manage webhook subscriptions.

1. Set `WEBHOOK_URL` to your deployment webhook endpoint.
2. Run `npm run setup:webhook` to create a mentions webhook.
3. To clean up stale webhooks: `node scripts/cleanup-webhooks.js`
4. To delete all webhooks: `node scripts/delete-webhooks.js`

Scripts live in `scripts/`:

- `setup-webhook.js`: Create webhook for mentions
- `cleanup-webhooks.js`: Remove outdated entries
- `delete-webhooks.js`: Remove all webhooks (use carefully)

## Background Polling and Stability

Aiyra runs a background poll manager to stay responsive between webhook events. The polling interval is configurable via KV and the admin API.

- KV key: `aiyra:poll_interval_ms`
- Default interval: `POLL_INTERVAL_MS` env var (if set)

Admin endpoints for tuning (requires `ADMIN_TOKEN` header `X-Admin-Token`):

- `GET /admin/poll-interval`: View current interval
- `POST /admin/poll-interval`: Update interval (JSON `{ intervalMs: number }`)

When the interval changes, the background manager restarts cleanly with the new cadence.

## Diagnostic Endpoints

These endpoints help verify the deployment and debug behavior.

- `GET /keepalive`: Simple liveness check
- `GET /env`: View sanitized environment configuration
- `GET /kv-check`: Validate Redis connectivity
- `GET /poll-status`: See poll manager status
- `GET /logs?limit=50`: Recent logs
- `GET /last-ts`: Last processed timestamp
- `POST /poll`: Manually trigger a poll cycle
- `GET /test-reply`: Publish a test cast and reply
- `GET /test-weather?city=Tokyo`: Generate a weather reply for the given city

## Railway Notes

- Ensure `PORT=8080` is set; Railway maps this automatically
- Add env vars in the Railway dashboard for secrets
- Confirm the base URL and webhook endpoint are accessible after deploy

## Development

- Install: `npm install`
- Start locally: `npm run dev`
- Lint (if configured): `npm run lint`

## Troubleshooting

- If a push is rejected, pull with rebase: `git pull --rebase origin main`
- If `/test-weather` returns 404, verify the server code and redeploy
- Ensure KV and Weather API credentials are valid; check `/kv-check` and `/env`