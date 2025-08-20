import { defineAdapter } from '../adapter';

/**
 * Twitter/X adapter for vault system
 * Handles tweets, users, and interactions
 */
export const twitterAdapter = defineAdapter({
  id: 'twitter',
  name: 'Twitter/X Adapter',
  
  schemas: {
    tweets: {
      text: 'text',
      author: 'text',
      author_username: 'text',
      likes: 'number',
      retweets: 'number',
      replies: 'number',
      views: 'number',
      created_at: 'date',
      is_reply: 'boolean',
      is_retweet: 'boolean',
      has_media: 'boolean',
      media_urls: 'json',
      hashtags: 'json',
      mentions: 'json',
      thread_id: 'text',
    },
    
    users: {
      username: 'text',
      display_name: 'text',
      bio: 'text',
      location: 'text',
      website: 'text',
      followers: 'number',
      following: 'number',
      tweets_count: 'number',
      created_at: 'date',
      verified: 'boolean',
      profile_image: 'text',
      banner_image: 'text',
    },
    
    interactions: {
      type: 'text', // 'like', 'retweet', 'reply', 'follow'
      source_user: 'text',
      target_user: 'text',
      tweet_id: 'text',
      created_at: 'date',
      metadata: 'json',
    }
  },
  
  methods: {
    tweets: {
      async getViral(this: any, threshold: number = 1000) {
        const tweets = await this.getAll();
        return tweets.filter((t: any) => (t.likes + t.retweets) > threshold);
      },
      
      async getByAuthor(this: any, username: string) {
        return this.where('author_username', username);
      },
      
      async getThread(this: any, threadId: string) {
        const tweets = await this.where('thread_id', threadId);
        return tweets.sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      },
      
      async getTrending(this: any, hours: number = 24) {
        const all = await this.getAll();
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        return all
          .filter((tweet: any) => new Date(tweet.created_at) > cutoff)
          .sort((a: any, b: any) => {
            // Engagement rate calculation
            const aEngagement = (a.likes + a.retweets * 2 + a.replies * 3) / Math.max(a.views, 1);
            const bEngagement = (b.likes + b.retweets * 2 + b.replies * 3) / Math.max(b.views, 1);
            return bEngagement - aEngagement;
          })
          .slice(0, 20);
      },
      
      async searchTweets(this: any, query: string) {
        const all = await this.getAll();
        const searchTerm = query.toLowerCase();
        
        return all.filter((tweet: any) => {
          // Search in text
          if (tweet.text?.toLowerCase().includes(searchTerm)) return true;
          
          // Search in hashtags
          if (Array.isArray(tweet.hashtags)) {
            return tweet.hashtags.some((tag: string) => 
              tag.toLowerCase().includes(searchTerm)
            );
          }
          
          return false;
        });
      },
      
      async getByHashtag(this: any, hashtag: string) {
        const all = await this.getAll();
        const tag = hashtag.replace('#', '').toLowerCase();
        
        return all.filter((tweet: any) => {
          if (!Array.isArray(tweet.hashtags)) return false;
          return tweet.hashtags.some((h: string) => 
            h.toLowerCase() === tag
          );
        });
      },
      
      async getEngagementStats(this: any, tweetId: string) {
        const tweet = await this.getById(tweetId);
        if (!tweet) return null;
        
        const engagementRate = tweet.views > 0 
          ? ((tweet.likes + tweet.retweets + tweet.replies) / tweet.views) * 100
          : 0;
        
        return {
          ...tweet,
          engagement_rate: engagementRate,
          total_engagements: tweet.likes + tweet.retweets + tweet.replies,
          like_rate: tweet.views > 0 ? (tweet.likes / tweet.views) * 100 : 0,
          retweet_rate: tweet.views > 0 ? (tweet.retweets / tweet.views) * 100 : 0,
          reply_rate: tweet.views > 0 ? (tweet.replies / tweet.views) * 100 : 0,
        };
      }
    },
    
    users: {
      async getByUsername(this: any, username: string) {
        return this.where('username', username);
      },
      
      async getInfluencers(this: any, minFollowers: number = 10000) {
        const all = await this.getAll();
        return all
          .filter((user: any) => user.followers >= minFollowers)
          .sort((a: any, b: any) => b.followers - a.followers);
      },
      
      async search(this: any, query: string) {
        const all = await this.getAll();
        const searchTerm = query.toLowerCase();
        
        return all.filter((user: any) =>
          user.username?.toLowerCase().includes(searchTerm) ||
          user.display_name?.toLowerCase().includes(searchTerm) ||
          user.bio?.toLowerCase().includes(searchTerm)
        );
      },
      
      async getEngagementMetrics(this: any, username: string) {
        const user = await this.getByUsername(username);
        if (!user || !user[0]) return null;
        
        const userData = user[0];
        const engagementRatio = userData.following > 0 
          ? userData.followers / userData.following 
          : userData.followers;
        
        return {
          ...userData,
          engagement_ratio: engagementRatio,
          avg_tweets_per_day: userData.tweets_count / 
            Math.max(1, Math.floor((Date.now() - new Date(userData.created_at).getTime()) / (1000 * 60 * 60 * 24))),
          is_influencer: userData.followers > 10000,
          follower_tier: 
            userData.followers < 1000 ? 'micro' :
            userData.followers < 10000 ? 'small' :
            userData.followers < 100000 ? 'medium' :
            userData.followers < 1000000 ? 'large' : 'mega'
        };
      }
    },
    
    interactions: {
      async getByUser(this: any, username: string) {
        const all = await this.getAll();
        return all.filter((i: any) => 
          i.source_user === username || i.target_user === username
        );
      },
      
      async getLikes(this: any, tweetId?: string) {
        const all = await this.getAll();
        const likes = all.filter((i: any) => i.type === 'like');
        
        if (tweetId) {
          return likes.filter((i: any) => i.tweet_id === tweetId);
        }
        
        return likes;
      },
      
      async getRetweets(this: any, tweetId?: string) {
        const all = await this.getAll();
        const retweets = all.filter((i: any) => i.type === 'retweet');
        
        if (tweetId) {
          return retweets.filter((i: any) => i.tweet_id === tweetId);
        }
        
        return retweets;
      },
      
      async getFollowers(this: any, username: string) {
        const all = await this.getAll();
        return all.filter((i: any) => 
          i.type === 'follow' && i.target_user === username
        );
      },
      
      async getFollowing(this: any, username: string) {
        const all = await this.getAll();
        return all.filter((i: any) => 
          i.type === 'follow' && i.source_user === username
        );
      },
      
      async getEngagementGraph(this: any, username: string, depth: number = 1) {
        const interactions = await this.getByUser(username);
        const graph = { nodes: new Set([username]), edges: [] as any[] };
        
        for (const interaction of interactions) {
          graph.nodes.add(interaction.source_user);
          graph.nodes.add(interaction.target_user);
          graph.edges.push({
            from: interaction.source_user,
            to: interaction.target_user,
            type: interaction.type,
            weight: interaction.type === 'follow' ? 3 : 
                    interaction.type === 'retweet' ? 2 : 1
          });
        }
        
        // For depth > 1, recursively fetch connections (simplified for demo)
        if (depth > 1) {
          // This would need more complex graph traversal in production
        }
        
        return {
          nodes: Array.from(graph.nodes),
          edges: graph.edges,
          stats: {
            total_nodes: graph.nodes.size,
            total_edges: graph.edges.length,
            interaction_types: [...new Set(graph.edges.map(e => e.type))]
          }
        };
      }
    }
  },
  
  hooks: {
    beforeWrite: async (record) => {
      // Ensure IDs are prefixed
      if (!record.id?.startsWith('twitter_')) {
        record.id = `twitter_${record.id || Date.now()}`;
      }
      
      // Normalize dates
      if (record.created_at && typeof record.created_at === 'string') {
        record.created_at = new Date(record.created_at);
      }
      
      // Parse hashtags from text if not provided
      if (record.text && !record.hashtags) {
        const hashtagRegex = /#\w+/g;
        const matches = record.text.match(hashtagRegex);
        record.hashtags = matches ? matches.map((h: string) => h.slice(1)) : [];
      }
      
      // Parse mentions from text if not provided
      if (record.text && !record.mentions) {
        const mentionRegex = /@\w+/g;
        const matches = record.text.match(mentionRegex);
        record.mentions = matches ? matches.map((m: string) => m.slice(1)) : [];
      }
      
      return record;
    },
    
    afterRead: async (record) => {
      // Parse dates
      if (record.created_at && typeof record.created_at === 'string') {
        record.created_at = new Date(record.created_at);
      }
      
      // Ensure arrays are parsed
      if (typeof record.hashtags === 'string') {
        try {
          record.hashtags = JSON.parse(record.hashtags);
        } catch {}
      }
      
      if (typeof record.mentions === 'string') {
        try {
          record.mentions = JSON.parse(record.mentions);
        } catch {}
      }
      
      if (typeof record.media_urls === 'string') {
        try {
          record.media_urls = JSON.parse(record.media_urls);
        } catch {}
      }
      
      return record;
    }
  }
} as const);