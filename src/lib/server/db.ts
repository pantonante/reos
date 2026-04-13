import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Paper, Thread, Annotation, Note, ThreadPaper, ThreadLink, Chat, ChatMessage, PaperConnection } from '$lib/types';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'reos.db');

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
	`);

	// Migrations for existing databases
	const cols = db.prepare("PRAGMA table_info(papers)").all() as { name: string }[];
	const colNames = cols.map(c => c.name);
	if (!colNames.includes('links')) {
		db.exec("ALTER TABLE papers ADD COLUMN links TEXT NOT NULL DEFAULT '[]'");
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

	// chat_messages migrations
	const msgCols = db.prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[];
	const msgColNames = msgCols.map(c => c.name);
	if (!msgColNames.includes('parts')) {
		db.exec('ALTER TABLE chat_messages ADD COLUMN parts TEXT');
	}
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

	// Threads
	getAllThreads(): Thread[] {
		const d = getDb();
		const rows = d.prepare('SELECT * FROM threads ORDER BY updatedAt DESC').all() as any[];
		return rows.map(r => {
			const papers = d.prepare('SELECT paperId, contextNote, "order" FROM thread_papers WHERE threadId = ? ORDER BY "order"').all(r.id) as ThreadPaper[];
			const links = d.prepare('SELECT id, label, url FROM thread_links WHERE threadId = ?').all(r.id) as ThreadLink[];
			return {
				...r,
				tags: JSON.parse(r.tags),
				papers,
				links,
				parentThreadId: r.parentThreadId ?? null,
			};
		});
	},

	getThread(id: string): Thread | undefined {
		const d = getDb();
		const r = d.prepare('SELECT * FROM threads WHERE id = ?').get(id) as any;
		if (!r) return undefined;
		const papers = d.prepare('SELECT paperId, contextNote, "order" FROM thread_papers WHERE threadId = ? ORDER BY "order"').all(id) as ThreadPaper[];
		const links = d.prepare('SELECT id, label, url FROM thread_links WHERE threadId = ?').all(id) as ThreadLink[];
		return {
			...r,
			tags: JSON.parse(r.tags),
			papers,
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
};
