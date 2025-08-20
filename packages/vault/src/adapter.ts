import type { AdapterConfig, MethodsBuilder, SchemaDefinition } from './types';

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
		withMethods: (methods: MethodsBuilder<TSchemas>) =>
			({ ...config, methods }) satisfies AdapterConfig<TSchemas>,
	};
}
