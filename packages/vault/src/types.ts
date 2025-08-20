// Core type definitions for the vault system

import type { AdapterConfig } from './adapter';

export type SchemaDefinition = {
	[fieldName: string]: 'text' | 'number' | 'boolean' | 'json' | 'date';
};

export type MarkdownRecord = {
	id: string;
	[key: string]: unknown;
	content?: string;
};

export type VaultConfig<TAdapters extends readonly AdapterConfig[]> = {
	path: string;
	adapters: TAdapters;
	database?: {
		path?: string;
		options?: any;
	};
	sync?: {
		auto?: boolean;
		interval?: number;
		strategy?: 'immediate' | 'batch' | 'manual';
	};
	cache?: {
		enabled?: boolean;
		ttl?: number;
	};
};

// Type inference utilities
export type InferFieldType<T> = T extends 'text'
	? string
	: T extends 'number'
		? number
		: T extends 'boolean'
			? boolean
			: T extends 'date'
				? Date
				: T extends 'json'
					? any
					: unknown;

export type InferRecord<TSchema extends SchemaDefinition> = {
	id: string;
	content?: string;
} & {
	[K in keyof TSchema]: InferFieldType<TSchema[K]>;
};

// Base methods every subfolder gets
export type BaseSubfolderMethods<TSchema extends SchemaDefinition> = {
	getById(id: string): Promise<InferRecord<TSchema> | null>;
	getAll(): Promise<InferRecord<TSchema>[]>;
	create(
		record: Omit<InferRecord<TSchema>, 'id'>,
	): Promise<InferRecord<TSchema>>;
	update(
		id: string,
		updates: Partial<InferRecord<TSchema>>,
	): Promise<InferRecord<TSchema>>;
	delete(id: string): Promise<boolean>;
	find(query: any): Promise<InferRecord<TSchema>[]>;
	count(): Promise<number>;
	where<K extends keyof TSchema>(
		field: K,
		value: InferFieldType<TSchema[K]>,
	): Promise<InferRecord<TSchema>[]>;
};

// Vault core methods
export type VaultCoreMethods = {
	$sync(): Promise<void>;
	$refresh(): Promise<void>;
	$export(format: 'json' | 'sql'): Promise<string>;
	$stats(): Promise<{
		subfolders: number;
		totalRecords: number;
		lastSync: Date | null;
	}>;
	$query<T = any>(sql: string): Promise<T[]>;
};

// Complex type builders for full inference
export type ExtractSchemaForSubfolder<
	T extends readonly AdapterConfig[],
	Subfolder extends string,
> = T extends readonly [infer First, ...infer Rest]
	? First extends AdapterConfig<infer S>
		? Subfolder extends keyof S
			? S[Subfolder]
			: Rest extends readonly AdapterConfig[]
				? ExtractSchemaForSubfolder<Rest, Subfolder>
				: never
		: never
	: never;

// Extract methods for a specific subfolder from adapters
// Since methods are now built dynamically, we'll type them as any for now
// In a real implementation, we'd need more complex type inference
export type ExtractMethodsForSubfolder<
	T extends readonly AdapterConfig[],
	Subfolder extends string,
> = Record<string, (...args: any[]) => any>;

export type ExtractAllSubfolders<T extends readonly AdapterConfig[]> =
	T extends readonly [infer First, ...infer Rest]
		? First extends AdapterConfig<infer S>
			? Rest extends readonly AdapterConfig[]
				? { [K in keyof S]: S[K] } | ExtractAllSubfolders<Rest>
				: { [K in keyof S]: S[K] }
			: never
		: never;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
	k: infer I,
) => void
	? I
	: never;

export type BuildVaultType<TAdapters extends readonly AdapterConfig[]> = {
	[K in keyof UnionToIntersection<
		ExtractAllSubfolders<TAdapters>
	>]: K extends string
		? BaseSubfolderMethods<ExtractSchemaForSubfolder<TAdapters, K>> &
				ExtractMethodsForSubfolder<TAdapters, K>
		: never;
} & VaultCoreMethods;
