import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import matter from 'gray-matter';
import type { AdapterConfig } from './adapter';
import type {
	BuildVaultType,
	VaultConfig,
	MarkdownRecord,
	BaseSubfolderMethods,
	InferRecord,
	InferFieldType,
	SchemaDefinition,
} from './types';

/**
 * Define a vault with adapters - optimized single-pass implementation
 */
export function defineVault<const TAdapters extends readonly AdapterConfig[]>(
	config: VaultConfig<TAdapters>,
): BuildVaultType<TAdapters> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Build vault in a single pass through adapters
	const vault = config.adapters.reduce<BuildVaultType<TAdapters>>(
		(accumulator, adapter) => {
			// Process each schema in this adapter
			for (const [schemaName, schema] of Object.entries(adapter.schemas)) {
				const prefixedName = `${adapter.id}_${schemaName}`;

				// Create base methods for this subfolder
				accumulator[prefixedName] = createSubfolderMethods(
					config.path,
					prefixedName,
					schema,
				);
			}

			// Add custom methods if adapter has them
			if (adapter.methods) {
				// Build vault context that maps original names to prefixed subfolders
				const vaultContext: Record<string, any> = {};
				for (const schemaName of Object.keys(adapter.schemas)) {
					vaultContext[schemaName] = accumulator[`${adapter.id}_${schemaName}`];
				}

				// Get custom methods from adapter
				const customMethods = adapter.methods(vaultContext) || {};

				// Merge custom methods into the appropriate subfolders
				for (const [schemaName, methods] of Object.entries(customMethods)) {
					const prefixedName = `${adapter.id}_${schemaName}`;
					if (accumulator[prefixedName] && methods) {
						Object.assign(accumulator[prefixedName], methods);
					}
				}
			}

			return accumulator;
		},
		{
			// Initialize with core vault methods
			async sync() {
				console.log('Syncing vault to SQLite...');
				// In a real implementation, this would sync markdown files to SQLite
			},

			async refresh() {
				console.log('Refreshing vault from disk...');
				// Reload all markdown files
			},

			async export(format: 'json' | 'sql') {
				console.log(`Exporting vault as ${format}...`);

				if (format === 'json') {
					const allData: Record<string, any[]> = {};

					// Get all subfolders (those with a getAll method)
					for (const [name, value] of Object.entries(this)) {
						if (typeof value === 'object' && value && 'getAll' in value) {
							const subfolder = value as BaseSubfolderMethods<any>;
							allData[name] = await subfolder.getAll();
						}
					}

					return JSON.stringify(allData, null, 2);
				}

				return '-- SQL export not implemented yet';
			},

			async stats() {
				let subfolderCount = 0;
				let totalRecords = 0;

				// Count all subfolders and their records
				for (const value of Object.values(this)) {
					if (typeof value === 'object' && value && 'count' in value) {
						const subfolder = value as BaseSubfolderMethods<any>;
						subfolderCount++;
						totalRecords += await subfolder.count();
					}
				}

				return {
					subfolders: subfolderCount,
					totalRecords,
					lastSync: null,
				};
			},

			async query(sql: string) {
				console.log('Executing SQL query:', sql);
				// In a real implementation, this would query the SQLite database
				return [];
			},
		},
	);

	return vault as BuildVaultType<TAdapters>;
}

/**
 * Create base CRUD methods for a subfolder
 */
function createSubfolderMethods<TSchema extends SchemaDefinition>(
	vaultPath: string,
	subfolder: string,
	schema: TSchema,
): BaseSubfolderMethods<TSchema> {
	const subfolderPath = join(vaultPath, subfolder);

	// Ensure subfolder exists
	if (!existsSync(subfolderPath)) {
		mkdir(subfolderPath, { recursive: true });
	}

	return {
		async getById(id: string): Promise<InferRecord<TSchema> | null> {
			const filePath = join(subfolderPath, `${id}.md`);
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
			if (!existsSync(subfolderPath)) return [];

			const files = await readdir(subfolderPath);
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
			const id = `${subfolder}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const { content = '', ...frontMatter } = record as any;

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = join(subfolderPath, `${id}.md`);

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
			if (!existing) throw new Error(`Record ${id} not found`);

			const { content = existing.content, ...frontMatter } = updates as any;
			const updated = { ...existing, ...frontMatter, content };

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = join(subfolderPath, `${id}.md`);

			await writeFile(filePath, fileContent);

			return updated as InferRecord<TSchema>;
		},

		async delete(id: string): Promise<boolean> {
			const filePath = join(subfolderPath, `${id}.md`);
			if (!existsSync(filePath)) return false;

			await unlink(filePath);
			return true;
		},

		async find(query: any): Promise<InferRecord<TSchema>[]> {
			const all = await this.getAll();
			let result = [...all];

			// Simple query implementation
			if (query.where) {
				result = result.filter((record) => {
					return Object.entries(query.where).every(
						([key, value]) => (record as any)[key] === value,
					);
				});
			}

			if (query.orderBy) {
				result.sort((a, b) => {
					const aVal = (a as any)[query.orderBy];
					const bVal = (b as any)[query.orderBy];
					const order = query.order === 'desc' ? -1 : 1;
					return aVal > bVal ? order : -order;
				});
			}

			if (query.limit) {
				return result.slice(0, query.limit);
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
