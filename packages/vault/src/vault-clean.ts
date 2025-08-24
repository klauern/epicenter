import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
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
import {
	getPluginPath,
	getTablePath,
	getSQLiteTableName,
	generateRecordId,
	getRecordPath,
	parseRecordFilename,
	isMarkdownFile,
} from './utils';

/**
 * Define a vault with plugins using clean architecture
 * 
 * No redundant data structures - everything is derived from config
 */
export function defineVault<const TPlugins extends readonly PluginConfig[]>(
	config: VaultConfig<TPlugins>,
): BuildVaultType<TPlugins> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Build vault with nested structure
	const vault: any = {};

	// Process each plugin
	for (const plugin of config.plugins) {
		const pluginPath = getPluginPath(config.path, plugin.id);
		
		// Ensure plugin directory exists
		if (!existsSync(pluginPath)) {
			mkdir(pluginPath, { recursive: true });
		}

		// Create plugin object
		const pluginObj: any = {};

		// Create table methods for each table in the plugin
		for (const [tableName, schema] of Object.entries(plugin.tables)) {
			const tablePath = getTablePath(config.path, plugin.id, tableName);
			const sqliteTableName = getSQLiteTableName(plugin.id, tableName);
			
			// Ensure table directory exists
			if (!existsSync(tablePath)) {
				mkdir(tablePath, { recursive: true });
			}

			// Create base CRUD methods for this table
			pluginObj[tableName] = createTableMethods(
				config.path,
				plugin.id,
				tableName,
				schema
			);
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
	Object.assign(vault, createCoreVaultMethods(config, vault));

	return vault as BuildVaultType<TPlugins>;
}

/**
 * Create standard CRUD methods for a table
 */
function createTableMethods<TSchema extends SchemaDefinition>(
	vaultPath: string,
	pluginId: string,
	tableName: string,
	schema: TSchema,
): BaseTableMethods<TSchema> {
	// Derive paths once
	const tablePath = getTablePath(vaultPath, pluginId, tableName);
	const sqliteTableName = getSQLiteTableName(pluginId, tableName);

	return {
		async get({ id }: { id: string }): Promise<InferRecord<TSchema> | null> {
			const filePath = getRecordPath(vaultPath, pluginId, tableName, id);
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
			const mdFiles = files.filter(isMarkdownFile);

			const records = await Promise.all(
				mdFiles.map(async (file) => {
					const id = parseRecordFilename(file);
					return this.get({ id });
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
			const id = generateRecordId(sqliteTableName);
			const { content = '', ...frontMatter } = record as any;

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = getRecordPath(vaultPath, pluginId, tableName, id);

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
				throw new Error(`Record ${id} not found in ${sqliteTableName}`);
			}

			const { content = existing.content, ...frontMatter } = updates as any;
			const updated = { ...existing, ...frontMatter, content };

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = getRecordPath(vaultPath, pluginId, tableName, id);

			await writeFile(filePath, fileContent);

			return updated as InferRecord<TSchema>;
		},

		async delete({ id }: { id: string }): Promise<boolean> {
			const filePath = getRecordPath(vaultPath, pluginId, tableName, id);
			if (!existsSync(filePath)) return false;

			await unlink(filePath);
			return true;
		},

		async count(params?: { where?: Partial<InferRecord<TSchema>> }): Promise<number> {
			const results = await this.list(params);
			return results.length;
		},

		async exists({ id }: { id: string }): Promise<boolean> {
			const filePath = getRecordPath(vaultPath, pluginId, tableName, id);
			return existsSync(filePath);
		},
	};
}

/**
 * Create core vault methods - simplified without redundant Map
 */
function createCoreVaultMethods(
	config: VaultConfig<any>,
	vault: any,
): VaultCoreMethods {
	return {
		async sync() {
			console.log('Syncing vault to SQLite...');
			
			// Iterate config directly - no Map needed!
			for (const plugin of config.plugins) {
				for (const tableName of Object.keys(plugin.tables)) {
					const sqliteTableName = getSQLiteTableName(plugin.id, tableName);
					console.log(`  Syncing table: ${sqliteTableName}`);
					
					// TODO: Actual SQLite sync
					// 1. Create table ${sqliteTableName}
					// 2. Read from ${getTablePath(config.path, plugin.id, tableName)}
					// 3. Insert into SQLite
				}
			}
		},

		async refresh() {
			console.log('Refreshing vault from disk...');
			// Just iterate the config - we can derive all paths
			for (const plugin of config.plugins) {
				const pluginPath = getPluginPath(config.path, plugin.id);
				console.log(`  Refreshing plugin: ${plugin.id} from ${pluginPath}`);
			}
		},

		async export(format: 'json' | 'sql' | 'markdown') {
			console.log(`Exporting vault as ${format}...`);

			if (format === 'json') {
				const result: Record<string, any> = {};
				
				// Just iterate config - no Map needed
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
				
				// Generate CREATE TABLE statements from config
				for (const plugin of config.plugins) {
					for (const tableName of Object.keys(plugin.tables)) {
						const sqliteTableName = getSQLiteTableName(plugin.id, tableName);
						
						statements.push(`-- Plugin: ${plugin.id}, Table: ${tableName}`);
						statements.push(`CREATE TABLE IF NOT EXISTS ${sqliteTableName} (`);
						statements.push(`  id TEXT PRIMARY KEY,`);
						statements.push(`  content TEXT,`);
						statements.push(`  created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
						// TODO: Add columns based on schema
						statements.push(`);`);
						statements.push('');
					}
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
							
							// Show table path for clarity
							const tablePath = getTablePath(config.path, plugin.id, tableName);
							output += `Path: \`${tablePath}\`\n\n`;
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

			// Simple iteration of config - derive everything else
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
				tables: Object.keys(tableStats).length,
				totalRecords,
				tableStats,
				lastSync: null,
			};
		},

		async query<T = any>(sql: string): Promise<T[]> {
			console.log('Executing SQL query:', sql);
			
			// When we implement this, table names will be pluginId_tableName
			// We can use getSQLiteTableName() to generate them
			
			return [];
		},
	};
}