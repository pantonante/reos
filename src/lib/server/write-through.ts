/**
 * Write-through adapter: every mutation writes to the filesystem source of
 * truth first, then updates the SQLite cache. Routes call these helpers
 * instead of `db.*` directly.
 *
 * Legacy-data compatibility: when a paper's thread cannot be resolved (e.g.
 * pre-migration rows that still sit at `<PDF_DIR>/{arxivId}.pdf` with no
 * thread folder), we lazily materialize the paper into the `inbox` thread
 * and move any legacy PDF/summary files into the new folder on first touch.
 */

import fs from 'fs';
import path from 'path';
import type {
	Annotation,
	Chat,
	ChatMessage,
	Paper,
	PaperConnection,
	Thread,
} from '$lib/types';
import { db } from './db';
import {
	type StoredAnnotation,
	type StoredChat,
	type StoredChatMessage,
	type StoredConnection,
	type StoredPaper,
	type StoredThread,
	appendChatMessage as fsAppendChatMessage,
	deleteChat as fsDeleteChat,
	deletePaper as fsDeletePaper,
	deleteThread as fsDeleteThread,
	ensureInboxThread,
	movePaper as fsMovePaper,
	paperExists,
	readAnnotations as fsReadAnnotations,
	readChat as fsReadChat,
	readChatMessages as fsReadChatMessages,
	readPaper as fsReadPaper,
	readThread as fsReadThread,
	threadExists,
	writeAnnotations as fsWriteAnnotations,
	writeChat as fsWriteChat,
	writeConnections as fsWriteConnections,
	writeNote as fsWriteNote,
	writePaper as fsWritePaper,
	writePaperSummary as fsWritePaperSummary,
	writeThread as fsWriteThread,
	writeThreadSynthesis,
	listThreadDirs,
} from './fs-store';
import {
	INBOX_SLUG,
	PDF_DIR,
	paperPdfPath,
	paperSummaryPath,
} from './paths';
import { slugifyUnique } from './slug';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function canonicalArxivId(p: { arxivId?: string; id: string }): string {
	return p.arxivId || p.id;
}

function pdfPathFor(slug: string, aid: string): string {
	return path.posix.join('threads', slug, 'papers', aid, 'paper.pdf');
}

function toStoredPaper(paper: Paper): StoredPaper {
	return {
		id: paper.id,
		arxivId: paper.arxivId,
		title: paper.title,
		authors: paper.authors,
		abstract: paper.abstract,
		publishedDate: paper.publishedDate,
		categories: paper.categories,
		tags: paper.tags,
		readingStatus: paper.readingStatus,
		rating: paper.rating,
		arxivUrl: paper.arxivUrl,
		addedAt: paper.addedAt,
		citations: paper.citations,
		links: paper.links,
		contextNote: paper.contextNote ?? '',
	};
}

/** Locate the thread that owns a paper. Checks the cache first (fast path),
 * then falls back to scanning the filesystem. Returns null if not found. */
export function findThreadForPaper(paperId: string): string | null {
	const paper = db.getPaper(paperId);
	if (paper?.threadId && threadExists(paper.threadId)) return paper.threadId;
	const aid = paper ? canonicalArxivId(paper) : paperId;
	for (const slug of listThreadDirs()) {
		if (paperExists(slug, aid)) return slug;
	}
	return null;
}

export function findThreadForChat(chatId: string): string | null {
	const chat = db.getChat(chatId);
	if (chat?.threadId && threadExists(chat.threadId)) return chat.threadId;
	for (const slug of listThreadDirs()) {
		if (fs.existsSync(path.join(PDF_DIR, 'threads', slug, 'chats', chatId))) {
			return slug;
		}
	}
	return null;
}

/**
 * Ensure the paper has a folder on disk. Handles the pre-migration scenario
 * where the PDF/summary are still at `<PDF_DIR>/{arxivId}.pdf` by relocating
 * them into the new layout.
 */
function materializePaperFolder(paper: Paper, slug: string): void {
	ensureInboxThread();
	const aid = canonicalArxivId(paper);
	if (!paperExists(slug, aid)) {
		fsWritePaper(slug, toStoredPaper(paper));
	}
	const legacyPdf = path.join(PDF_DIR, `${aid}.pdf`);
	const targetPdf = paperPdfPath(slug, aid);
	if (fs.existsSync(legacyPdf) && !fs.existsSync(targetPdf)) {
		try { fs.renameSync(legacyPdf, targetPdf); } catch { /* best-effort */ }
	}
	const legacySummary = path.join(PDF_DIR, `${aid}.summary.md`);
	const targetSummary = paperSummaryPath(slug, aid);
	if (fs.existsSync(legacySummary) && !fs.existsSync(targetSummary)) {
		try { fs.renameSync(legacySummary, targetSummary); } catch { /* best-effort */ }
	}
}

function touchThread(slug: string): void {
	const thread = fsReadThread(slug);
	if (!thread) return;
	thread.updatedAt = new Date().toISOString();
	fsWriteThread(thread);
}

// ---------------------------------------------------------------------------
// Papers
// ---------------------------------------------------------------------------

export function addPaper(paper: Paper): Paper {
	const slug =
		paper.threadId && threadExists(paper.threadId) ? paper.threadId : INBOX_SLUG;
	const aid = canonicalArxivId(paper);
	materializePaperFolder(paper, slug);
	fsWritePaper(slug, toStoredPaper(paper));
	touchThread(slug);

	const stored: Paper = {
		...paper,
		threadId: slug,
		pdfPath: pdfPathFor(slug, aid),
	};
	db.addPaper(stored);
	db.updatePaper(stored.id, {
		threadId: slug,
		contextNote: paper.contextNote ?? '',
	} as Partial<Paper>);
	return stored;
}

export function updatePaper(id: string, data: Partial<Paper>): void {
	const existing = db.getPaper(id);
	if (!existing) return;
	const slug = existing.threadId && threadExists(existing.threadId)
		? existing.threadId
		: (findThreadForPaper(id) ?? INBOX_SLUG);
	const merged: Paper = { ...existing, ...data, id };
	materializePaperFolder(merged, slug);
	fsWritePaper(slug, toStoredPaper(merged));
	db.updatePaper(id, {
		...data,
		pdfPath: pdfPathFor(slug, canonicalArxivId(merged)),
		threadId: slug,
	} as Partial<Paper>);
}

export function removePaper(id: string): void {
	const paper = db.getPaper(id);
	if (!paper) return;
	const slug = paper.threadId && threadExists(paper.threadId)
		? paper.threadId
		: findThreadForPaper(id);
	const aid = canonicalArxivId(paper);
	if (slug) {
		fsDeletePaper(slug, aid);
		touchThread(slug);
	}
	// Legacy cleanup: ensure no stale files linger at PDF_DIR root.
	for (const rel of [`${aid}.pdf`, `${aid}.summary.md`]) {
		try { fs.unlinkSync(path.join(PDF_DIR, rel)); } catch {}
	}
	db.removePaper(id);
}

/** Move a paper folder from one thread to another. Updates both thread
 * `papers[]` arrays and the cache row's `threadId` + `pdfPath`. */
export function movePaperBetweenThreads(paperId: string, toSlug: string): void {
	const paper = db.getPaper(paperId);
	if (!paper) throw new Error(`Paper not found: ${paperId}`);
	if (!threadExists(toSlug)) throw new Error(`Target thread not found: ${toSlug}`);

	const fromSlug = paper.threadId && threadExists(paper.threadId)
		? paper.threadId
		: (findThreadForPaper(paperId) ?? INBOX_SLUG);
	if (fromSlug === toSlug) return;

	const aid = canonicalArxivId(paper);
	// Ensure the paper folder actually exists before moving.
	materializePaperFolder(paper, fromSlug);
	fsMovePaper(aid, fromSlug, toSlug);
	touchThread(fromSlug);
	touchThread(toSlug);

	db.updatePaper(paperId, {
		threadId: toSlug,
		pdfPath: pdfPathFor(toSlug, aid),
	} as Partial<Paper>);
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

function toStoredThread(thread: Thread, existingSlug?: string): StoredThread {
	return {
		id: existingSlug ?? thread.id,
		title: thread.title,
		question: thread.question,
		status: thread.status,
		parentThreadId: thread.parentThreadId,
		tags: thread.tags,
		createdAt: thread.createdAt,
		updatedAt: thread.updatedAt,
		links: thread.links,
		threadType: thread.threadType,
	};
}

/** Insert a new thread. If the caller-supplied `thread.id` isn't already a
 * valid slug on disk, derive one from the title and dedupe against existing
 * thread folders. */
export function addThread(thread: Thread): Thread {
	const existingSlugs = new Set(listThreadDirs());
	const slug = existingSlugs.has(thread.id)
		? slugifyUnique(thread.title, existingSlugs)
		: (thread.id || slugifyUnique(thread.title, existingSlugs));
	const stored = toStoredThread(thread, slug);
	fsWriteThread(stored);
	writeThreadSynthesis(slug, thread.synthesis ?? '');

	const withSlug: Thread = { ...thread, id: slug };
	db.addThread(withSlug);
	return withSlug;
}

export function updateThread(id: string, data: Partial<Thread>): void {
	const existing = db.getThread(id);
	if (!existing) return;
	const merged: Thread = { ...existing, ...data, id };
	fsWriteThread(toStoredThread(merged, id));
	if (data.synthesis !== undefined) {
		writeThreadSynthesis(id, data.synthesis);
	}
	db.updateThread(id, data);
}

export function removeThread(id: string): {
	deletedPaperIds: string[];
} {
	if (id === INBOX_SLUG) {
		throw new Error('Cannot delete the inbox thread');
	}
	const thread = db.getThread(id);
	const deletedPaperIds: string[] = [];
	if (thread) {
		// With single-ownership every paper in the thread is deleted with it.
		for (const tp of thread.papers) {
			deletedPaperIds.push(tp.paperId);
			db.removePaper(tp.paperId);
		}
	}
	fsDeleteThread(id);
	db.removeThread(id);
	return { deletedPaperIds };
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

function toStoredAnnotation(a: Annotation): StoredAnnotation {
	return {
		id: a.id,
		type: a.type,
		content: a.content,
		selectedText: a.selectedText,
		page: a.page,
		color: a.color,
		createdAt: a.createdAt,
		linkedPaperId: a.linkedPaperId,
	};
}

function rewritePaperAnnotations(
	slug: string,
	arxivId: string,
	anns: StoredAnnotation[],
): void {
	fsWriteAnnotations(slug, arxivId, anns);
}

export function addAnnotation(annotation: Annotation): void {
	const slug = findThreadForPaper(annotation.paperId) ?? INBOX_SLUG;
	const paper = db.getPaper(annotation.paperId);
	if (paper) {
		// Ensure folder exists (materializes legacy papers into inbox on first annotation).
		const aid = canonicalArxivId(paper);
		if (!paperExists(slug, aid)) materializePaperFolder(paper, slug);
		const list = fsReadAnnotations(slug, aid);
		list.push(toStoredAnnotation(annotation));
		rewritePaperAnnotations(slug, aid, list);
	}
	db.addAnnotation({ ...annotation, threadId: annotation.threadId ?? slug });
}

export function updateAnnotation(id: string, data: Partial<Annotation>): void {
	// The existing row in cache tells us the paper, which tells us the thread.
	const existing = db.getAllAnnotations().find((a) => a.id === id);
	if (!existing) return;
	const slug = findThreadForPaper(existing.paperId) ?? INBOX_SLUG;
	const paper = db.getPaper(existing.paperId);
	if (paper) {
		const aid = canonicalArxivId(paper);
		const list = fsReadAnnotations(slug, aid);
		const idx = list.findIndex((a) => a.id === id);
		if (idx !== -1) {
			const merged = { ...list[idx], ...data } as StoredAnnotation;
			list[idx] = merged;
			rewritePaperAnnotations(slug, aid, list);
		}
	}
	db.updateAnnotation(id, data);
}

export function removeAnnotation(id: string): void {
	const existing = db.getAllAnnotations().find((a) => a.id === id);
	if (existing) {
		const slug = findThreadForPaper(existing.paperId) ?? INBOX_SLUG;
		const paper = db.getPaper(existing.paperId);
		if (paper) {
			const aid = canonicalArxivId(paper);
			const list = fsReadAnnotations(slug, aid).filter((a) => a.id !== id);
			rewritePaperAnnotations(slug, aid, list);
		}
	}
	db.removeAnnotation(id);
}

// ---------------------------------------------------------------------------
// Notes (single freeform note per paper — multiple rows in legacy DB are
// concatenated into one notes.md on rebuild)
// ---------------------------------------------------------------------------

function allNotesForPaper(paperId: string) {
	return db.getAllNotes().filter((n) => n.paperId === paperId);
}

function rewriteNotesFile(paperId: string): void {
	const slug = findThreadForPaper(paperId);
	if (!slug) return;
	const paper = db.getPaper(paperId);
	if (!paper) return;
	const notes = allNotesForPaper(paperId)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.map((n) => n.content)
		.join('\n\n');
	fsWriteNote(slug, canonicalArxivId(paper), notes);
}

export function addNote(note: { id: string; paperId: string; content: string; createdAt: string }): void {
	db.addNote(note);
	rewriteNotesFile(note.paperId);
}

export function updateNote(id: string, data: { content?: string; paperId?: string }): void {
	const existing = db.getAllNotes().find((n) => n.id === id);
	db.updateNote(id, data);
	if (existing) rewriteNotesFile(existing.paperId);
}

export function removeNote(id: string): void {
	const existing = db.getAllNotes().find((n) => n.id === id);
	db.removeNote(id);
	if (existing) rewriteNotesFile(existing.paperId);
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

function toStoredChat(c: Chat): StoredChat {
	return {
		id: c.id,
		title: c.title,
		claudeSessionId: c.claudeSessionId,
		chatEngine: c.chatEngine,
		paperId: c.paperId,
		createdAt: c.createdAt,
		updatedAt: c.updatedAt,
	};
}

function toStoredMessage(m: ChatMessage): StoredChatMessage {
	return {
		id: m.id,
		role: m.role,
		content: m.content,
		parts: m.parts ?? null,
		createdAt: m.createdAt,
	};
}

/** Resolve the thread a chat should live in. If the chat targets a specific
 * paper, nest it under that paper's thread; otherwise fall back to inbox. */
function resolveChatThread(chat: Pick<Chat, 'paperId' | 'threadId'>): string {
	if (chat.threadId && threadExists(chat.threadId)) return chat.threadId;
	if (chat.paperId) {
		const slug = findThreadForPaper(chat.paperId);
		if (slug) return slug;
	}
	return INBOX_SLUG;
}

export function addChat(chat: Chat): Chat {
	const slug = resolveChatThread(chat);
	fsWriteChat(slug, toStoredChat(chat));
	const withSlug: Chat = { ...chat, threadId: slug };
	db.addChat(withSlug);
	db.updateChat(chat.id, { threadId: slug } as Partial<Chat>);
	return withSlug;
}

export function updateChat(id: string, data: Partial<Chat>): void {
	const existing = db.getChat(id);
	if (!existing) {
		db.updateChat(id, data);
		return;
	}
	const slug = findThreadForChat(id) ?? resolveChatThread({ ...existing, ...data });
	const merged: Chat = { ...existing, ...data, id };
	fsWriteChat(slug, toStoredChat(merged));
	db.updateChat(id, { ...data, threadId: slug } as Partial<Chat>);
}

export function removeChat(id: string): void {
	const slug = findThreadForChat(id);
	if (slug) fsDeleteChat(slug, id);
	db.removeChat(id);
}

export function addChatMessage(msg: ChatMessage): void {
	const slug = findThreadForChat(msg.chatId);
	if (slug) {
		// Ensure chat folder exists on disk even for legacy chats.
		if (!fsReadChat(slug, msg.chatId)) {
			const chat = db.getChat(msg.chatId);
			if (chat) fsWriteChat(slug, toStoredChat(chat));
		}
		fsAppendChatMessage(slug, msg.chatId, toStoredMessage(msg));
	}
	db.addChatMessage(msg);
}

// ---------------------------------------------------------------------------
// Paper connections (global)
// ---------------------------------------------------------------------------

function toStoredConnection(c: PaperConnection): StoredConnection {
	return {
		id: c.id,
		fromPaperId: c.fromPaperId,
		toPaperId: c.toPaperId,
		connectionType: c.connectionType,
		strength: c.strength,
		explanation: c.explanation,
		generatedAt: c.generatedAt,
	};
}

/** Replace all connections where the given paper is the source, atomically. */
export function replaceConnectionsForPaper(
	paperId: string,
	conns: PaperConnection[],
): void {
	db.removeConnectionsForPaper(paperId);
	if (conns.length > 0) db.addConnections(conns);
	// Persist the full, updated connection set to disk.
	const all = db.getAllConnections().map(toStoredConnection);
	fsWriteConnections(all);
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export function writePaperSummary(paperId: string, content: string): string {
	const paper = db.getPaper(paperId);
	if (!paper) throw new Error(`Paper not found: ${paperId}`);
	const slug = paper.threadId && threadExists(paper.threadId)
		? paper.threadId
		: (findThreadForPaper(paperId) ?? INBOX_SLUG);
	materializePaperFolder(paper, slug);
	return fsWritePaperSummary(slug, canonicalArxivId(paper), content);
}

/** Compute the absolute on-disk path to a paper's PDF, preferring the new
 * nested layout but falling back to the legacy root location. */
export function resolvePdfPath(paper: Paper): string | null {
	const slug = paper.threadId && threadExists(paper.threadId)
		? paper.threadId
		: findThreadForPaper(paper.id);
	const aid = canonicalArxivId(paper);
	if (slug) {
		const nested = path.join(PDF_DIR, 'threads', slug, 'papers', aid, 'paper.pdf');
		if (fs.existsSync(nested)) return nested;
	}
	const legacy = path.join(PDF_DIR, `${aid}.pdf`);
	if (fs.existsSync(legacy)) return legacy;
	return null;
}

/** Compute the target PDF path for a download — prefers the new layout if the
 * thread is resolvable, else the legacy root path. Creates parent dirs. */
export function resolvePdfWritePath(paper: Paper): string {
	const slug = paper.threadId && threadExists(paper.threadId)
		? paper.threadId
		: (findThreadForPaper(paper.id) ?? INBOX_SLUG);
	materializePaperFolder(paper, slug);
	return paperPdfPath(slug, canonicalArxivId(paper));
}

/**
 * Append links to a thread, deduped by URL. Used by the literature-review
 * ingest pipeline to record non-arXiv references as manually-downloadable
 * sources without clobbering links the user has added by hand.
 */
export function appendThreadLinks(
	threadId: string,
	links: { label: string; url: string }[],
): void {
	const existing = db.getThread(threadId);
	if (!existing) return;
	const haveUrls = new Set(existing.links.map((l) => l.url.trim().toLowerCase()));
	const additions = links
		.filter((l) => l.url && !haveUrls.has(l.url.trim().toLowerCase()))
		.map((l) => ({
			id: `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			label: l.label || l.url,
			url: l.url,
		}));
	if (additions.length === 0) return;
	const merged = [...existing.links, ...additions];
	updateThread(threadId, { links: merged });
}
