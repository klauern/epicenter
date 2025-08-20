import type { AdapterConfig, SchemaDefinition } from './types';

/**
 * Define an adapter for the vault system
 * Adapters add schemas, methods, and hooks to extend vault functionality
 *
 * This is essentially an identity function that provides type inference
 */
export function defineAdapter<
	const TSchemas extends Record<string, SchemaDefinition>,
>(config: AdapterConfig<TSchemas>): AdapterConfig<TSchemas> {
	return config;
}
