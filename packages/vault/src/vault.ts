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
 * Define a vault with adapters
 */
export function defineVault<const TAdapters extends readonly AdapterConfig[]>(
	config: VaultConfig<TAdapters>,
): BuildVaultType<TAdapters> {
	// Ensure vault directory exists
	if (!existsSync(config.path)) {
		mkdir(config.path, { recursive: true });
	}

	// Collect all schemas from adapters
	const allSchemas = config.adapters.reduce((acc, adapter) => {
		for (const [name, schema] of Object.entries(adapter.schemas)) {
			acc[name] = acc[name] || schema; // Use first schema if duplicates
		}
		return acc;
	}, {} as Record<string, SchemaDefinition>);

	// Build subfolders with base methods
	const baseSubfolders = Object.fromEntries(
		Object.entries(allSchemas).map(([name, schema]) => [
			name,
			createSubfolderMethods(config.path, name, schema)
		])
	);

	// Apply custom methods from each adapter
	const subfolders = config.adapters.reduce((acc, adapter) => {
		if (!adapter.methods) return acc;

		// Build vault context with only this adapter's subfolders
		const vaultContext = Object.fromEntries(
			Object.keys(adapter.schemas)
				.filter(key => acc[key])
				.map(key => [key, acc[key]])
		);

		// Get and merge custom methods
		const customMethods = adapter.methods(vaultContext) || {};
		
		// Merge methods into subfolders
		for (const [name, methods] of Object.entries(customMethods)) {
			if (acc[name] && methods) {
				Object.assign(acc[name], methods);
			}
		}
		
		return acc;
	}, { ...baseSubfolders });

	// Build the vault object in one go using spread syntax
	const vault = {
		...subfolders,

		// Core vault methods
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

				for (const subfolder of Object.keys(subfolders)) {
					allData[subfolder] = await subfolders[subfolder].getAll();
				}

				return JSON.stringify(allData, null, 2);
			}

			return '-- SQL export not implemented yet';
		},

		async stats() {
			const subfolderCount = Object.keys(subfolders).length;
			let totalRecords = 0;

			for (const subfolder of Object.values(subfolders)) {
				totalRecords += await subfolder.count();
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
	};

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

		async create(record: Omit<InferRecord<TSchema>, 'id'>): Promise<InferRecord<TSchema>> {
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

		async update(id: string, updates: Partial<InferRecord<TSchema>>): Promise<InferRecord<TSchema>> {
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

		async where<K extends keyof TSchema>(field: K, value: InferFieldType<TSchema[K]>): Promise<InferRecord<TSchema>[]> {
			const all = await this.getAll();
			return all.filter((record) => (record as any)[field] === value);
		},
	};
}
