import type { AdapterConfig, SchemaDefinition } from './types';

/**
 * Define an adapter for the vault system
 * Adapters add schemas, methods, and hooks to extend vault functionality
 */
export function defineAdapter<
  const TSchemas extends Record<string, SchemaDefinition>,
  const TMethods extends Record<string, Record<string, Function>>
>(config: {
  id: string;
  name: string;
  schemas: TSchemas;
  methods?: TMethods;
  hooks?: {
    beforeRead?: (record: any) => any | Promise<any>;
    afterRead?: (record: any) => any | Promise<any>;
    beforeWrite?: (record: any) => any | Promise<any>;
    afterWrite?: (record: any) => any | Promise<any>;
  };
}): AdapterConfig<TSchemas, TMethods> {
  return config as AdapterConfig<TSchemas, TMethods>;
}