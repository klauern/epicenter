import type {
	BaseSubfolderMethods,
	MarkdownRecord,
	SchemaDefinition,
} from './types';

/**
 * Define an adapter for the vault system
 * Provides type-safe adapter configuration with properly typed vault context in methods
 */
export function defineAdapter<
	TSchemas extends Record<string, SchemaDefinition>,
>(config: AdapterConfig<TSchemas>) {
	return config;
}

export type AdapterConfig<
	TSchemas extends Record<string, SchemaDefinition> = Record<
		string,
		SchemaDefinition
	>,
> = {
	id: string;
	name: string;
	schemas: TSchemas;
	methods?: (
		vault: { [K in keyof TSchemas]: BaseSubfolderMethods<TSchemas[K]> },
	) => {
		[K in keyof TSchemas]?: Record<string, (...args: any[]) => any>;
	};
	hooks?: {
		beforeRead?: (
			record: MarkdownRecord,
		) => MarkdownRecord | Promise<MarkdownRecord>;
		afterRead?: (
			record: MarkdownRecord,
		) => MarkdownRecord | Promise<MarkdownRecord>;
		beforeWrite?: (
			record: MarkdownRecord,
		) => MarkdownRecord | Promise<MarkdownRecord>;
		afterWrite?: (
			record: MarkdownRecord,
		) => MarkdownRecord | Promise<MarkdownRecord>;
		beforeSync?: (
			records: MarkdownRecord[],
		) => MarkdownRecord[] | Promise<MarkdownRecord[]>;
		afterSync?: (records: MarkdownRecord[]) => void | Promise<void>;
	};
};
