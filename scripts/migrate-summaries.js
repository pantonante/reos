/**
 * One-time migration: dump existing summaries from the DB to disk as .summary.md files,
 * then null out the summary columns in the DB.
 *
 * Run with: node scripts/migrate-summaries.js
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'reos.db');
const PDF_DIR = process.env.PDF_DIR || '/Users/antonap/Library/CloudStorage/GoogleDrive-p.antonante@gmail.com/My Drive/reos';

const db = new Database(DB_PATH);

const papers = db.prepare("SELECT id, arxivId, summary, summaryDate FROM papers WHERE summary IS NOT NULL").all();

console.log(`Found ${papers.length} papers with summaries to migrate`);

let migrated = 0;
let skipped = 0;

for (const paper of papers) {
	const arxivId = paper.arxivId || paper.id;
	const summaryPath = path.join(PDF_DIR, `${arxivId}.summary.md`);

	if (fs.existsSync(summaryPath)) {
		console.log(`  SKIP ${arxivId} — .summary.md already exists`);
		skipped++;
		continue;
	}

	const generatedAt = paper.summaryDate || new Date().toISOString();
	const content = `---\ngeneratedAt: ${generatedAt}\n---\n\n${paper.summary}`;

	fs.writeFileSync(summaryPath, content, 'utf-8');
	console.log(`  WROTE ${summaryPath}`);
	migrated++;
}

// Null out summary columns in DB
db.prepare("UPDATE papers SET summary = NULL, summaryDate = NULL").run();
console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}, DB columns nulled.`);

db.close();
