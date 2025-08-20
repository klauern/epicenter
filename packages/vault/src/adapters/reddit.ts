import { defineAdapter } from '../adapter';

/**
 * Reddit adapter for vault system
 * Handles Reddit posts, comments, and user data
 */
export const redditAdapter = defineAdapter({
  id: 'reddit',
  name: 'Reddit Adapter',
  
  schemas: {
    posts: {
      title: 'text',
      author: 'text',
      subreddit: 'text',
      score: 'number',
      num_comments: 'number',
      created_at: 'date',
      url: 'text',
      selftext: 'text',
      is_video: 'boolean',
      is_nsfw: 'boolean',
    },
    
    comments: {
      body: 'text',
      author: 'text',
      post_id: 'text',
      parent_id: 'text',
      score: 'number',
      created_at: 'date',
      edited: 'boolean',
      awards: 'json',
    },
    
    subreddits: {
      name: 'text',
      display_name: 'text',
      description: 'text',
      subscribers: 'number',
      created_at: 'date',
      is_nsfw: 'boolean',
      rules: 'json',
    }
  },
  
  methods: {
    posts: {
      async getTopPosts(this: any, limit: number = 10) {
        return this.find({ 
          orderBy: 'score', 
          order: 'desc',
          limit 
        });
      },
      
      async getBySubreddit(this: any, subreddit: string) {
        return this.where('subreddit', subreddit);
      },
      
      async getHotPosts(this: any, hours: number = 24) {
        const all = await this.getAll();
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        return all
          .filter((post: any) => new Date(post.created_at) > cutoff)
          .sort((a: any, b: any) => {
            // Hot algorithm: score / age in hours
            const aAge = (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60);
            const bAge = (Date.now() - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
            const aHot = a.score / Math.max(aAge, 1);
            const bHot = b.score / Math.max(bAge, 1);
            return bHot - aHot;
          });
      },
      
      async searchPosts(this: any, query: string) {
        const all = await this.getAll();
        const searchTerm = query.toLowerCase();
        
        return all.filter((post: any) => 
          post.title?.toLowerCase().includes(searchTerm) ||
          post.selftext?.toLowerCase().includes(searchTerm)
        );
      }
    },
    
    comments: {
      async getByPost(this: any, postId: string) {
        return this.where('post_id', postId);
      },
      
      async getByAuthor(this: any, author: string) {
        return this.where('author', author);
      },
      
      async getTopComments(this: any, limit: number = 10) {
        return this.find({
          orderBy: 'score',
          order: 'desc',
          limit
        });
      },
      
      async getThreads(this: any, postId: string) {
        const comments = await this.getByPost(postId);
        
        // Build comment tree structure
        const commentMap = new Map();
        const roots = [];
        
        for (const comment of comments) {
          commentMap.set(comment.id, { ...comment, children: [] });
        }
        
        for (const comment of comments) {
          if (comment.parent_id && commentMap.has(comment.parent_id)) {
            commentMap.get(comment.parent_id).children.push(commentMap.get(comment.id));
          } else {
            roots.push(commentMap.get(comment.id));
          }
        }
        
        return roots;
      }
    },
    
    subreddits: {
      async getByName(this: any, name: string) {
        const all = await this.getAll();
        return all.find((sub: any) => sub.name === name);
      },
      
      async getPopular(this: any, limit: number = 10) {
        return this.find({
          orderBy: 'subscribers',
          order: 'desc',
          limit
        });
      },
      
      async search(this: any, query: string) {
        const all = await this.getAll();
        const searchTerm = query.toLowerCase();
        
        return all.filter((sub: any) =>
          sub.name?.toLowerCase().includes(searchTerm) ||
          sub.display_name?.toLowerCase().includes(searchTerm) ||
          sub.description?.toLowerCase().includes(searchTerm)
        );
      }
    }
  },
  
  hooks: {
    beforeWrite: async (record) => {
      // Ensure IDs are prefixed
      if (!record.id?.startsWith('reddit_')) {
        record.id = `reddit_${record.id || Date.now()}`;
      }
      
      // Normalize dates
      if (record.created_at && typeof record.created_at === 'string') {
        record.created_at = new Date(record.created_at);
      }
      
      return record;
    },
    
    afterRead: async (record) => {
      // Parse dates
      if (record.created_at && typeof record.created_at === 'string') {
        record.created_at = new Date(record.created_at);
      }
      
      return record;
    }
  }
} as const);