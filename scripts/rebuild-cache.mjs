#!/usr/bin/env node
/**
 * Force the SQLite cache to rebuild from the filesystem on next server boot.
 * Sets `_meta.schemaVersion` to a sentinel so the next `bootstrapCache()` call
 * detects a mismatch and (because the filesystem has real data) wipes + re-
 * ingests the cache.
 *
 * Use this after hand-editing files under PDF_DIR/threads/*.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'reos.db');

if (!fs.existsSync(DB_PATH)) {
	console.error(`Cache DB not found at ${DB_PATH}`);
	process.exit(1);
}

const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('schemaVersion', ?)").run('0');
db.close();

console.log('Cache marked stale. Restart the dev server to trigger rebuild.');
