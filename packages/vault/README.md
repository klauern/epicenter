# Vault System

A TypeScript-first vault system that uses markdown files as a database with full type inference and a plugin-based architecture inspired by BetterAuth.

## Core Concepts

The vault system combines the simplicity of markdown files with the power of database queries:

- **Markdown files are the source of truth** - Each record is a `.md` file with YAML front matter
- **Subfolder organization** - Each subfolder represents a logical collection (like database tables)
- **Full TypeScript inference** - Complete IntelliSense for all vault operations
- **Adapter-based extensibility** - Add schemas, methods, and hooks through adapters
- **Human-readable storage** - Version control friendly, directly editable

## Quick Start

```typescript
import { defineVault, defineAdapter } from '@repo/vault';

// Define an adapter
const myAdapter = defineAdapter({
  id: 'my-adapter',
  name: 'My Adapter',
  schemas: {
    items: {
      title: 'text',
      description: 'text',
      priority: 'number',
      completed: 'boolean',
      created_at: 'date',
    }
  },
  methods: {
    items: {
      async getHighPriority(this: any) {
        const all = await this.getAll();
        return all.filter(item => item.priority > 5);
      }
    }
  }
});

// Create a vault
const vault = defineVault({
  path: './my-vault',
  adapters: [myAdapter] as const,
});

// Use with full type safety
const item = await vault.items.create({
  title: 'Build something amazing',
  description: 'Using the vault system',
  priority: 10,
  completed: false,
  created_at: new Date(),
});

const highPriority = await vault.items.getHighPriority();
```

## Features

### Type-Safe API

The vault provides complete TypeScript inference. When you add adapters, TypeScript automatically knows about:
- All subfolders (collections)
- All fields and their types
- All custom methods
- Parameter and return types

### Built-in Methods

Every subfolder gets these methods automatically:

```typescript
vault.subfolder.getById(id: string)
vault.subfolder.getAll()
vault.subfolder.create(record)
vault.subfolder.update(id, updates)
vault.subfolder.delete(id)
vault.subfolder.find(query)
vault.subfolder.count()
vault.subfolder.where(field, value)
```

### Custom Methods

Adapters can add custom methods to subfolders:

```typescript
const adapter = defineAdapter({
  methods: {
    posts: {
      async getTopPosts(limit: number) {
        // Custom logic here
      },
      async searchPosts(query: string) {
        // Search implementation
      }
    }
  }
});
```

### Hooks

Transform data at various lifecycle points:

```typescript
const adapter = defineAdapter({
  hooks: {
    beforeWrite: async (record) => {
      // Modify before saving
      return record;
    },
    afterRead: async (record) => {
      // Transform after reading
      return record;
    }
  }
});
```

### File Structure

The vault creates this structure:

```
my-vault/
├── items/
│   ├── items_1234567890_abc.md
│   ├── items_1234567891_def.md
│   └── items_1234567892_ghi.md
├── posts/
│   └── posts_1234567893_jkl.md
└── users/
    └── users_1234567894_mno.md
```

Each markdown file has YAML front matter with the record data:

```markdown
---
id: items_1234567890_abc
title: My Item
priority: 10
completed: false
created_at: 2025-08-20T12:00:00Z
---
Optional markdown content goes here
```

## Running the Demo

```bash
# Install dependencies
bun install

# Run the demo
bun demo

# Or watch mode
bun dev
```

The demo creates sample Reddit and Twitter data in markdown files, demonstrating:
- Multiple adapters working together
- Custom methods for each data type
- Full TypeScript type safety
- Query capabilities

## Architecture

The system is built with several key components:

1. **Type System** (`src/types.ts`) - Advanced TypeScript types for full inference
2. **Adapter System** (`src/adapter.ts`) - Plugin architecture for extensibility
3. **Vault Core** (`src/vault.ts`) - Main vault implementation with file operations
4. **Example Adapters** - Reddit and Twitter adapters showing real-world usage

## Future Enhancements

Planned features include:
- SQLite sync for advanced queries
- Automatic migrations
- Real-time file watching
- Import/export utilities
- Schema validation
- Relationship support
- Advanced caching

## Why Markdown Files?

Using markdown files as a database provides unique benefits:
- **Version control friendly** - Track changes with git
- **Human readable** - Edit directly with any text editor
- **Portable** - No database setup required
- **Flexible** - Mix structured data with rich content
- **Transparent** - See exactly how your data is stored

This makes the vault perfect for content management, personal knowledge bases, static site generators, and any application where data transparency and portability matter.
