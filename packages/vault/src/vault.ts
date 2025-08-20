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
	SchemaDefinition,
} from './types';

/**
 * Define a vault with adapters
 */
export function defineVault<const TAdapters extends readonly AdapterConfig[]>(
	config: VaultConfig<TAdapters>,
): BuildVaultType<TAdapters> {
	const vault: any = {};

	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Build all subfolders with base methods
	for (const adapter of config.adapters) {
		for (const [subfolder, schema] of Object.entries(adapter.schemas)) {
			// Create subfolder if it doesn't exist already
			if (!vault[subfolder]) {
				vault[subfolder] = createSubfolderMethods(
					config.path,
					subfolder,
					schema,
				);
			}
		}
	}

	// Add custom methods from adapters
	for (const adapter of config.adapters) {
		if (adapter.methods) {
			// Create vault context with only the adapter's subfolders
			const vaultContext: any = {};
			for (const subfolder of Object.keys(adapter.schemas)) {
				vaultContext[subfolder] = vault[subfolder];
			}

			// Get custom methods from adapter
			const customMethods = adapter.methods(vaultContext);

			// Merge custom methods into existing subfolders
			for (const [subfolder, methods] of Object.entries(customMethods || {})) {
				if (vault[subfolder] && methods) {
					Object.assign(vault[subfolder], methods);
				}
			}
		}
	}

	// Add core vault methods (without $ prefix)
	vault.sync = async () => {
		console.log('Syncing vault to SQLite...');
		// In a real implementation, this would sync markdown files to SQLite
	};

	vault.refresh = async () => {
		console.log('Refreshing vault from disk...');
		// Reload all markdown files
	};

	vault.export = async (format: 'json' | 'sql') => {
		console.log(`Exporting vault as ${format}...`);

		if (format === 'json') {
			const allData: Record<string, any[]> = {};

			for (const adapter of config.adapters) {
				for (const subfolder of Object.keys(adapter.schemas)) {
					if (vault[subfolder]) {
						allData[subfolder] = await vault[subfolder].getAll();
					}
				}
			}

			return JSON.stringify(allData, null, 2);
		}

		return '-- SQL export not implemented yet';
	};

	vault.stats = async () => {
		let totalRecords = 0;
		let subfolderCount = 0;

		for (const adapter of config.adapters) {
			for (const subfolder of Object.keys(adapter.schemas)) {
				if (vault[subfolder]) {
					subfolderCount++;
					totalRecords += await vault[subfolder].count();
				}
			}
		}

		return {
			subfolders: subfolderCount,
			totalRecords,
			lastSync: null,
		};
	};

	vault.query = async (sql: string) => {
		console.log('Executing SQL query:', sql);
		// In a real implementation, this would query the SQLite database
		return [];
	};

	return vault as BuildVaultType<TAdapters>;
}

/**
 * Create base CRUD methods for a subfolder
 */
function createSubfolderMethods(
	vaultPath: string,
	subfolder: string,
	schema: SchemaDefinition,
): BaseSubfolderMethods<any> {
	const subfolderPath = join(vaultPath, subfolder);

	// Ensure subfolder exists
	if (!existsSync(subfolderPath)) {
		mkdir(subfolderPath, { recursive: true });
	}

	return {
		async getById(id: string) {
			const filePath = join(subfolderPath, `${id}.md`);
			if (!existsSync(filePath)) return null;

			const content = await readFile(filePath, 'utf-8');
			const { data, content: body } = matter(content);

			return {
				...data,
				id,
				content: body,
			};
		},

		async getAll() {
			if (!existsSync(subfolderPath)) return [];

			const files = await readdir(subfolderPath);
			const mdFiles = files.filter((f) => f.endsWith('.md'));

			const records = await Promise.all(
				mdFiles.map(async (file) => {
					const id = file.replace('.md', '');
					return this.getById(id);
				}),
			);

			return records.filter(Boolean);
		},

		async create(record: any) {
			const id = `${subfolder}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const { content = '', ...frontMatter } = record;

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = join(subfolderPath, `${id}.md`);

			await writeFile(filePath, fileContent);

			return {
				...frontMatter,
				id,
				content,
			};
		},

		async update(id: string, updates: any) {
			const existing = await this.getById(id);
			if (!existing) throw new Error(`Record ${id} not found`);

			const { content = existing.content, ...frontMatter } = updates;
			const updated = { ...existing, ...frontMatter, content };

			const fileContent = matter.stringify(content, { ...frontMatter, id });
			const filePath = join(subfolderPath, `${id}.md`);

			await writeFile(filePath, fileContent);

			return updated;
		},

		async delete(id: string) {
			const filePath = join(subfolderPath, `${id}.md`);
			if (!existsSync(filePath)) return false;

			await unlink(filePath);
			return true;
		},

		async find(query: any) {
			const all = await this.getAll();

			// Simple query implementation
			if (query.where) {
				return all.filter((record: any) => {
					return Object.entries(query.where).every(
						([key, value]) => record[key] === value,
					);
				});
			}

			if (query.orderBy) {
				all.sort((a: any, b: any) => {
					const aVal = a[query.orderBy];
					const bVal = b[query.orderBy];
					const order = query.order === 'desc' ? -1 : 1;
					return aVal > bVal ? order : -order;
				});
			}

			if (query.limit) {
				return all.slice(0, query.limit);
			}

			return all;
		},

		async count() {
			const all = await this.getAll();
			return all.length;
		},

		async where(field: string, value: any) {
			const all = await this.getAll();
			return all.filter((record: any) => record[field] === value);
		},
	};
}
