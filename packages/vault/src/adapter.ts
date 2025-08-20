import type {
	BaseSubfolderMethods,
	MarkdownRecord,
	SchemaDefinition,
} from './types';

// Adapter configuration types
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
	hooks?: AdapterHooks;
};

type AdapterHooks = {
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

/**
 * Define an adapter with chainable methods
 * First call: define id, name, schemas, and optional hooks
 * Chain .withMethods() to add methods with properly typed vault context
 */
export function defineAdapter<
	TSchemas extends Record<string, SchemaDefinition>,
>(config: Omit<AdapterConfig<TSchemas>, 'methods'>) {
	return {
		...config,
		withMethods: (methods: AdapterConfig<TSchemas>['methods']) =>
			({ ...config, methods }) satisfies AdapterConfig<TSchemas>,
	};
}
