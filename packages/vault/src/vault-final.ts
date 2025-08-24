import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import matter from 'gray-matter';
import type { AdapterConfig } from './adapter';
import type {
	BuildVaultType,
	VaultConfig,
	BaseSubfolderMethods,
	InferRecord,
	InferFieldType,
	SchemaDefinition,
} from './types';

/**
 * Define a vault with adapters - final optimized implementation
 * 
 * Design decisions:
 * - Flat structure (vault.reddit_posts) to match SQLite table names
 * - Single-pass reduce for performance
 * - Type-safe throughout with minimal assertions
 */
export function defineVault<const TAdapters extends readonly AdapterConfig[]>(
	config: VaultConfig<TAdapters>,
): BuildVaultType<TAdapters> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Track all table names for validation and debugging
	const tableNames = new Set<string>();

	// Build vault in a single pass through adapters
	const vault = config.adapters.reduce(
		(accumulator, adapter) => {
			// Validate adapter ID format (lowercase, no spaces, SQL-safe)
			if (!/^[a-z][a-z0-9_]*$/.test(adapter.id)) {
				throw new Error(
					`Invalid adapter ID "${adapter.id}". Must start with lowercase letter and contain only lowercase letters, numbers, and underscores.`
				);
			}

			// Process each schema/table in this adapter
			for (const [tableName, schema] of Object.entries(adapter.schemas)) {
				const fullTableName = `${adapter.id}_${tableName}` as const;
				
				// Check for duplicate table names
				if (tableNames.has(fullTableName)) {
					throw new Error(
						`Duplicate table name "${fullTableName}". Table names must be unique across all adapters.`
					);
				}
				tableNames.add(fullTableName);

				// Create base CRUD methods for this table
				accumulator[fullTableName] = createTableMethods(
					config.path,
					fullTableName,
					schema,
				);
			}

			// Apply adapter's custom methods if provided
			if (adapter.methods) {
				// Build context that maps simple names to full table names
				// This allows adapters to use `vault.posts` internally
				// while the actual table is `vault.reddit_posts`
				const vaultContext = Object.keys(adapter.schemas).reduce(
					(ctx, tableName) => {
						const fullTableName = `${adapter.id}_${tableName}`;
						ctx[tableName] = accumulator[fullTableName];
						return ctx;
					},
					{} as Record<string, BaseSubfolderMethods<any>>
				);

				// Get custom methods from adapter
				const customMethods = adapter.methods(vaultContext) || {};

				// Merge custom methods into the appropriate tables
				for (const [tableName, methods] of Object.entries(customMethods)) {
					const fullTableName = `${adapter.id}_${tableName}`;
					if (accumulator[fullTableName] && methods) {
						Object.assign(accumulator[fullTableName], methods);
					}
				}
			}

			return accumulator;
		},
		createCoreVaultMethods(tableNames) as any
	);

	return vault;
}

/**
 * Create core vault methods that operate across all tables
 */
function createCoreVaultMethods(tableNames: Set<string>) {
	return {
		/**
		 * Sync markdown files to SQLite database
		 */
		async sync() {
			console.log('Syncing vault to SQLite...');
			console.log(`Tables to sync: ${Array.from(tableNames).join(', ')}`);
			// TODO: Implement actual SQLite sync
			// 1. Create tables if not exist
			// 2. Read all markdown files
			// 3. Insert/update records in SQLite
		},

		/**
		 * Refresh vault from disk (clear caches, re-read files)
		 */
		async refresh() {
			console.log('Refreshing vault from disk...');
			// TODO: Clear any in-memory caches
			// Re-read directory structure
		},

		/**
		 * Export vault data in various formats
		 */
		async export(format: 'json' | 'sql' | 'markdown') {
			console.log(`Exporting vault as ${format}...`);

			if (format === 'json') {
				const allData: Record<string, any[]> = {};
				
				for (const [name, value] of Object.entries(this)) {
					if (isTable(value)) {
						allData[name] = await value.getAll();
					}
				}

				return JSON.stringify(allData, null, 2);
			}

			if (format === 'sql') {
				const statements: string[] = [];
				
				// Generate CREATE TABLE statements
				for (const tableName of tableNames) {
					statements.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
					statements.push(`  id TEXT PRIMARY KEY,`);
					statements.push(`  content TEXT,`);
					// TODO: Add columns based on schema
					statements.push(`  created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
					statements.push(`);`);
					statements.push('');
				}

				// Generate INSERT statements
				for (const [name, value] of Object.entries(this)) {
					if (isTable(value)) {
						const records = await value.getAll();
						for (const record of records) {
							// TODO: Generate proper INSERT statement
							statements.push(`-- INSERT INTO ${name} ...`);
						}
					}
				}

				return statements.join('\n');
			}

			return '-- Export format not implemented yet';
		},

		/**
		 * Get statistics about the vault
		 */
		async stats() {
			const tableStats: Record<string, number> = {};
			let totalRecords = 0;

			for (const [name, value] of Object.entries(this)) {
				if (isTable(value)) {
					const count = await value.count();
					tableStats[name] = count;
					totalRecords += count;
				}
			}

			return {
				tables: tableNames.size,
				totalRecords,
				tableStats,
				lastSync: null as Date | null,
			};
		},

		/**
		 * Execute SQL query against the vault
		 * This would query the SQLite database, not the markdown files
		 */
		async query<T = any>(sql: string): Promise<T[]> {
			console.log('Executing SQL query:', sql);
			
			// TODO: Implement actual SQL query execution
			// 1. Ensure SQLite is synced
			// 2. Execute query
			// 3. Return results
			
			return [];
		},

		/**
		 * Get metadata about a specific table
		 */
		async describe(tableName: string) {
			if (!tableNames.has(tableName)) {
				throw new Error(`Table "${tableName}" does not exist`);
			}

			const table = (this as any)[tableName];
			if (!isTable(table)) {
				throw new Error(`"${tableName}" is not a valid table`);
			}

			const count = await table.count();
			const sample = await table.find({ limit: 3 });

			return {
				name: tableName,
				recordCount: count,
				sampleRecords: sample,
				// TODO: Add schema information
			};
		},
	};
}

/**
 * Type guard to check if a value is a table (has CRUD methods)
 */
function isTable(value: unknown): value is BaseSubfolderMethods<any> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'getAll' in value &&
		'getById' in value &&
		'create' in value &&
		'update' in value &&
		'delete' in value &&
		'count' in value
	);
}

/**
 * Create CRUD methods for a table (formerly subfolder)
 * Using "table" terminology to align with SQLite mental model
 */
function createTableMethods<TSchema extends SchemaDefinition>(
	vaultPath: string,
	tableName: string,
	schema: TSchema,
): BaseSubfolderMethods<TSchema> {
	const tablePath = join(vaultPath, tableName);

	// Ensure table directory exists
	if (!existsSync(tablePath)) {
		mkdir(tablePath, { recursive: true });
	}

	return {
		async getById(id: string): Promise<InferRecord<TSchema> | null> {
			const filePath = join(tablePath, `${id}.md`);
			if (!existsSync(filePath)) return null;

			const content = await readFile(filePath, 'utf-8');
			const { data, content: body } = matter(content);

			return {
				...data,
				id,
				content: body,
			} as InferRecord<TSchema>;
		},

		async getAll(): Promise<InferRecord<TSchema>[]> {
			if (!existsSync(tablePath)) return [];

			const files = await readdir(tablePath);
			const mdFiles = files.filter((f) => f.endsWith('.md'));

			const records = await Promise.all(
				mdFiles.map(async (file) => {
					const id = file.replace('.md', '');
					return this.getById(id);
				}),
			);

			return records.filter(Boolean) as InferRecord<TSchema>[];
		},

		async create(
			record: Omit<InferRecord<TSchema>, 'id'>,
		): Promise<InferRecord<TSchema>> {
			// Generate ID with table name prefix for uniqueness
			const id = `${tableName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const { content = '', ...frontMatter } = record as any;

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = join(tablePath, `${id}.md`);

			await writeFile(filePath, fileContent);

			return {
				...frontMatter,
				id,
				content,
			} as InferRecord<TSchema>;
		},

		async update(
			id: string,
			updates: Partial<InferRecord<TSchema>>,
		): Promise<InferRecord<TSchema>> {
			const existing = await this.getById(id);
			if (!existing) {
				throw new Error(`Record ${id} not found in table ${tableName}`);
			}

			const { content = existing.content, ...frontMatter } = updates as any;
			const updated = { ...existing, ...frontMatter, content };

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = join(tablePath, `${id}.md`);

			await writeFile(filePath, fileContent);

			return updated as InferRecord<TSchema>;
		},

		async delete(id: string): Promise<boolean> {
			const filePath = join(tablePath, `${id}.md`);
			if (!existsSync(filePath)) return false;

			await unlink(filePath);
			return true;
		},

		async find(query: any): Promise<InferRecord<TSchema>[]> {
			const all = await this.getAll();
			let result = [...all];

			// Apply WHERE clause
			if (query.where) {
				result = result.filter((record) => {
					return Object.entries(query.where).every(
						([key, value]) => (record as any)[key] === value,
					);
				});
			}

			// Apply ORDER BY
			if (query.orderBy) {
				result.sort((a, b) => {
					const aVal = (a as any)[query.orderBy];
					const bVal = (b as any)[query.orderBy];
					const order = query.order === 'desc' ? -1 : 1;
					return aVal > bVal ? order : -order;
				});
			}

			// Apply LIMIT
			if (query.limit) {
				result = result.slice(0, query.limit);
			}

			// Apply OFFSET
			if (query.offset) {
				result = result.slice(query.offset);
			}

			return result;
		},

		async count(): Promise<number> {
			const all = await this.getAll();
			return all.length;
		},

		async where<K extends keyof TSchema>(
			field: K,
			value: InferFieldType<TSchema[K]>,
		): Promise<InferRecord<TSchema>[]> {
			const all = await this.getAll();
			return all.filter((record) => (record as any)[field] === value);
		},
	};
}