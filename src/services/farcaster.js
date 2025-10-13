import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import logger from '../utils/logger.js';
import { recordTrace } from '../utils/trace.js';

class FarcasterService {
  constructor(apiKey) {
    const cleanKey = String(apiKey || '')
      .replace(/^\s*["']|["']\s*$/g, '')
      .trim();
    this.client = new NeynarAPIClient(new Configuration({ apiKey: cleanKey }));
    this.logger = logger;
  }

  async #withRetry(fn, context = {}) {
    const tries = [300, 800, 1600];
    let lastErr;
    for (let i = 0; i <= tries.length; i++) {
      try {
        return await fn();
      } catch (error) {
        lastErr = error;
        const status = error?.response?.status;
        const transient = status === 429 || (status >= 500 && status <= 599) || !status;
        if (i === tries.length || !transient) break;
        const delay = tries[i] + Math.floor(Math.random() * 150);
        this.logger.warn(`Retrying signer action in ${delay}ms (attempt ${i + 2}) context=${JSON.stringify(context)} status=${status || 'n/a'} reason=${error.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  async publishCast(content) {
    try {
      const signerUuid = String(process.env.FARCASTER_SIGNER_UUID || '')
        .replace(/^\s*["']|["']\s*$/g, '')
        .trim();
      const result = await this.#withRetry(() => this.client.publishCast({
        signerUuid,
        text: content
      }), { action: 'publish', content });
      this.logger.info(`Published cast: ${content}`);
      recordTrace('[signer] publish ok', 'info', { content });
      return result;
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      this.logger.error(`Failed to publish cast: ${error.message} status=${status || 'n/a'} data=${data ? JSON.stringify(data) : 'n/a'}`);
      recordTrace('[signer] publish failed', 'error', { message: error.message, status, data });
      throw error;
    }
  }

  async replyCast(parentHash, content) {
    try {
      const signerUuid = String(process.env.FARCASTER_SIGNER_UUID || '')
        .replace(/^\s*["']|["']\s*$/g, '')
        .trim();
      const result = await this.#withRetry(() => this.client.publishCast({
        signerUuid,
        text: content,
        parent: parentHash
      }), { action: 'reply', parentHash, content });
      this.logger.info(`Replied to cast ${parentHash}: ${content}`);
      recordTrace('[signer] reply ok', 'info', { parentHash, content });
      return result;
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      this.logger.error(`Failed to reply to cast: ${error.message} status=${status || 'n/a'} data=${data ? JSON.stringify(data) : 'n/a'}`);
      recordTrace('[signer] reply failed', 'error', { message: error.message, status, data, parentHash });
      throw error;
    }
  }

  async getRecentMentions() {
    try {
      const fid = Number(process.env.FARCASTER_FID);
      // Primary: use Notifications API
      try {
        const resp = await this.client.fetchAllNotifications({
          fid,
          type: ['mentions', 'replies'],
          limit: 25
        });
        const notifications = resp?.notifications || [];
        const casts = notifications
          .map(n => n?.cast)
          .filter(Boolean);
        return casts;
      } catch (innerErr) {
        // Fallback regardless of exact status code; Notifications API may be gated on free plan
        const username = process.env.FARCASTER_USERNAME || 'agent-aiyra';
        try {
          const search = await this.client.searchCasts({
            q: `@${username}`,
            sortType: 'desc_chron',
            limit: 25
          });
          const casts = (search?.casts || []).filter(Boolean);
          this.logger.info(
            `Fallback searchCasts returned ${casts.length} potential mentions for @${username}`
          );
          return casts;
        } catch (searchErr) {
          throw innerErr;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to get mentions: ${error.message}`);
      return [];
    }
  }

  async getUserProfile(fid) {
    try {
      // Placeholder: v3 SDK does not expose a direct lookupUserByFid in this client.
      // Not used in current flows; implement when needed with appropriate API.
      throw new Error('getUserProfile not implemented for v3 SDK');
    } catch (error) {
      this.logger.error(`Failed to get user profile: ${error.message}`);
      throw error;
    }
  }
}

export default FarcasterService;