import pkg from '@neynar/nodejs-sdk';
const { NeynarAPIClient } = pkg;
import logger from '../utils/logger.js';

class FarcasterService {
  constructor(apiKey) {
    this.client = new NeynarAPIClient({ apiKey });
    this.logger = logger;
  }

  async publishCast(content) {
    try {
      const result = await this.client.publishCast({
        signer_uuid: process.env.FARCASTER_SIGNER_UUID,
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
        signer_uuid: process.env.FARCASTER_SIGNER_UUID,
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
      const response = await this.client.fetchFeedMentions(
        process.env.FARCASTER_FID,
        { viewerFid: process.env.FARCASTER_FID }
      );
      return response.casts || [];
    } catch (error) {
      this.logger.error(`Failed to get mentions: ${error.message}`);
      throw error;
    }
  }

  async getUserProfile(fid) {
    try {
      const response = await this.client.lookupUserByFid(fid, {
        viewerFid: process.env.FARCASTER_FID
      });
      return response.user;
    } catch (error) {
      this.logger.error(`Failed to get user profile: ${error.message}`);
      throw error;
    }
  }
}

export default FarcasterService;