#!/usr/bin/env node
/**
 * One-time migration: move Re:OS data from the legacy SQLite source of truth
 * into the new thread-rooted filesystem layout under PDF_DIR.
 *
 *   <PDF_DIR>/
 *     threads/{slug}/
 *       meta.json
 *       synthesis.md
 *       papers/{arxivId}/
 *         meta.json
 *         paper.pdf
 *         summary.md
 *         notes.md
 *         annotations.json
 *       chats/{chatId}/
 *         meta.json
 *         messages.jsonl
 *     connections.json
 *
 * Papers are single-owned — if a paper currently belongs to multiple threads
 * via `thread_papers`, it lands in the one with the lowest `order`. A warning
 * is printed listing the other memberships so the user can re-add manually.
 *
 * After migration, `_meta.schemaVersion` is set to `0` so the next server
 * startup's `bootstrapCache()` sees a version mismatch, detects that the
 * filesystem now has real data, and rebuilds the cache from disk. No
 * backfill is run here — the cache rebuild is the source of cache truth.
 *
 * The script is idempotent: it skips any entity whose target folder already
 * exists on disk, so it is safe to re-run if a prior invocation was
 * interrupted.
 *
 * Run with: npm run migrate-fs
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'reos.db');

function loadPdfDir() {
	if (process.env.PDF_DIR) return path.resolve(process.env.PDF_DIR);
	try {
		const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
		const match = envText.match(/^PDF_DIR\s*=\s*"?(.*?)"?\s*$/m);
		if (match) return path.resolve(match[1]);
	} catch {
		/* no .env */
	}
	return null;
}

const PDF_DIR = loadPdfDir();
if (!PDF_DIR) {
	console.error('PDF_DIR not set in env or .env');
	process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
	console.error(`Legacy DB not found at ${DB_PATH}`);
	process.exit(1);
}

const THREADS_DIR = path.join(PDF_DIR, 'threads');
const CONNECTIONS_FILE = path.join(PDF_DIR, 'connections.json');
const INBOX_SLUG = 'inbox';

// --- helpers ---

function slugify(title) {
	const base = String(title || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/g, '');
	return base || 'thread';
}

function dedupe(candidate, used) {
	if (!used.has(candidate)) return candidate;
	let i = 2;
	while (used.has(`${candidate}-${i}`)) i++;
	return `${candidate}-${i}`;
}

function writeJson(filePath, value) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = filePath + '.tmp';
	fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
	fs.renameSync(tmp, filePath);
}

function writeText(filePath, text) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = filePath + '.tmp';
	fs.writeFileSync(tmp, text);
	fs.renameSync(tmp, filePath);
}

function moveIfExists(src, dst) {
	if (!fs.existsSync(src)) return false;
	if (fs.existsSync(dst)) return true;
	fs.mkdirSync(path.dirname(dst), { recursive: true });
	fs.renameSync(src, dst);
	return true;
}

function parseJsonField(raw, fallback = []) {
	try {
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

// --- main ---

console.log(`[migrate] legacy DB:   ${DB_PATH}`);
console.log(`[migrate] target root: ${PDF_DIR}\n`);

fs.mkdirSync(THREADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

// --- Inbox ---
const inboxMeta = path.join(THREADS_DIR, INBOX_SLUG, 'meta.json');
let inboxCreated = false;
if (!fs.existsSync(inboxMeta)) {
	const now = new Date().toISOString();
	writeJson(inboxMeta, {
		id: INBOX_SLUG,
		title: 'Inbox',
		question: '',
		status: 'active',
		parentThreadId: null,
		tags: [],
		createdAt: now,
		updatedAt: now,
		links: [],
	});
	writeText(path.join(THREADS_DIR, INBOX_SLUG, 'synthesis.md'), '');
	inboxCreated = true;
}

// --- Threads: assign slugs ---
const threadRows = db.prepare('SELECT * FROM threads').all();
const threadSlugs = new Map(); // row.id → slug
const usedSlugs = new Set([INBOX_SLUG]);
for (const t of threadRows) {
	const slug = dedupe(slugify(t.title), usedSlugs);
	usedSlugs.add(slug);
	threadSlugs.set(t.id, slug);
}

// --- Threads: write meta + synthesis ---
const threadLinksByThread = new Map();
for (const row of db.prepare('SELECT id, threadId, label, url FROM thread_links').all()) {
	if (!threadLinksByThread.has(row.threadId)) threadLinksByThread.set(row.threadId, []);
	threadLinksByThread.get(row.threadId).push({ id: row.id, label: row.label, url: row.url });
}

let threadsWritten = 0;
for (const t of threadRows) {
	const slug = threadSlugs.get(t.id);
	const metaPath = path.join(THREADS_DIR, slug, 'meta.json');
	if (fs.existsSync(metaPath)) continue;

	writeJson(metaPath, {
		id: slug,
		title: t.title,
		question: t.question,
		status: t.status,
		parentThreadId: t.parentThreadId ? threadSlugs.get(t.parentThreadId) ?? null : null,
		tags: parseJsonField(t.tags),
		createdAt: t.createdAt,
		updatedAt: t.updatedAt,
		links: threadLinksByThread.get(t.id) ?? [],
	});
	writeText(path.join(THREADS_DIR, slug, 'synthesis.md'), t.synthesis ?? '');
	threadsWritten++;
}

// --- Papers: determine single owning thread ---
const paperRows = db.prepare('SELECT * FROM papers').all();
const paperOwners = new Map(); // paperId → owningSlug
const multiThreadWarnings = [];
for (const p of paperRows) {
	const memberships = db
		.prepare(
			'SELECT threadId, contextNote, "order" FROM thread_papers WHERE paperId = ? ORDER BY "order"',
		)
		.all(p.id);
	if (memberships.length === 0) {
		paperOwners.set(p.id, INBOX_SLUG);
		continue;
	}
	const primarySlug = threadSlugs.get(memberships[0].threadId) ?? INBOX_SLUG;
	paperOwners.set(p.id, primarySlug);
	if (memberships.length > 1) {
		multiThreadWarnings.push({
			title: p.title,
			primary: primarySlug,
			others: memberships.slice(1).map((m) => threadSlugs.get(m.threadId) ?? '(unknown)'),
		});
	}
}

// Precompute contextNote per paper (from its owning thread_papers row)
const contextNotes = new Map();
for (const p of paperRows) {
	const slug = paperOwners.get(p.id);
	// Find the thread_papers row for (paper, chosen thread)
	const threadIdForSlug = [...threadSlugs.entries()].find(([, s]) => s === slug)?.[0];
	if (!threadIdForSlug) continue;
	const row = db
		.prepare('SELECT contextNote FROM thread_papers WHERE threadId = ? AND paperId = ?')
		.get(threadIdForSlug, p.id);
	contextNotes.set(p.id, row?.contextNote ?? '');
}

// --- Papers: materialize folders ---
let papersPlaced = 0;
let pdfsMoved = 0;
let summariesMoved = 0;
for (const p of paperRows) {
	const slug = paperOwners.get(p.id) ?? INBOX_SLUG;
	const aid = p.arxivId || p.id;
	const paperDir = path.join(THREADS_DIR, slug, 'papers', aid);
	const metaPath = path.join(paperDir, 'meta.json');
	if (fs.existsSync(metaPath)) {
		// Still try to move PDF / summary if they are at legacy root.
		if (moveIfExists(path.join(PDF_DIR, `${aid}.pdf`), path.join(paperDir, 'paper.pdf'))) pdfsMoved++;
		if (moveIfExists(path.join(PDF_DIR, `${aid}.summary.md`), path.join(paperDir, 'summary.md'))) summariesMoved++;
		continue;
	}

	writeJson(metaPath, {
		id: p.id,
		arxivId: p.arxivId,
		title: p.title,
		authors: parseJsonField(p.authors),
		abstract: p.abstract,
		publishedDate: p.publishedDate,
		categories: parseJsonField(p.categories),
		tags: parseJsonField(p.tags),
		readingStatus: p.readingStatus,
		rating: p.rating,
		arxivUrl: p.arxivUrl,
		addedAt: p.addedAt,
		citations: parseJsonField(p.citations),
		links: parseJsonField(p.links, []),
		contextNote: contextNotes.get(p.id) ?? '',
	});

	if (moveIfExists(path.join(PDF_DIR, `${aid}.pdf`), path.join(paperDir, 'paper.pdf'))) pdfsMoved++;
	if (moveIfExists(path.join(PDF_DIR, `${aid}.summary.md`), path.join(paperDir, 'summary.md'))) summariesMoved++;

	// Concatenate all notes into one notes.md (single-note-per-paper is the
	// new model; multi-row legacy notes become consecutive paragraphs).
	const notes = db
		.prepare('SELECT content FROM notes WHERE paperId = ? ORDER BY createdAt ASC')
		.all(p.id);
	if (notes.length > 0) {
		writeText(path.join(paperDir, 'notes.md'), notes.map((n) => n.content).join('\n\n'));
	}

	const anns = db.prepare('SELECT * FROM annotations WHERE paperId = ?').all(p.id);
	if (anns.length > 0) {
		writeJson(
			path.join(paperDir, 'annotations.json'),
			anns.map((a) => ({
				id: a.id,
				type: a.type,
				content: a.content,
				selectedText: a.selectedText,
				page: a.page,
				color: a.color,
				createdAt: a.createdAt,
				...(a.linkedPaperId ? { linkedPaperId: a.linkedPaperId } : {}),
			})),
		);
	}

	papersPlaced++;
}

// --- Chats ---
const chatRows = db.prepare('SELECT * FROM chats').all();
let chatsPlaced = 0;
let chatMsgCount = 0;
for (const c of chatRows) {
	let slug = INBOX_SLUG;
	if (c.threadId && threadSlugs.has(c.threadId)) slug = threadSlugs.get(c.threadId);
	else if (c.paperId && paperOwners.has(c.paperId)) slug = paperOwners.get(c.paperId);

	const chatDir = path.join(THREADS_DIR, slug, 'chats', c.id);
	const metaPath = path.join(chatDir, 'meta.json');
	if (fs.existsSync(metaPath)) continue;

	writeJson(metaPath, {
		id: c.id,
		title: c.title,
		claudeSessionId: c.claudeSessionId,
		chatEngine: c.chatEngine ?? 'sdk',
		paperId: c.paperId ?? null,
		createdAt: c.createdAt,
		updatedAt: c.updatedAt,
	});

	const msgs = db
		.prepare('SELECT * FROM chat_messages WHERE chatId = ? ORDER BY createdAt ASC')
		.all(c.id);
	const lines = msgs
		.map((m) =>
			JSON.stringify({
				id: m.id,
				role: m.role,
				content: m.content,
				parts: m.parts ? JSON.parse(m.parts) : null,
				createdAt: m.createdAt,
			}),
		)
		.join('\n');
	writeText(path.join(chatDir, 'messages.jsonl'), lines ? lines + '\n' : '');
	chatMsgCount += msgs.length;
	chatsPlaced++;
}

// --- Connections ---
const connRows = db.prepare('SELECT * FROM paper_connections').all();
if (connRows.length > 0) {
	writeJson(
		CONNECTIONS_FILE,
		connRows.map((c) => ({
			id: c.id,
			fromPaperId: c.fromPaperId,
			toPaperId: c.toPaperId,
			connectionType: c.connectionType,
			strength: c.strength,
			explanation: c.explanation,
			generatedAt: c.generatedAt,
		})),
	);
}

// --- Mark cache as stale so next startup rebuilds ---
db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('schemaVersion', ?)").run('0');
db.close();

// --- Report ---
console.log('=== Migration complete ===');
if (inboxCreated) console.log(`Created inbox thread at threads/${INBOX_SLUG}/`);
console.log(`Threads materialized: ${threadsWritten} (out of ${threadRows.length} in DB)`);
console.log(`Papers placed:        ${papersPlaced} (out of ${paperRows.length} in DB)`);
console.log(`PDFs relocated:       ${pdfsMoved}`);
console.log(`Summaries relocated:  ${summariesMoved}`);
console.log(`Chats placed:         ${chatsPlaced} (${chatMsgCount} messages)`);
console.log(`Connections:          ${connRows.length}`);

if (multiThreadWarnings.length > 0) {
	console.log(`\n⚠ ${multiThreadWarnings.length} paper(s) were in multiple threads. Placed in primary; other memberships dropped:`);
	for (const w of multiThreadWarnings) {
		console.log(`  - "${w.title}" → ${w.primary} (was also in: ${w.others.join(', ')})`);
	}
}

console.log(
	`\nCache marked stale. On next server start, bootstrapCache() will rebuild` +
		` .reos-cache from the new filesystem layout. Legacy DB preserved at ${DB_PATH}.`,
);
