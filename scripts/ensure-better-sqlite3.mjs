import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function ensureBetterSqlite3() {
	try {
		require('better-sqlite3');
	} catch (error) {
		console.warn('[setup] better-sqlite3 native binding is missing or incompatible. Rebuilding...');
		execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });

		// Re-check and fail fast with the original error context if rebuild did not help.
		try {
			require('better-sqlite3');
			console.log('[setup] better-sqlite3 native binding is ready.');
		} catch {
			throw error;
		}
	}
}

ensureBetterSqlite3();
