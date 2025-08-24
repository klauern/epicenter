import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import matter from 'gray-matter';
import type { PluginConfig } from './plugin';
import type {
	BuildVaultType,
	VaultConfig,
	BaseTableMethods,
	InferRecord,
	SchemaDefinition,
	VaultCoreMethods,
} from './types-new';

/**
 * Define a vault with plugins using nested structure
 * 
 * API Structure:
 * - vault.pluginName.tableName.method() - Table methods
 * - vault.pluginName.method() - Plugin-level methods
 * - vault.method() - Core vault methods
 * 
 * Storage Structure:
 * - Filesystem: /vault/pluginName/tableName/record.md
 * - SQLite: pluginId_tableName (flat tables)
 */
export function defineVault<const TPlugins extends readonly PluginConfig[]>(
	config: VaultConfig<TPlugins>,
): BuildVaultType<TPlugins> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Track all tables for core methods
	const allTables = new Map<string, { pluginId: string; tableName: string; path: string }>();

	// Build vault with nested structure
	const vault: any = {};

	// Process each plugin
	for (const plugin of config.plugins) {
		const pluginPath = join(config.path, plugin.id);
		
		// Ensure plugin directory exists
		if (!existsSync(pluginPath)) {
			mkdir(pluginPath, { recursive: true });
		}

		// Create plugin object
		const pluginObj: any = {};

		// Create table methods for each table in the plugin
		for (const [tableName, schema] of Object.entries(plugin.tables)) {
			const tablePath = join(pluginPath, tableName);
			const sqliteTableName = `${plugin.id}_${tableName}`;
			
			// Track this table
			allTables.set(sqliteTableName, {
				pluginId: plugin.id,
				tableName,
				path: tablePath,
			});

			// Ensure table directory exists
			if (!existsSync(tablePath)) {
				mkdir(tablePath, { recursive: true });
			}

			// Create base CRUD methods for this table
			pluginObj[tableName] = createTableMethods(tablePath, sqliteTableName, schema);
		}

		// Add custom methods if plugin defines them
		if (plugin.methods) {
			// Build context with access to plugin's tables
			const vaultContext: Record<string, BaseTableMethods<any>> = {};
			for (const tableName of Object.keys(plugin.tables)) {
				vaultContext[tableName] = pluginObj[tableName];
			}

			// Get custom methods from plugin
			const customMethods = plugin.methods(vaultContext) || {};

			// Apply table-specific custom methods
			for (const [tableName, methods] of Object.entries(customMethods)) {
				if (tableName !== 'plugin' && pluginObj[tableName] && methods) {
					Object.assign(pluginObj[tableName], methods);
				}
			}

			// Apply plugin-level methods
			if (customMethods.plugin) {
				for (const [methodName, method] of Object.entries(customMethods.plugin)) {
					pluginObj[methodName] = method;
				}
			}
		}

		// Add plugin to vault
		vault[plugin.id] = pluginObj;
	}

	// Add core vault methods
	Object.assign(vault, createCoreVaultMethods(config, allTables, vault));

	return vault as BuildVaultType<TPlugins>;
}

/**
 * Create standard CRUD methods for a table
 */
function createTableMethods<TSchema extends SchemaDefinition>(
	tablePath: string,
	sqliteTableName: string,
	schema: TSchema,
): BaseTableMethods<TSchema> {
	return {
		async get({ id }: { id: string }): Promise<InferRecord<TSchema> | null> {
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

		async list(params?: {
			where?: Partial<InferRecord<TSchema>>;
			orderBy?: keyof InferRecord<TSchema>;
			order?: 'asc' | 'desc';
			limit?: number;
			offset?: number;
		}): Promise<InferRecord<TSchema>[]> {
			if (!existsSync(tablePath)) return [];

			const files = await readdir(tablePath);
			const mdFiles = files.filter((f) => f.endsWith('.md'));

			const records = await Promise.all(
				mdFiles.map(async (file) => {
					const id = file.replace('.md', '');
					const record = await this.get({ id });
					return record;
				}),
			);

			let results = records.filter(Boolean) as InferRecord<TSchema>[];

			// Apply filters
			if (params?.where) {
				results = results.filter((record) => {
					return Object.entries(params.where!).every(
						([key, value]) => (record as any)[key] === value,
					);
				});
			}

			// Apply sorting
			if (params?.orderBy) {
				results.sort((a, b) => {
					const aVal = (a as any)[params.orderBy!];
					const bVal = (b as any)[params.orderBy!];
					const order = params.order === 'desc' ? -1 : 1;
					return aVal > bVal ? order : -order;
				});
			}

			// Apply pagination
			if (params?.offset) {
				results = results.slice(params.offset);
			}
			if (params?.limit) {
				results = results.slice(0, params.limit);
			}

			return results;
		},

		async create(record: Omit<InferRecord<TSchema>, 'id'>): Promise<InferRecord<TSchema>> {
			// Generate unique ID with table name prefix
			const timestamp = Date.now();
			const random = Math.random().toString(36).substr(2, 9);
			const id = `${sqliteTableName}_${timestamp}_${random}`;
			
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

		async update({ id, ...updates }: { id: string } & Partial<InferRecord<TSchema>>): Promise<InferRecord<TSchema>> {
			const existing = await this.get({ id });
			if (!existing) {
				throw new Error(`Record ${id} not found in table ${sqliteTableName}`);
			}

			const { content = existing.content, ...frontMatter } = updates as any;
			const updated = { ...existing, ...frontMatter, content };

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = join(tablePath, `${id}.md`);

			await writeFile(filePath, fileContent);

			return updated as InferRecord<TSchema>;
		},

		async delete({ id }: { id: string }): Promise<boolean> {
			const filePath = join(tablePath, `${id}.md`);
			if (!existsSync(filePath)) return false;

			await unlink(filePath);
			return true;
		},

		async count(params?: { where?: Partial<InferRecord<TSchema>> }): Promise<number> {
			const results = await this.list(params);
			return results.length;
		},

		async exists({ id }: { id: string }): Promise<boolean> {
			const filePath = join(tablePath, `${id}.md`);
			return existsSync(filePath);
		},
	};
}

/**
 * Create core vault methods
 */
function createCoreVaultMethods(
	config: VaultConfig<any>,
	allTables: Map<string, { pluginId: string; tableName: string; path: string }>,
	vault: any,
): VaultCoreMethods {
	return {
		async sync() {
			console.log('Syncing vault to SQLite...');
			console.log(`Tables to sync: ${Array.from(allTables.keys()).join(', ')}`);
			
			// TODO: Implement SQLite sync
			// For each table:
			// 1. Create SQLite table with name: pluginId_tableName
			// 2. Read all markdown files from: /vault/pluginId/tableName/
			// 3. Insert records into SQLite
		},

		async refresh() {
			console.log('Refreshing vault from disk...');
			// TODO: Clear any caches and re-read filesystem
		},

		async export(format: 'json' | 'sql' | 'markdown') {
			console.log(`Exporting vault as ${format}...`);

			if (format === 'json') {
				const result: Record<string, any> = {};
				
				// Export each plugin's data
				for (const plugin of config.plugins) {
					result[plugin.id] = {};
					
					for (const tableName of Object.keys(plugin.tables)) {
						const table = vault[plugin.id][tableName];
						if (table && typeof table.list === 'function') {
							result[plugin.id][tableName] = await table.list();
						}
					}
				}

				return JSON.stringify(result, null, 2);
			}

			if (format === 'sql') {
				const statements: string[] = [];
				
				// Generate CREATE TABLE statements
				for (const [sqliteTableName, info] of allTables) {
					statements.push(`-- Table: ${sqliteTableName}`);
					statements.push(`-- Plugin: ${info.pluginId}, Table: ${info.tableName}`);
					statements.push(`CREATE TABLE IF NOT EXISTS ${sqliteTableName} (`);
					statements.push(`  id TEXT PRIMARY KEY,`);
					statements.push(`  content TEXT,`);
					statements.push(`  created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
					// TODO: Add columns based on schema
					statements.push(`);`);
					statements.push('');
				}

				return statements.join('\n');
			}

			if (format === 'markdown') {
				let output = '# Vault Export\n\n';
				
				for (const plugin of config.plugins) {
					output += `## Plugin: ${plugin.name} (${plugin.id})\n\n`;
					
					for (const tableName of Object.keys(plugin.tables)) {
						const table = vault[plugin.id][tableName];
						if (table && typeof table.list === 'function') {
							const records = await table.list();
							output += `### Table: ${tableName} (${records.length} records)\n\n`;
						}
					}
				}

				return output;
			}

			return '-- Export format not implemented';
		},

		async stats() {
			const tableStats: Record<string, number> = {};
			let totalRecords = 0;

			for (const plugin of config.plugins) {
				for (const tableName of Object.keys(plugin.tables)) {
					const table = vault[plugin.id][tableName];
					if (table && typeof table.count === 'function') {
						const count = await table.count();
						const key = `${plugin.id}.${tableName}`;
						tableStats[key] = count;
						totalRecords += count;
					}
				}
			}

			return {
				plugins: config.plugins.length,
				tables: allTables.size,
				totalRecords,
				tableStats,
				lastSync: null,
			};
		},

		async query<T = any>(sql: string): Promise<T[]> {
			console.log('Executing SQL query:', sql);
			// TODO: Execute against SQLite database
			// Note: Table names in SQL will be pluginId_tableName format
			return [];
		},
	};
}