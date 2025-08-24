import { definePlugin } from '../plugin';

/**
 * Reddit plugin for the vault system
 * Provides tables and methods for Reddit data
 */
export const redditPlugin = definePlugin({
	id: 'reddit',
	name: 'Reddit Integration',
	
	tables: {
		posts: {
			title: { type: 'string', required: true },
			author: { type: 'string', required: true },
			subreddit: { type: 'string', required: true },
			score: { type: 'number', default: 0 },
			num_comments: { type: 'number', default: 0 },
			created_at: { type: 'date', required: true },
			url: { type: 'string' },
			selftext: { type: 'string' },
			is_video: { type: 'boolean', default: false },
			is_nsfw: { type: 'boolean', default: false },
		},
		
		comments: {
			body: { type: 'string', required: true },
			author: { type: 'string', required: true },
			post_id: { type: 'string', required: true, references: 'posts' },
			parent_id: { type: 'string', references: 'comments' },
			score: { type: 'number', default: 0 },
			created_at: { type: 'date', required: true },
			edited: { type: 'boolean', default: false },
			awards: { type: 'string[]' },
		},
		
		subreddits: {
			name: { type: 'string', required: true, unique: true },
			title: { type: 'string' },
			description: { type: 'string' },
			subscribers: { type: 'number' },
			created_at: { type: 'date' },
			is_nsfw: { type: 'boolean', default: false },
		},
	},
	
	methods: (vault) => ({
		// Table-specific methods
		posts: {
			/**
			 * Get top posts by score
			 * @example vault.reddit.posts.getTopPosts(10)
			 */
			async getTopPosts(limit: number = 10) {
				const posts = await vault.posts.list({
					orderBy: 'score',
					order: 'desc',
					limit,
				});
				return posts;
			},
			
			/**
			 * Get posts from a specific subreddit
			 * @example vault.reddit.posts.getBySubreddit('programming')
			 */
			async getBySubreddit(subreddit: string) {
				return vault.posts.list({
					where: { subreddit },
					orderBy: 'created_at',
					order: 'desc',
				});
			},
			
			/**
			 * Search posts by title or content
			 * @example vault.reddit.posts.searchPosts('TypeScript')
			 */
			async searchPosts(query: string) {
				const all = await vault.posts.list();
				const lowercaseQuery = query.toLowerCase();
				
				return all.filter(post => 
					post.title.toLowerCase().includes(lowercaseQuery) ||
					(post.selftext && post.selftext.toLowerCase().includes(lowercaseQuery))
				);
			},
		},
		
		comments: {
			/**
			 * Get comment thread for a post
			 * @example vault.reddit.comments.getCommentThread('post_123')
			 */
			async getCommentThread(postId: string) {
				const comments = await vault.comments.list({
					where: { post_id: postId },
					orderBy: 'created_at',
					order: 'asc',
				});
				
				// Build comment tree
				const rootComments = comments.filter(c => !c.parent_id);
				const commentMap = new Map(comments.map(c => [c.id, c]));
				
				function buildTree(parentId: string | null) {
					return comments
						.filter(c => c.parent_id === parentId)
						.map(comment => ({
							...comment,
							replies: buildTree(comment.id),
						}));
				}
				
				return buildTree(null);
			},
			
			/**
			 * Get top comments by score
			 * @example vault.reddit.comments.getTopComments(20)
			 */
			async getTopComments(limit: number = 20) {
				return vault.comments.list({
					orderBy: 'score',
					order: 'desc',
					limit,
				});
			},
		},
		
		subreddits: {
			/**
			 * Get trending subreddits by subscriber count
			 * @example vault.reddit.subreddits.getTrending(5)
			 */
			async getTrending(limit: number = 10) {
				return vault.subreddits.list({
					orderBy: 'subscribers',
					order: 'desc',
					limit,
				});
			},
		},
		
		// Plugin-level methods
		plugin: {
			/**
			 * Get overall Reddit statistics
			 * @example vault.reddit.getStats()
			 */
			async getStats() {
				const postCount = await vault.posts.count();
				const commentCount = await vault.comments.count();
				const subredditCount = await vault.subreddits.count();
				
				const topPost = await vault.posts.getTopPosts(1);
				const topComment = await vault.comments.getTopComments(1);
				
				return {
					posts: postCount,
					comments: commentCount,
					subreddits: subredditCount,
					topPost: topPost[0] || null,
					topComment: topComment[0] || null,
				};
			},
			
			/**
			 * Export all Reddit data
			 * @example vault.reddit.exportAll()
			 */
			async exportAll() {
				const posts = await vault.posts.list();
				const comments = await vault.comments.list();
				const subreddits = await vault.subreddits.list();
				
				return {
					posts,
					comments,
					subreddits,
					exported_at: new Date(),
				};
			},
			
			/**
			 * Search across all Reddit content
			 * @example vault.reddit.searchAll('TypeScript')
			 */
			async searchAll(query: string) {
				const lowercaseQuery = query.toLowerCase();
				
				const posts = await vault.posts.list();
				const comments = await vault.comments.list();
				
				return {
					posts: posts.filter(p => 
						p.title.toLowerCase().includes(lowercaseQuery) ||
						(p.selftext && p.selftext.toLowerCase().includes(lowercaseQuery))
					),
					comments: comments.filter(c =>
						c.body.toLowerCase().includes(lowercaseQuery)
					),
				};
			},
		},
	}),
});