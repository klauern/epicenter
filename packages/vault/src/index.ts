// Core exports
export { definePlugin } from './plugin';
export { defineVault } from './vault';

// Type exports
export type { PluginConfig } from './plugin';
export type { 
  VaultConfig, 
  SchemaDefinition,
  FieldDefinition,
  BaseTableMethods,
  VaultCoreMethods,
  InferRecord
} from './types';

// Utility exports
export * from './utils';

// Example plugins
export { redditPlugin } from './plugins/reddit';