import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const accessAttempts = sqliteTable('private_access_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expires: integer('expires').notNull(),
}, (table) => [index('idx_private_attempts_expires').on(table.expires)]);

export const accessSessions = sqliteTable('private_access_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  revision: text('revision').notNull(),
  expires: integer('expires').notNull(),
}, (table) => [index('idx_private_sessions_expires').on(table.expires)]);
