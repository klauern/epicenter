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

	// First pass: create base methods for all subfolders
	const baseVault: any = {};
	for (const adapter of config.adapters) {
		for (const [subfolder, schema] of Object.entries(adapter.schemas)) {
			baseVault[subfolder] = createSubfolderProxy(
				config.path,
				subfolder,
				schema,
				{}, // No custom methods yet
			);
		}
	}

	// Second pass: add custom methods with vault context
	for (const adapter of config.adapters) {
		if (adapter.methods) {
			// Call methods builder with the vault context
			const customMethods = adapter.methods(baseVault);

			// Add custom methods to each subfolder
			for (const [subfolder, methods] of Object.entries(customMethods)) {
				if (baseVault[subfolder] && methods) {
					// Add each custom method to the subfolder
					for (const [methodName, method] of Object.entries(methods)) {
						baseVault[subfolder][methodName] = method;
					}
				}
			}
		}
	}

	// Copy to final vault
	Object.assign(vault, baseVault);

	// Add core vault methods
	vault.$sync = async () => {
		console.log('Syncing vault to SQLite...');
		// In a real implementation, this would sync markdown files to SQLite
	};

	vault.$refresh = async () => {
		console.log('Refreshing vault from disk...');
		// Reload all markdown files
	};

	vault.$export = async (format: 'json' | 'sql') => {
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

	vault.$stats = async () => {
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

	vault.$query = async (sql: string) => {
		console.log('Executing SQL query:', sql);
		// In a real implementation, this would query the SQLite database
		return [];
	};

	return vault as BuildVaultType<TAdapters>;
}

/**
 * Create a subfolder proxy with base methods and custom adapter methods
 */
function createSubfolderProxy(
	vaultPath: string,
	subfolder: string,
	schema: SchemaDefinition,
	customMethods: Record<string, Function> = {},
): BaseSubfolderMethods<any> & Record<string, Function> {
	const subfolderPath = join(vaultPath, subfolder);

	// Ensure subfolder exists
	if (!existsSync(subfolderPath)) {
		mkdir(subfolderPath, { recursive: true });
	}

	const baseMethods: BaseSubfolderMethods<any> = {
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

	// Create a combined object with all methods
	const allMethods = { ...baseMethods };

	// Bind custom methods with the full context (including other custom methods)
	for (const [name, method] of Object.entries(customMethods)) {
		allMethods[name] = method.bind(allMethods);
	}

	return allMethods;
}
