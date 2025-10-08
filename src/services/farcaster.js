import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import logger from '../utils/logger.js';

class FarcasterService {
  constructor(apiKey) {
    this.client = new NeynarAPIClient(new Configuration({ apiKey }));
    this.logger = logger;
  }

  async publishCast(content) {
    try {
      const result = await this.client.publishCast({
        signerUuid: process.env.FARCASTER_SIGNER_UUID,
        text: content
      });
      this.logger.info(`Published cast: ${content}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to publish cast: ${error.message}`);
      throw error;
    }
  }

  async replyCast(parentHash, content) {
    try {
      const result = await this.client.publishCast({
        signerUuid: process.env.FARCASTER_SIGNER_UUID,
        text: content,
        parent: { hash: parentHash }
      });
      this.logger.info(`Replied to cast ${parentHash}: ${content}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to reply to cast: ${error.message}`);
      throw error;
    }
  }

  async getRecentMentions() {
    try {
      const fid = Number(process.env.FARCASTER_FID);
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