import { join } from 'node:path';

/**
 * Path and naming utilities for the vault system
 * 
 * Conventions:
 * - Filesystem: /vaultPath/pluginId/tableName/
 * - SQLite: pluginId_tableName
 * - API: vault.pluginId.tableName
 */

/**
 * Get the filesystem path for a plugin's directory
 * @example getPluginPath('./vault', 'reddit') => './vault/reddit'
 */
export function getPluginPath(vaultPath: string, pluginId: string): string {
	return join(vaultPath, pluginId);
}

/**
 * Get the filesystem path for a table's directory
 * @example getTablePath('./vault', 'reddit', 'posts') => './vault/reddit/posts'
 */
export function getTablePath(vaultPath: string, pluginId: string, tableName: string): string {
	return join(vaultPath, pluginId, tableName);
}

/**
 * Get the SQLite table name for a plugin's table
 * @example getSQLiteTableName('reddit', 'posts') => 'reddit_posts'
 */
export function getSQLiteTableName(pluginId: string, tableName: string): string {
	return `${pluginId}_${tableName}`;
}

/**
 * Parse a SQLite table name back into plugin and table components
 * @example parseSQLiteTableName('reddit_posts') => { pluginId: 'reddit', tableName: 'posts' }
 */
export function parseSQLiteTableName(sqliteTableName: string): { pluginId: string; tableName: string } {
	const [pluginId, ...tableNameParts] = sqliteTableName.split('_');
	return {
		pluginId,
		tableName: tableNameParts.join('_'), // Handle table names with underscores
	};
}

/**
 * Generate a unique record ID for a table
 * @example generateRecordId('reddit_posts') => 'reddit_posts_1234567890_abc123'
 */
export function generateRecordId(sqliteTableName: string): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 9);
	return `${sqliteTableName}_${timestamp}_${random}`;
}

/**
 * Get the markdown file path for a record
 * @example getRecordPath('./vault', 'reddit', 'posts', 'reddit_posts_123') => './vault/reddit/posts/reddit_posts_123.md'
 */
export function getRecordPath(vaultPath: string, pluginId: string, tableName: string, recordId: string): string {
	return join(getTablePath(vaultPath, pluginId, tableName), `${recordId}.md`);
}

/**
 * Extract the record ID from a markdown filename
 * @example parseRecordFilename('reddit_posts_123.md') => 'reddit_posts_123'
 */
export function parseRecordFilename(filename: string): string {
	return filename.replace('.md', '');
}

/**
 * Check if a filename is a markdown file
 * @example isMarkdownFile('post.md') => true
 */
export function isMarkdownFile(filename: string): boolean {
	return filename.endsWith('.md');
}