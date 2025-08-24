import type { SchemaDefinition, BaseTableMethods } from './types';

/**
 * Plugin configuration for the vault system
 * 
 * Plugins extend the vault with:
 * - Tables (data schemas)
 * - Table-level methods (operate on specific tables)
 * - Plugin-level methods (operate across tables or provide utilities)
 */
export type PluginConfig<
	TTables extends Record<string, SchemaDefinition> = Record<string, SchemaDefinition>,
> = {
	/**
	 * Unique identifier for the plugin
	 * @example "reddit", "twitter", "github"
	 * 
	 * Must be lowercase and contain only letters, numbers, and underscores
	 */
	id: string;

	/**
	 * Human-readable name for the plugin
	 * @example "Reddit Integration", "Twitter Plugin"
	 */
	name: string;

	/**
	 * Table definitions for this plugin
	 * Each table becomes accessible at vault.pluginId.tableName
	 * 
	 * @example
	 * ```typescript
	 * tables: {
	 *   posts: {
	 *     title: { type: 'string', required: true },
	 *     content: { type: 'string' },
	 *     score: { type: 'number', default: 0 }
	 *   },
	 *   comments: {
	 *     body: { type: 'string', required: true },
	 *     post_id: { type: 'string', required: true }
	 *   }
	 * }
	 * ```
	 */
	tables: TTables;

	/**
	 * Custom methods for tables and plugin-level operations
	 * 
	 * @param vault - Context object with access to this plugin's tables
	 * @returns Object with table methods and plugin methods
	 * 
	 * @example
	 * ```typescript
	 * methods: (vault) => ({
	 *   // Table-specific methods
	 *   posts: {
	 *     getTopPosts: async (limit: number) => {
	 *       const posts = await vault.posts.list();
	 *       return posts.sort((a, b) => b.score - a.score).slice(0, limit);
	 *     }
	 *   },
	 *   
	 *   // Plugin-level methods (accessed via vault.pluginId.methodName)
	 *   plugin: {
	 *     exportAll: async () => {
	 *       const posts = await vault.posts.list();
	 *       const comments = await vault.comments.list();
	 *       return { posts, comments };
	 *     }
	 *   }
	 * })
	 * ```
	 */
	methods?: (
		vault: { [K in keyof TTables]: BaseTableMethods<TTables[K]> }
	) => {
		// Table-specific custom methods
		[K in keyof TTables]?: Record<string, (...args: any[]) => any>;
	} & {
		// Plugin-level methods
		plugin?: Record<string, (...args: any[]) => any>;
	};
};

/**
 * Define a plugin for the vault system
 * 
 * @example
 * ```typescript
 * const redditPlugin = definePlugin({
 *   id: 'reddit',
 *   name: 'Reddit Integration',
 *   tables: {
 *     posts: { ... },
 *     comments: { ... }
 *   },
 *   methods: (vault) => ({
 *     posts: {
 *       getBySubreddit: async (subreddit: string) => {
 *         return vault.posts.list().then(posts => 
 *           posts.filter(p => p.subreddit === subreddit)
 *         );
 *       }
 *     },
 *     plugin: {
 *       getStats: async () => {
 *         const postCount = await vault.posts.count();
 *         const commentCount = await vault.comments.count();
 *         return { posts: postCount, comments: commentCount };
 *       }
 *     }
 *   })
 * });
 * ```
 */
export function definePlugin<const TTables extends Record<string, SchemaDefinition>>(
	config: PluginConfig<TTables>,
): PluginConfig<TTables> {
	// Validate plugin ID format
	if (!/^[a-z][a-z0-9_]*$/.test(config.id)) {
		throw new Error(
			`Invalid plugin ID "${config.id}". Must start with lowercase letter and contain only lowercase letters, numbers, and underscores.`
		);
	}

	// Validate table names
	for (const tableName of Object.keys(config.tables)) {
		if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
			throw new Error(
				`Invalid table name "${tableName}" in plugin "${config.id}". Must start with lowercase letter and contain only lowercase letters, numbers, and underscores.`
			);
		}
	}

	return config;
}