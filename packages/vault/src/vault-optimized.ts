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
 * Optimized single-pass vault definition
 */
export function defineVault<const TAdapters extends readonly AdapterConfig[]>(
	config: VaultConfig<TAdapters>,
): BuildVaultType<TAdapters> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Single pass: Build everything at once
	const vault = config.adapters.reduce(
		(vault, adapter) => {
			// For each schema in this adapter
			Object.entries(adapter.schemas).forEach(([schemaName, schema]) => {
				const prefixedName = `${adapter.id}_${schemaName}`;
				
				// Create base methods for this subfolder
				vault[prefixedName] = createSubfolderMethods(
					config.path,
					prefixedName,
					schema
				);
			});

			// If adapter has custom methods, add them
			if (adapter.methods) {
				// Build vault context for this adapter (only its own schemas)
				const vaultContext = Object.fromEntries(
					Object.keys(adapter.schemas).map((schemaName) => [
						schemaName,
						vault[`${adapter.id}_${schemaName}`]
					])
				);

				// Get custom methods from adapter
				const customMethods = adapter.methods(vaultContext) || {};

				// Merge custom methods into the appropriate subfolders
				Object.entries(customMethods).forEach(([schemaName, methods]) => {
					if (methods) {
						Object.assign(vault[`${adapter.id}_${schemaName}`], methods);
					}
				});
			}

			return vault;
		},
		{
			// Start with core vault methods
			async sync() {
				console.log('Syncing vault to SQLite...');
			},
			async refresh() {
				console.log('Refreshing vault from disk...');
			},
			async export(format: 'json' | 'sql') {
				console.log(`Exporting vault as ${format}...`);
				if (format === 'json') {
					const allData: Record<string, any[]> = {};
					// Get all subfolders (excluding core methods)
					const subfolders = Object.entries(this).filter(
						([key, value]) => typeof value === 'object' && 'getAll' in value
					);
					for (const [name, subfolder] of subfolders) {
						allData[name] = await (subfolder as any).getAll();
					}
					return JSON.stringify(allData, null, 2);
				}
				return '-- SQL export not implemented yet';
			},
			async stats() {
				// Get all subfolders (excluding core methods)
				const subfolders = Object.entries(this).filter(
					([key, value]) => typeof value === 'object' && 'count' in value
				);
				let totalRecords = 0;
				for (const [, subfolder] of subfolders) {
					totalRecords += await (subfolder as any).count();
				}
				return {
					subfolders: subfolders.length,
					totalRecords,
					lastSync: null,
				};
			},
			async query(sql: string) {
				console.log('Executing SQL query:', sql);
				return [];
			},
		} as any
	);

	return vault as BuildVaultType<TAdapters>;
}

/**
 * Alternative: Even cleaner with a builder pattern
 */
export function defineVaultBuilder<const TAdapters extends readonly AdapterConfig[]>(
	config: VaultConfig<TAdapters>,
): BuildVaultType<TAdapters> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Build all subfolders in one go
	const subfolders = config.adapters.flatMap(adapter => {
		// First, create all base subfolders for this adapter
		const baseSubfolders = Object.entries(adapter.schemas).map(([schemaName, schema]) => ({
			name: `${adapter.id}_${schemaName}`,
			methods: createSubfolderMethods(config.path, `${adapter.id}_${schemaName}`, schema),
			schemaName,
			adapterId: adapter.id
		}));

		// If adapter has custom methods, enhance the subfolders
		if (adapter.methods) {
			// Create context mapping
			const vaultContext = Object.fromEntries(
				baseSubfolders.map(({ schemaName, methods }) => [schemaName, methods])
			);

			// Get custom methods
			const customMethods = adapter.methods(vaultContext) || {};

			// Merge custom methods into base subfolders
			baseSubfolders.forEach(subfolder => {
				const methods = customMethods[subfolder.schemaName];
				if (methods) {
					Object.assign(subfolder.methods, methods);
				}
			});
		}

		return baseSubfolders;
	});

	// Assemble final vault object
	return {
		// Spread all subfolders as properties
		...Object.fromEntries(
			subfolders.map(({ name, methods }) => [name, methods])
		),

		// Core vault methods
		async sync() {
			console.log('Syncing vault to SQLite...');
		},

		async refresh() {
			console.log('Refreshing vault from disk...');
		},

		async export(format: 'json' | 'sql') {
			console.log(`Exporting vault as ${format}...`);
			if (format === 'json') {
				const allData: Record<string, any[]> = {};
				for (const { name, methods } of subfolders) {
					allData[name] = await methods.getAll();
				}
				return JSON.stringify(allData, null, 2);
			}
			return '-- SQL export not implemented yet';
		},

		async stats() {
			let totalRecords = 0;
			for (const { methods } of subfolders) {
				totalRecords += await methods.count();
			}
			return {
				subfolders: subfolders.length,
				totalRecords,
				lastSync: null,
			};
		},

		async query(sql: string) {
			console.log('Executing SQL query:', sql);
			return [];
		},
	} as BuildVaultType<TAdapters>;
}

/**
 * Ultra-clean: Using reduce with spread for maximum elegance
 */
export function defineVaultUltraClean<const TAdapters extends readonly AdapterConfig[]>(
	config: VaultConfig<TAdapters>,
): BuildVaultType<TAdapters> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	return config.adapters.reduce((vault, adapter) => {
		// Process all schemas for this adapter
		const adapterSubfolders = Object.entries(adapter.schemas).reduce((acc, [schemaName, schema]) => {
			const prefixedName = `${adapter.id}_${schemaName}`;
			
			// Create base methods
			acc[prefixedName] = createSubfolderMethods(config.path, prefixedName, schema);
			
			return acc;
		}, {} as Record<string, any>);

		// Add custom methods if adapter has them
		if (adapter.methods) {
			// Create vault context (maps original names to prefixed subfolders)
			const vaultContext = Object.entries(adapter.schemas).reduce((ctx, [schemaName]) => {
				ctx[schemaName] = adapterSubfolders[`${adapter.id}_${schemaName}`];
				return ctx;
			}, {} as Record<string, any>);

			// Get and apply custom methods
			const customMethods = adapter.methods(vaultContext) || {};
			Object.entries(customMethods).forEach(([schemaName, methods]) => {
				if (methods) {
					Object.assign(adapterSubfolders[`${adapter.id}_${schemaName}`], methods);
				}
			});
		}

		// Merge this adapter's subfolders into the vault
		return { ...vault, ...adapterSubfolders };
	}, {
		// Initialize with core vault methods
		async sync() { console.log('Syncing vault to SQLite...'); },
		async refresh() { console.log('Refreshing vault from disk...'); },
		async export(format: 'json' | 'sql') {
			console.log(`Exporting vault as ${format}...`);
			const subfolders = Object.entries(this).filter(
				([, v]) => typeof v === 'object' && 'getAll' in v
			);
			if (format === 'json') {
				const allData: Record<string, any[]> = {};
				for (const [name, subfolder] of subfolders) {
					allData[name] = await (subfolder as any).getAll();
				}
				return JSON.stringify(allData, null, 2);
			}
			return '-- SQL export not implemented yet';
		},
		async stats() {
			const subfolders = Object.entries(this).filter(
				([, v]) => typeof v === 'object' && 'count' in v
			);
			let totalRecords = 0;
			for (const [, subfolder] of subfolders) {
				totalRecords += await (subfolder as any).count();
			}
			return { subfolders: subfolders.length, totalRecords, lastSync: null };
		},
		async query(sql: string) {
			console.log('Executing SQL query:', sql);
			return [];
		},
	} as any) as BuildVaultType<TAdapters>;
}

/**
 * Create base CRUD methods for a subfolder (same as before)
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