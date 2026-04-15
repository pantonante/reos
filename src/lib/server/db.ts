import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Paper, Thread, Annotation, Note, ThreadPaper, ThreadLink, Chat, ChatMessage, PaperConnection } from '$lib/types';
import {
	ensureInboxThread,
	listChatDirs,
	listPaperDirs,
	listThreadDirs,
	readAnnotations as fsReadAnnotations,
	readChat as fsReadChat,
	readChatMessages as fsReadChatMessages,
	readConnections as fsReadConnections,
	readNote as fsReadNote,
	readPaper as fsReadPaper,
	readThread as fsReadThread,
	readThreadSynthesis,
} from './fs-store';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'reos.db');

/**
 * Bumped whenever the cache shape changes in a way that requires re-ingesting
 * from the filesystem source of truth. `bootstrapCache()` compares this to the
 * `_meta.schemaVersion` row and rebuilds if they differ (and the filesystem
 * has real data to rebuild from).
 */
const SCHEMA_VERSION = 1;

let _db: Database.Database | null = null;

function getDb(): Database.Database {
	if (!_db) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
		_db = new Database(DB_PATH);
		_db.pragma('journal_mode = WAL');
		_db.pragma('foreign_keys = ON');
		initSchema(_db);
	}
	return _db;
}

function initSchema(db: Database.Database) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS papers (
			id TEXT PRIMARY KEY,
			arxivId TEXT NOT NULL,
			title TEXT NOT NULL,
			authors TEXT NOT NULL,
			abstract TEXT NOT NULL,
			publishedDate TEXT NOT NULL,
			categories TEXT NOT NULL,
			tags TEXT NOT NULL DEFAULT '[]',
			readingStatus TEXT NOT NULL DEFAULT 'unread',
			rating INTEGER,
			pdfPath TEXT NOT NULL DEFAULT '',
			arxivUrl TEXT NOT NULL DEFAULT '',
			addedAt TEXT NOT NULL,
			citations TEXT NOT NULL DEFAULT '[]',
			summary TEXT,
			summaryDate TEXT
		);

		CREATE TABLE IF NOT EXISTS threads (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			question TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'active',
			synthesis TEXT NOT NULL DEFAULT '',
			parentThreadId TEXT,
			tags TEXT NOT NULL DEFAULT '[]',
			createdAt TEXT NOT NULL,
			updatedAt TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS thread_papers (
			threadId TEXT NOT NULL,
			paperId TEXT NOT NULL,
			contextNote TEXT NOT NULL DEFAULT '',
			"order" INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (threadId, paperId),
			FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS thread_links (
			id TEXT PRIMARY KEY,
			threadId TEXT NOT NULL,
			label TEXT NOT NULL,
			url TEXT NOT NULL,
			FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS notes (
			id TEXT PRIMARY KEY,
			paperId TEXT NOT NULL,
			content TEXT NOT NULL,
			createdAt TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS annotations (
			id TEXT PRIMARY KEY,
			paperId TEXT NOT NULL,
			threadId TEXT,
			type TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			selectedText TEXT NOT NULL DEFAULT '',
			page INTEGER NOT NULL DEFAULT 0,
			color TEXT NOT NULL DEFAULT '',
			createdAt TEXT NOT NULL,
			linkedPaperId TEXT
		);

		CREATE TABLE IF NOT EXISTS chats (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			claudeSessionId TEXT,
			chatEngine TEXT NOT NULL DEFAULT 'sdk',
			paperId TEXT,
			createdAt TEXT NOT NULL,
			updatedAt TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS chat_messages (
			id TEXT PRIMARY KEY,
			chatId TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			parts TEXT,
			createdAt TEXT NOT NULL,
			FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS paper_connections (
			id TEXT PRIMARY KEY,
			fromPaperId TEXT NOT NULL,
			toPaperId TEXT NOT NULL,
			connectionType TEXT NOT NULL,
			strength REAL NOT NULL,
			explanation TEXT NOT NULL,
			generatedAt TEXT NOT NULL,
			FOREIGN KEY (fromPaperId) REFERENCES papers(id) ON DELETE CASCADE,
			FOREIGN KEY (toPaperId) REFERENCES papers(id) ON DELETE CASCADE,
			UNIQUE(fromPaperId, toPaperId, connectionType)
		);

		CREATE TABLE IF NOT EXISTS _meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`);

	// Migrations for existing databases
	const cols = db.prepare("PRAGMA table_info(papers)").all() as { name: string }[];
	const colNames = cols.map(c => c.name);
	if (!colNames.includes('links')) {
		db.exec("ALTER TABLE papers ADD COLUMN links TEXT NOT NULL DEFAULT '[]'");
	}
	// Thread-ownership columns on papers. Single-owned papers record their
	// thread slug + position + per-thread context note directly on the row
	// so the legacy `thread_papers` join is no longer load-bearing for reads.
	if (!colNames.includes('threadId')) {
		db.exec("ALTER TABLE papers ADD COLUMN threadId TEXT");
	}
	if (!colNames.includes('orderInThread')) {
		db.exec("ALTER TABLE papers ADD COLUMN orderInThread INTEGER NOT NULL DEFAULT 0");
	}
	if (!colNames.includes('contextNote')) {
		db.exec("ALTER TABLE papers ADD COLUMN contextNote TEXT NOT NULL DEFAULT ''");
	}

	// Chat migrations
	const chatCols = db.prepare("PRAGMA table_info(chats)").all() as { name: string }[];
	const chatColNames = chatCols.map(c => c.name);
	if (!chatColNames.includes('paperId')) {
		db.exec('ALTER TABLE chats ADD COLUMN paperId TEXT');
	}
	if (!chatColNames.includes('chatEngine')) {
		db.exec("ALTER TABLE chats ADD COLUMN chatEngine TEXT NOT NULL DEFAULT 'sdk'");
	}
	// Chats live inside a thread's folder. Nullable for now (legacy rows pre-
	// migration have no thread); the migration script + rebuild-from-FS both
	// populate it.
	if (!chatColNames.includes('threadId')) {
		db.exec('ALTER TABLE chats ADD COLUMN threadId TEXT');
	}

	// chat_messages migrations
	const msgCols = db.prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[];
	const msgColNames = msgCols.map(c => c.name);
	if (!msgColNames.includes('parts')) {
		db.exec('ALTER TABLE chat_messages ADD COLUMN parts TEXT');
	}
}

function getMeta(d: Database.Database, key: string): string | null {
	const row = d.prepare('SELECT value FROM _meta WHERE key = ?').get(key) as { value: string } | undefined;
	return row?.value ?? null;
}

function setMeta(d: Database.Database, key: string, value: string): void {
	d.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Returns true if `<PDF_DIR>/threads/` contains any thread folder with at
 * least one paper subfolder, i.e. the filesystem layout is genuinely populated
 * (not just the empty inbox shell we bootstrap on every startup). Used to
 * decide whether an unrecognized `_meta.schemaVersion` warrants an automatic
 * rebuild — we never want to silently wipe the legacy DB while migration is
 * still pending.
 */
function filesystemHasRealData(): boolean {
	for (const slug of listThreadDirs()) {
		if (listPaperDirs(slug).length > 0) return true;
	}
	return false;
}

export const db = {
	// Papers
	getAllPapers(): Paper[] {
		const rows = getDb().prepare('SELECT * FROM papers ORDER BY addedAt DESC').all() as any[];
		return rows.map(r => ({
			...r,
			authors: JSON.parse(r.authors),
			categories: JSON.parse(r.categories),
			tags: JSON.parse(r.tags),
			citations: JSON.parse(r.citations),
			links: JSON.parse(r.links || '[]'),
			rating: r.rating ?? null,
			summary: null as string | null,
			summaryDate: null as string | null,
		}));
	},

	getPaper(id: string): Paper | undefined {
		const r = getDb().prepare('SELECT * FROM papers WHERE id = ?').get(id) as any;
		if (!r) return undefined;
		return {
			...r,
			authors: JSON.parse(r.authors),
			categories: JSON.parse(r.categories),
			tags: JSON.parse(r.tags),
			citations: JSON.parse(r.citations),
			links: JSON.parse(r.links || '[]'),
			rating: r.rating ?? null,
			summary: null as string | null,
			summaryDate: null as string | null,
		};
	},

	addPaper(paper: Paper) {
		getDb().prepare(`
			INSERT INTO papers (id, arxivId, title, authors, abstract, publishedDate, categories, tags, readingStatus, rating, pdfPath, arxivUrl, addedAt, citations, links)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			paper.id, paper.arxivId, paper.title, JSON.stringify(paper.authors),
			paper.abstract, paper.publishedDate, JSON.stringify(paper.categories),
			JSON.stringify(paper.tags), paper.readingStatus, paper.rating,
			paper.pdfPath, paper.arxivUrl, paper.addedAt, JSON.stringify(paper.citations),
			JSON.stringify(paper.links || [])
		);
	},

	updatePaper(id: string, data: Partial<Paper>) {
		const fields: string[] = [];
		const values: any[] = [];
		const jsonFields = ['authors', 'categories', 'tags', 'citations', 'links'];
		const skipFields = ['id', 'summary', 'summaryDate'];

		for (const [key, val] of Object.entries(data)) {
			if (skipFields.includes(key)) continue;
			fields.push(`"${key}" = ?`);
			values.push(jsonFields.includes(key) ? JSON.stringify(val) : val);
		}
		if (fields.length === 0) return;
		values.push(id);
		getDb().prepare(`UPDATE papers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
	},

	removePaper(id: string) {
		const d = getDb();
		d.prepare('DELETE FROM annotations WHERE paperId = ?').run(id);
		d.prepare('DELETE FROM notes WHERE paperId = ?').run(id);
		// Delete chats and their messages (cascade handles messages)
		d.prepare('DELETE FROM chats WHERE paperId = ?').run(id);
		d.prepare('DELETE FROM thread_papers WHERE paperId = ?').run(id);
		d.prepare('DELETE FROM paper_connections WHERE fromPaperId = ? OR toPaperId = ?').run(id, id);
		d.prepare('DELETE FROM papers WHERE id = ?').run(id);
	},

	// Threads — paper membership + ordering is derived from the `papers`
	// table (single-ownership, chronological by addedAt). The legacy
	// `thread_papers` table is no longer consulted for reads.
	getAllThreads(): Thread[] {
		const d = getDb();
		const rows = d.prepare('SELECT * FROM threads ORDER BY updatedAt DESC').all() as any[];
		return rows.map(r => {
			const papers = d.prepare(
				'SELECT id AS paperId, contextNote, 0 AS "order" FROM papers WHERE threadId = ? ORDER BY addedAt ASC',
			).all(r.id) as ThreadPaper[];
			const links = d.prepare('SELECT id, label, url FROM thread_links WHERE threadId = ?').all(r.id) as ThreadLink[];
			return {
				...r,
				tags: JSON.parse(r.tags),
				papers: papers.map((p, i) => ({ ...p, order: i })),
				links,
				parentThreadId: r.parentThreadId ?? null,
			};
		});
	},

	getThread(id: string): Thread | undefined {
		const d = getDb();
		const r = d.prepare('SELECT * FROM threads WHERE id = ?').get(id) as any;
		if (!r) return undefined;
		const papers = d.prepare(
			'SELECT id AS paperId, contextNote, 0 AS "order" FROM papers WHERE threadId = ? ORDER BY addedAt ASC',
		).all(id) as ThreadPaper[];
		const links = d.prepare('SELECT id, label, url FROM thread_links WHERE threadId = ?').all(id) as ThreadLink[];
		return {
			...r,
			tags: JSON.parse(r.tags),
			papers: papers.map((p, i) => ({ ...p, order: i })),
			links,
			parentThreadId: r.parentThreadId ?? null,
		};
	},

	addThread(thread: Thread) {
		const d = getDb();
		const insert = d.transaction(() => {
			d.prepare(`
				INSERT INTO threads (id, title, question, status, synthesis, parentThreadId, tags, createdAt, updatedAt)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				thread.id, thread.title, thread.question, thread.status,
				thread.synthesis, thread.parentThreadId, JSON.stringify(thread.tags),
				thread.createdAt, thread.updatedAt
			);
			for (const tp of thread.papers) {
				d.prepare('INSERT INTO thread_papers (threadId, paperId, contextNote, "order") VALUES (?, ?, ?, ?)').run(thread.id, tp.paperId, tp.contextNote, tp.order);
			}
			for (const link of thread.links) {
				d.prepare('INSERT INTO thread_links (id, threadId, label, url) VALUES (?, ?, ?, ?)').run(link.id, thread.id, link.label, link.url);
			}
		});
		insert();
	},

	updateThread(id: string, data: Partial<Thread>) {
		const d = getDb();
		const update = d.transaction(() => {
			// Update thread_papers if included
			if (data.papers !== undefined) {
				d.prepare('DELETE FROM thread_papers WHERE threadId = ?').run(id);
				for (const tp of data.papers) {
					d.prepare('INSERT INTO thread_papers (threadId, paperId, contextNote, "order") VALUES (?, ?, ?, ?)').run(id, tp.paperId, tp.contextNote, tp.order);
				}
			}

			// Update thread_links if included
			if (data.links !== undefined) {
				d.prepare('DELETE FROM thread_links WHERE threadId = ?').run(id);
				for (const link of data.links) {
					d.prepare('INSERT INTO thread_links (id, threadId, label, url) VALUES (?, ?, ?, ?)').run(link.id, id, link.label, link.url);
				}
			}

			// Update scalar fields
			const skip = ['id', 'papers', 'links'];
			const fields: string[] = [];
			const values: any[] = [];
			for (const [key, val] of Object.entries(data)) {
				if (skip.includes(key)) continue;
				fields.push(`"${key}" = ?`);
				values.push(key === 'tags' ? JSON.stringify(val) : val);
			}
			if (fields.length > 0) {
				values.push(id);
				d.prepare(`UPDATE threads SET ${fields.join(', ')} WHERE id = ?`).run(...values);
			}
		});
		update();
	},

	removeThread(id: string) {
		getDb().prepare('DELETE FROM threads WHERE id = ?').run(id);
	},

	// Get papers that belong ONLY to a specific thread (not in any other thread)
	getExclusivePapers(threadId: string): string[] {
		const rows = getDb().prepare(`
			SELECT tp.paperId FROM thread_papers tp
			WHERE tp.threadId = ?
			AND tp.paperId NOT IN (
				SELECT paperId FROM thread_papers WHERE threadId != ?
			)
		`).all(threadId, threadId) as { paperId: string }[];
		return rows.map(r => r.paperId);
	},

	// Annotations
	getAllAnnotations(): Annotation[] {
		return getDb().prepare('SELECT * FROM annotations ORDER BY createdAt DESC').all() as Annotation[];
	},

	addAnnotation(annotation: Annotation) {
		getDb().prepare(`
			INSERT INTO annotations (id, paperId, threadId, type, content, selectedText, page, color, createdAt, linkedPaperId)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			annotation.id, annotation.paperId, annotation.threadId, annotation.type,
			annotation.content, annotation.selectedText, annotation.page, annotation.color,
			annotation.createdAt, annotation.linkedPaperId ?? null
		);
	},

	updateAnnotation(id: string, data: Partial<Annotation>) {
		const fields: string[] = [];
		const values: any[] = [];
		for (const [key, val] of Object.entries(data)) {
			if (key === 'id') continue;
			fields.push(`"${key}" = ?`);
			values.push(val ?? null);
		}
		if (fields.length === 0) return;
		values.push(id);
		getDb().prepare(`UPDATE annotations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
	},

	removeAnnotation(id: string) {
		getDb().prepare('DELETE FROM annotations WHERE id = ?').run(id);
	},

	// Notes
	getAllNotes(): Note[] {
		return getDb().prepare('SELECT * FROM notes ORDER BY createdAt ASC').all() as Note[];
	},

	addNote(note: Note) {
		getDb().prepare('INSERT INTO notes (id, paperId, content, createdAt) VALUES (?, ?, ?, ?)').run(
			note.id, note.paperId, note.content, note.createdAt
		);
	},

	updateNote(id: string, data: Partial<Note>) {
		const fields: string[] = [];
		const values: any[] = [];
		for (const [key, val] of Object.entries(data)) {
			if (key === 'id') continue;
			fields.push(`"${key}" = ?`);
			values.push(val ?? null);
		}
		if (fields.length === 0) return;
		values.push(id);
		getDb().prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
	},

	removeNote(id: string) {
		getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
	},

	// Chats
	getAllChats(): Chat[] {
		// Correlated subquery pulls each chat's first user message so the UI
		// can fall back to it as a display label when `title` is a placeholder.
		return getDb().prepare(`
			SELECT chats.*, (
				SELECT content FROM chat_messages
				WHERE chatId = chats.id AND role = 'user'
				ORDER BY createdAt ASC
				LIMIT 1
			) AS firstUserMessage
			FROM chats
			ORDER BY updatedAt DESC
		`).all() as Chat[];
	},

	getChat(id: string): Chat | undefined {
		return getDb().prepare(`
			SELECT chats.*, (
				SELECT content FROM chat_messages
				WHERE chatId = chats.id AND role = 'user'
				ORDER BY createdAt ASC
				LIMIT 1
			) AS firstUserMessage
			FROM chats WHERE id = ?
		`).get(id) as Chat | undefined;
	},

	getChatMessages(chatId: string): ChatMessage[] {
		const rows = getDb().prepare('SELECT * FROM chat_messages WHERE chatId = ? ORDER BY createdAt ASC').all(chatId) as any[];
		return rows.map(r => ({
			id: r.id,
			chatId: r.chatId,
			role: r.role,
			content: r.content,
			parts: r.parts ? JSON.parse(r.parts) : null,
			createdAt: r.createdAt,
		}));
	},

	addChat(chat: Chat) {
		getDb().prepare('INSERT INTO chats (id, title, claudeSessionId, chatEngine, paperId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
			chat.id, chat.title, chat.claudeSessionId, chat.chatEngine ?? 'sdk', chat.paperId ?? null, chat.createdAt, chat.updatedAt
		);
	},

	updateChat(id: string, data: Partial<Chat>) {
		const fields: string[] = [];
		const values: any[] = [];
		for (const [key, val] of Object.entries(data)) {
			if (key === 'id') continue;
			fields.push(`"${key}" = ?`);
			values.push(val ?? null);
		}
		if (fields.length === 0) return;
		values.push(id);
		getDb().prepare(`UPDATE chats SET ${fields.join(', ')} WHERE id = ?`).run(...values);
	},

	removeChat(id: string) {
		getDb().prepare('DELETE FROM chats WHERE id = ?').run(id);
	},

	addChatMessage(msg: ChatMessage) {
		getDb().prepare('INSERT INTO chat_messages (id, chatId, role, content, parts, createdAt) VALUES (?, ?, ?, ?, ?, ?)').run(
			msg.id,
			msg.chatId,
			msg.role,
			msg.content,
			msg.parts ? JSON.stringify(msg.parts) : null,
			msg.createdAt
		);
	},

	// Paper Connections
	getAllConnections(): PaperConnection[] {
		return getDb().prepare('SELECT * FROM paper_connections ORDER BY strength DESC').all() as PaperConnection[];
	},

	getConnectionsForPaper(paperId: string): PaperConnection[] {
		return getDb().prepare('SELECT * FROM paper_connections WHERE fromPaperId = ? OR toPaperId = ? ORDER BY strength DESC').all(paperId, paperId) as PaperConnection[];
	},

	addConnections(conns: PaperConnection[]) {
		const d = getDb();
		const insert = d.transaction(() => {
			const stmt = d.prepare(`INSERT OR REPLACE INTO paper_connections (id, fromPaperId, toPaperId, connectionType, strength, explanation, generatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`);
			for (const c of conns) {
				stmt.run(c.id, c.fromPaperId, c.toPaperId, c.connectionType, c.strength, c.explanation, c.generatedAt);
			}
		});
		insert();
	},

	removeConnectionsForPaper(paperId: string) {
		getDb().prepare('DELETE FROM paper_connections WHERE fromPaperId = ? OR toPaperId = ?').run(paperId, paperId);
	},

	// ------------------------------------------------------------------
	// Cache lifecycle
	// ------------------------------------------------------------------

	/**
	 * Drop every cache row (preserving `_meta`) and re-ingest everything from
	 * the filesystem source of truth under `PDF_DIR`. Runs in a single
	 * transaction so the cache is never partially visible.
	 *
	 * Relies on `src/lib/server/fs-store.ts` for all disk I/O.
	 */
	rebuildCache() {
		const d = getDb();
		ensureInboxThread();

		const tx = d.transaction(() => {
			d.exec('DELETE FROM paper_connections');
			d.exec('DELETE FROM chat_messages');
			d.exec('DELETE FROM chats');
			d.exec('DELETE FROM annotations');
			d.exec('DELETE FROM notes');
			d.exec('DELETE FROM thread_links');
			d.exec('DELETE FROM thread_papers');
			d.exec('DELETE FROM papers');
			d.exec('DELETE FROM threads');

			const insertThread = d.prepare(`
				INSERT INTO threads (id, title, question, status, synthesis, parentThreadId, tags, createdAt, updatedAt)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			const insertThreadLink = d.prepare(`
				INSERT INTO thread_links (id, threadId, label, url) VALUES (?, ?, ?, ?)
			`);
			const insertPaper = d.prepare(`
				INSERT INTO papers (
					id, arxivId, title, authors, abstract, publishedDate, categories,
					tags, readingStatus, rating, pdfPath, arxivUrl, addedAt, citations,
					links, threadId, orderInThread, contextNote
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			// thread_papers is still populated during Phase B so legacy callers
			// keep working; Phase C will drop both the table and this insert.
			const insertThreadPaper = d.prepare(`
				INSERT INTO thread_papers (threadId, paperId, contextNote, "order") VALUES (?, ?, ?, ?)
			`);
			const insertNote = d.prepare(`
				INSERT INTO notes (id, paperId, content, createdAt) VALUES (?, ?, ?, ?)
			`);
			const insertAnnotation = d.prepare(`
				INSERT INTO annotations (id, paperId, threadId, type, content, selectedText, page, color, createdAt, linkedPaperId)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			const insertChat = d.prepare(`
				INSERT INTO chats (id, title, claudeSessionId, chatEngine, paperId, threadId, createdAt, updatedAt)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`);
			const insertMessage = d.prepare(`
				INSERT INTO chat_messages (id, chatId, role, content, parts, createdAt)
				VALUES (?, ?, ?, ?, ?, ?)
			`);
			const insertConnection = d.prepare(`
				INSERT OR REPLACE INTO paper_connections (id, fromPaperId, toPaperId, connectionType, strength, explanation, generatedAt)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);

			for (const slug of listThreadDirs()) {
				const thread = fsReadThread(slug);
				if (!thread) continue;

				insertThread.run(
					thread.id,
					thread.title,
					thread.question,
					thread.status,
					readThreadSynthesis(slug),
					thread.parentThreadId,
					JSON.stringify(thread.tags),
					thread.createdAt,
					thread.updatedAt,
				);
				for (const link of thread.links) {
					insertThreadLink.run(link.id, slug, link.label, link.url);
				}

				// Paper membership is whatever's on disk; order is chronological
				// by `addedAt`. `thread_papers` is populated for legacy read
				// paths but its `order` column is no longer authoritative.
				for (const arxivId of listPaperDirs(slug)) {
					const paper = fsReadPaper(slug, arxivId);
					if (!paper) continue;
					const pdfRel = path.posix.join('threads', slug, 'papers', arxivId, 'paper.pdf');

					insertPaper.run(
						paper.id,
						paper.arxivId,
						paper.title,
						JSON.stringify(paper.authors),
						paper.abstract,
						paper.publishedDate,
						JSON.stringify(paper.categories),
						JSON.stringify(paper.tags),
						paper.readingStatus,
						paper.rating,
						pdfRel,
						paper.arxivUrl,
						paper.addedAt,
						JSON.stringify(paper.citations),
						JSON.stringify(paper.links),
						slug,
						0,
						paper.contextNote,
					);
					insertThreadPaper.run(slug, paper.id, paper.contextNote, 0);

					const noteBody = fsReadNote(slug, arxivId);
					if (noteBody.trim().length > 0) {
						insertNote.run(`note-${paper.id}`, paper.id, noteBody, paper.addedAt);
					}

					for (const ann of fsReadAnnotations(slug, arxivId)) {
						insertAnnotation.run(
							ann.id,
							paper.id,
							slug,
							ann.type,
							ann.content,
							ann.selectedText,
							ann.page,
							ann.color,
							ann.createdAt,
							ann.linkedPaperId ?? null,
						);
					}
				}

				for (const chatId of listChatDirs(slug)) {
					const chat = fsReadChat(slug, chatId);
					if (!chat) continue;
					insertChat.run(
						chat.id,
						chat.title,
						chat.claudeSessionId,
						chat.chatEngine,
						chat.paperId,
						slug,
						chat.createdAt,
						chat.updatedAt,
					);
					for (const msg of fsReadChatMessages(slug, chatId)) {
						insertMessage.run(
							msg.id,
							chatId,
							msg.role,
							msg.content,
							msg.parts ? JSON.stringify(msg.parts) : null,
							msg.createdAt,
						);
					}
				}
			}

			for (const conn of fsReadConnections()) {
				insertConnection.run(
					conn.id,
					conn.fromPaperId,
					conn.toPaperId,
					conn.connectionType,
					conn.strength,
					conn.explanation,
					conn.generatedAt,
				);
			}

			setMeta(d, 'schemaVersion', String(SCHEMA_VERSION));
			setMeta(d, 'builtAt', new Date().toISOString());
		});

		tx();
	},

	/**
	 * Called once per server startup. Guarantees the inbox thread exists on
	 * disk and decides whether the cache needs a rebuild:
	 *
	 * - No prior `_meta.schemaVersion` row → first boot after this code lands;
	 *   tag the existing cache with the current version and move on. Do NOT
	 *   auto-rebuild, because pre-migration the filesystem has no thread/paper
	 *   data — a rebuild would wipe the legacy DB content that's still the
	 *   user's source of truth.
	 * - Version matches `SCHEMA_VERSION` → nothing to do.
	 * - Version mismatch AND filesystem has real data (i.e. migration has run
	 *   or the user is running rebuild after external edits) → rebuild.
	 * - Version mismatch and filesystem is effectively empty → just stamp the
	 *   new version; the legacy cache remains authoritative until migration.
	 */
	bootstrapCache() {
		const d = getDb();
		ensureInboxThread();
		const stored = getMeta(d, 'schemaVersion');
		if (stored == null) {
			setMeta(d, 'schemaVersion', String(SCHEMA_VERSION));
			setMeta(d, 'builtAt', new Date().toISOString());
			return;
		}
		if (stored === String(SCHEMA_VERSION)) return;

		if (filesystemHasRealData()) {
			console.log(`[cache] schema ${stored} → ${SCHEMA_VERSION}: rebuilding from filesystem`);
			this.rebuildCache();
		} else {
			console.log(`[cache] schema ${stored} → ${SCHEMA_VERSION}: filesystem empty, preserving legacy DB`);
			setMeta(d, 'schemaVersion', String(SCHEMA_VERSION));
		}
	},

	getCacheMeta(): { schemaVersion: string | null; builtAt: string | null } {
		const d = getDb();
		return {
			schemaVersion: getMeta(d, 'schemaVersion'),
			builtAt: getMeta(d, 'builtAt'),
		};
	},
};
