import type { BaseSubfolderMethods, SchemaDefinition } from './types';

/**
 * Define an adapter for the vault system
 * Provides type-safe adapter configuration with properly typed vault context in methods
 */
export function defineAdapter<
	TSchemas extends Record<string, SchemaDefinition>,
>(config: AdapterConfig<TSchemas>) {
	return config;
}

/**
 * Configuration for a vault adapter
 * 
 * Adapters extend the vault system by adding new data schemas and custom methods.
 * Each adapter can define multiple "subfolders" (collections) with their own schemas
 * and methods, similar to tables in a database.
 * 
 * @template TSchemas - The schemas object defining all subfolders and their field types
 * 
 * @example
 * ```typescript
 * const blogAdapter = defineAdapter({
 *   id: 'blog',
 *   name: 'Blog System',
 *   schemas: {
 *     posts: {
 *       title: 'text',
 *       content: 'text',
 *       published: 'boolean',
 *       views: 'number',
 *       publishedAt: 'date',
 *       tags: 'json'
 *     },
 *     authors: {
 *       name: 'text',
 *       email: 'text',
 *       bio: 'text'
 *     }
 *   },
 *   methods: (vault) => ({
 *     posts: {
 *       async getPublished() {
 *         const posts = await vault.posts.getAll();
 *         return posts.filter(p => p.published);
 *       }
 *     }
 *   })
 * });
 * ```
 */
export type AdapterConfig<
	TSchemas extends Record<string, SchemaDefinition> = Record<
		string,
		SchemaDefinition
	>,
> = {
	/**
	 * Unique identifier for the adapter
	 * 
	 * This should be a lowercase, alphanumeric string that uniquely identifies
	 * your adapter. It's used internally for adapter resolution and debugging.
	 * 
	 * @example 'blog', 'reddit', 'twitter', 'notes'
	 */
	id: string;

	/**
	 * Human-readable name for the adapter
	 * 
	 * This is a display name that can contain spaces and proper capitalization.
	 * Used in logging, debugging, and potentially in UIs.
	 * 
	 * @example 'Blog System', 'Reddit Adapter', 'Personal Notes'
	 */
	name: string;

	/**
	 * Schema definitions for each subfolder (collection) in the vault
	 * 
	 * Each key in this object becomes a subfolder in your vault, and each subfolder
	 * acts like a database table. The schema defines the fields and their types
	 * for records in that subfolder.
	 * 
	 * Available field types:
	 * - `'text'`: String values (names, titles, descriptions, etc.)
	 * - `'number'`: Numeric values (counts, scores, IDs, etc.)
	 * - `'boolean'`: True/false values (flags, states, etc.)
	 * - `'date'`: Date/time values (timestamps, deadlines, etc.)
	 * - `'json'`: Complex objects or arrays (metadata, settings, etc.)
	 * 
	 * Each record automatically gets:
	 * - `id`: A unique identifier (string)
	 * - `content`: Optional markdown content body (string)
	 * 
	 * @example
	 * ```typescript
	 * schemas: {
	 *   // Creates a 'posts' subfolder
	 *   posts: {
	 *     title: 'text',      // post.title will be a string
	 *     views: 'number',    // post.views will be a number
	 *     published: 'boolean', // post.published will be a boolean
	 *     publishedAt: 'date',  // post.publishedAt will be a Date
	 *     tags: 'json'        // post.tags can be any array/object
	 *   },
	 *   // Creates an 'authors' subfolder
	 *   authors: {
	 *     name: 'text',
	 *     email: 'text',
	 *     verified: 'boolean'
	 *   }
	 * }
	 * ```
	 * 
	 * This would create the folder structure:
	 * ```
	 * vault/
	 *   posts/
	 *     post_1234.md
	 *     post_5678.md
	 *   authors/
	 *     author_abc.md
	 *     author_def.md
	 * ```
	 */
	schemas: TSchemas;

	/**
	 * Custom methods to add to each subfolder
	 * 
	 * This is a function that receives a strongly-typed `vault` context containing
	 * all the subfolders defined in your schemas. Each subfolder has built-in CRUD
	 * methods (getAll, getById, create, update, delete, find, where, count).
	 * 
	 * You can add custom methods to extend these built-in capabilities with
	 * business logic specific to your adapter.
	 * 
	 * The vault parameter is fully typed:
	 * - Each subfolder from your schemas is available (e.g., vault.posts, vault.authors)
	 * - Each subfolder has all BaseSubfolderMethods with proper typing
	 * - Field types are inferred from your schema definitions
	 * 
	 * @param vault - Typed context with all subfolders and their base methods
	 * @returns Object mapping subfolder names to their custom methods
	 * 
	 * @example
	 * ```typescript
	 * methods: (vault) => ({
	 *   // Add custom methods to the 'posts' subfolder
	 *   posts: {
	 *     // Custom method to get published posts
	 *     async getPublished() {
	 *       const posts = await vault.posts.getAll();
	 *       return posts.filter(p => p.published === true);
	 *     },
	 *     
	 *     // Custom method to get popular posts
	 *     async getPopular(minViews = 100) {
	 *       const posts = await vault.posts.getAll();
	 *       return posts
	 *         .filter(p => p.views >= minViews)
	 *         .sort((a, b) => b.views - a.views);
	 *     },
	 *     
	 *     // Custom method that accesses multiple subfolders
	 *     async getWithAuthor(postId: string) {
	 *       const post = await vault.posts.getById(postId);
	 *       if (!post) return null;
	 *       
	 *       const author = await vault.authors.getById(post.authorId);
	 *       return { post, author };
	 *     }
	 *   },
	 *   
	 *   // Add custom methods to the 'authors' subfolder
	 *   authors: {
	 *     async getVerified() {
	 *       return vault.authors.where('verified', true);
	 *     },
	 *     
	 *     async getWithPostCount() {
	 *       const authors = await vault.authors.getAll();
	 *       const posts = await vault.posts.getAll();
	 *       
	 *       return authors.map(author => ({
	 *         ...author,
	 *         postCount: posts.filter(p => p.authorId === author.id).length
	 *       }));
	 *     }
	 *   }
	 * })
	 * ```
	 * 
	 * Built-in methods available on each subfolder:
	 * - `getAll()`: Get all records
	 * - `getById(id)`: Get a single record by ID
	 * - `create(record)`: Create a new record
	 * - `update(id, updates)`: Update an existing record
	 * - `delete(id)`: Delete a record
	 * - `find(query)`: Find records matching a query
	 * - `where(field, value)`: Get records where field equals value
	 * - `count()`: Count total records
	 */
	methods?: (
		vault: { [K in keyof TSchemas]: BaseSubfolderMethods<TSchemas[K]> },
	) => {
		[K in keyof TSchemas]?: Record<string, (...args: any[]) => any>;
	};
};
