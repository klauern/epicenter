import type {
	AdapterConfig,
	SchemaDefinition,
	VaultContext,
	AdapterHooks,
} from './types';

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
		withMethods(
			methods: (vault: VaultContext<TSchemas>) => {
				[K in keyof TSchemas]?: Record<string, (...args: any[]) => any>;
			},
		) {
			return {
				...config,
				methods,
			} satisfies AdapterConfig<TSchemas>;
		},
	};
}
