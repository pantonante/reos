import fs from 'fs';
import path from 'path';
import type {
	AnnotationType,
	ChatMessagePart,
	ConnectionType,
	ReadingStatus,
	ThreadLink,
	ThreadStatus,
	ThreadType,
} from '$lib/types';
import {
	CONNECTIONS_FILE,
	INBOX_SLUG,
	INBOX_TITLE,
	THREADS_DIR,
	chatDir,
	chatMessagesPath,
	chatMetaPath,
	paperAnnotationsPath,
	paperDir,
	paperMetaPath,
	paperNotesPath,
	paperPdfPath,
	paperSummaryPath,
	threadChatsDir,
	threadDir,
	threadMetaPath,
	threadPapersDir,
	threadSynthesisPath,
} from './paths';

// ============================================================================
// On-disk shapes
// ============================================================================

/**
 * `threads/{slug}/meta.json`. `id` equals the folder slug. Thread membership
 * is derived from the `papers/` subfolder — we don't maintain a redundant
 * array here. Order is implicit (chronological by each paper's `addedAt`).
 */
export interface StoredThread {
	id: string;
	title: string;
	question: string;
	status: ThreadStatus;
	parentThreadId: string | null;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	links: ThreadLink[];
	threadType?: ThreadType;
}

/**
 * `threads/{slug}/papers/{arxivId}/meta.json`. Drops fields that are implicit
 * from location (`threadId`) or stored in sibling files (`summary`,
 * `summaryDate`, `pdfPath`).
 */
export interface StoredPaper {
	id: string;
	arxivId: string;
	title: string;
	authors: string[];
	abstract: string;
	publishedDate: string;
	categories: string[];
	tags: string[];
	readingStatus: ReadingStatus;
	rating: number | null;
	arxivUrl: string;
	addedAt: string;
	citations: string[];
	links: string[];
	contextNote: string;
}

/**
 * `threads/{slug}/papers/{arxivId}/annotations.json`. `paperId` and `threadId`
 * are implicit from file location.
 */
export interface StoredAnnotation {
	id: string;
	type: AnnotationType;
	content: string;
	selectedText: string;
	page: number;
	color: string;
	createdAt: string;
	linkedPaperId?: string;
}

/** `threads/{slug}/chats/{chatId}/meta.json`. `threadId` implicit. */
export interface StoredChat {
	id: string;
	title: string;
	claudeSessionId: string | null;
	chatEngine: 'sdk' | 'cli';
	paperId: string | null;
	createdAt: string;
	updatedAt: string;
}

/** One line in `messages.jsonl`. `chatId` implicit from location. */
export interface StoredChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	parts?: ChatMessagePart[] | null;
	createdAt: string;
}

/** Entry in the global `connections.json`. */
export interface StoredConnection {
	id: string;
	fromPaperId: string;
	toPaperId: string;
	connectionType: ConnectionType;
	strength: number;
	explanation: string;
	generatedAt: string;
}

// ============================================================================
// Low-level helpers
// ============================================================================

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

/** Write-then-rename so a crash mid-write never leaves a half-file on disk. */
function writeFileAtomic(filePath: string, data: string | Buffer): void {
	ensureDir(path.dirname(filePath));
	const tmp = `${filePath}.tmp`;
	fs.writeFileSync(tmp, data);
	fs.renameSync(tmp, filePath);
}

function readJsonIfExists<T>(filePath: string): T | null {
	if (!fs.existsSync(filePath)) return null;
	const raw = fs.readFileSync(filePath, 'utf-8');
	return JSON.parse(raw) as T;
}

function readTextIfExists(filePath: string): string | null {
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath, 'utf-8');
}

function writeJsonAtomic(filePath: string, value: unknown): void {
	writeFileAtomic(filePath, JSON.stringify(value, null, 2) + '\n');
}

function listSubdirs(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
		.map((e) => e.name);
}

function removeRecursive(target: string): void {
	if (!fs.existsSync(target)) return;
	fs.rmSync(target, { recursive: true, force: true });
}

// ============================================================================
// Inbox bootstrap
// ============================================================================

/**
 * Guarantees that the default `inbox` thread exists. Idempotent — safe to call
 * every startup. New captures go here until the user moves them.
 */
export function ensureInboxThread(): void {
	ensureDir(THREADS_DIR);
	const metaPath = threadMetaPath(INBOX_SLUG);
	if (fs.existsSync(metaPath)) return;
	const now = new Date().toISOString();
	const thread: StoredThread = {
		id: INBOX_SLUG,
		title: INBOX_TITLE,
		question: '',
		status: 'active',
		parentThreadId: null,
		tags: [],
		createdAt: now,
		updatedAt: now,
		links: [],
	};
	writeThread(thread);
	if (!fs.existsSync(threadSynthesisPath(INBOX_SLUG))) {
		writeFileAtomic(threadSynthesisPath(INBOX_SLUG), '');
	}
}

// ============================================================================
// Threads
// ============================================================================

export function listThreadDirs(): string[] {
	return listSubdirs(THREADS_DIR);
}

export function threadExists(slug: string): boolean {
	return fs.existsSync(threadMetaPath(slug));
}

export function readThread(slug: string): StoredThread | null {
	return readJsonIfExists<StoredThread>(threadMetaPath(slug));
}

export function writeThread(thread: StoredThread): void {
	ensureDir(threadDir(thread.id));
	ensureDir(threadPapersDir(thread.id));
	ensureDir(threadChatsDir(thread.id));
	writeJsonAtomic(threadMetaPath(thread.id), thread);
}

export function readThreadSynthesis(slug: string): string {
	return readTextIfExists(threadSynthesisPath(slug)) ?? '';
}

export function writeThreadSynthesis(slug: string, md: string): void {
	writeFileAtomic(threadSynthesisPath(slug), md);
}

/**
 * Removes a thread folder and everything under it (papers, PDFs, chats, notes).
 * Callers must confirm with the user before invoking — there is no recovery.
 */
export function deleteThread(slug: string): void {
	if (slug === INBOX_SLUG) {
		throw new Error('Cannot delete the inbox thread');
	}
	removeRecursive(threadDir(slug));
}

/**
 * Rename a thread's folder (and therefore its slug / id). Updates `meta.json.id`
 * to match the new slug. Fails if target already exists.
 */
export function renameThreadSlug(oldSlug: string, newSlug: string): void {
	if (oldSlug === newSlug) return;
	if (oldSlug === INBOX_SLUG) {
		throw new Error('Cannot rename the inbox thread');
	}
	const src = threadDir(oldSlug);
	const dst = threadDir(newSlug);
	if (!fs.existsSync(src)) throw new Error(`Thread not found: ${oldSlug}`);
	if (fs.existsSync(dst)) throw new Error(`Thread slug already in use: ${newSlug}`);
	fs.renameSync(src, dst);
	const meta = readThread(newSlug);
	if (meta) {
		meta.id = newSlug;
		meta.updatedAt = new Date().toISOString();
		writeJsonAtomic(threadMetaPath(newSlug), meta);
	}
}

// ============================================================================
// Papers (scoped to a thread)
// ============================================================================

export function listPaperDirs(slug: string): string[] {
	return listSubdirs(threadPapersDir(slug));
}

export function paperExists(slug: string, arxivId: string): boolean {
	return fs.existsSync(paperMetaPath(slug, arxivId));
}

export function readPaper(slug: string, arxivId: string): StoredPaper | null {
	return readJsonIfExists<StoredPaper>(paperMetaPath(slug, arxivId));
}

export function writePaper(slug: string, paper: StoredPaper): void {
	ensureDir(paperDir(slug, paper.arxivId));
	writeJsonAtomic(paperMetaPath(slug, paper.arxivId), paper);
}

export function deletePaper(slug: string, arxivId: string): void {
	removeRecursive(paperDir(slug, arxivId));
}

/**
 * Move a paper folder (with its PDF, notes, annotations, summary) from one
 * thread to another. The thread `meta.json` `papers` arrays are NOT updated
 * here — callers are expected to maintain those, since ordering is a
 * thread-level concern.
 */
export function movePaper(arxivId: string, fromSlug: string, toSlug: string): void {
	if (fromSlug === toSlug) return;
	const src = paperDir(fromSlug, arxivId);
	const dst = paperDir(toSlug, arxivId);
	if (!fs.existsSync(src)) throw new Error(`Paper not found: ${arxivId} in ${fromSlug}`);
	if (fs.existsSync(dst)) throw new Error(`Paper already exists in ${toSlug}: ${arxivId}`);
	ensureDir(threadPapersDir(toSlug));
	fs.renameSync(src, dst);
}

// ============================================================================
// Paper content (notes, annotations, summary, PDF)
// ============================================================================

export function readNote(slug: string, arxivId: string): string {
	return readTextIfExists(paperNotesPath(slug, arxivId)) ?? '';
}

export function writeNote(slug: string, arxivId: string, md: string): void {
	ensureDir(paperDir(slug, arxivId));
	writeFileAtomic(paperNotesPath(slug, arxivId), md);
}

export function readAnnotations(slug: string, arxivId: string): StoredAnnotation[] {
	return readJsonIfExists<StoredAnnotation[]>(paperAnnotationsPath(slug, arxivId)) ?? [];
}

export function writeAnnotations(
	slug: string,
	arxivId: string,
	list: StoredAnnotation[],
): void {
	ensureDir(paperDir(slug, arxivId));
	writeJsonAtomic(paperAnnotationsPath(slug, arxivId), list);
}

/**
 * Read a paper's cached AI summary. Mirrors the pre-existing frontmatter
 * format (`---\ngeneratedAt: ...\n---\n\n<body>`) so migration is a byte-for-byte
 * move of the old `{arxivId}.summary.md` file into the paper folder.
 */
export function readPaperSummary(
	slug: string,
	arxivId: string,
): { summary: string; summaryDate: string } | null {
	const raw = readTextIfExists(paperSummaryPath(slug, arxivId));
	if (raw == null) return null;

	let summary = raw;
	let summaryDate = '';
	if (raw.startsWith('---')) {
		const fmEnd = raw.indexOf('---', 3);
		if (fmEnd !== -1) {
			const frontmatter = raw.slice(3, fmEnd).trim();
			summary = raw.slice(fmEnd + 3).trim();
			const dateMatch = frontmatter.match(/generatedAt:\s*(.+)/);
			if (dateMatch) summaryDate = dateMatch[1].trim();
		}
	}
	return { summary, summaryDate };
}

export function writePaperSummary(slug: string, arxivId: string, content: string): string {
	ensureDir(paperDir(slug, arxivId));
	const generatedAt = new Date().toISOString();
	const fileContent = `---\ngeneratedAt: ${generatedAt}\n---\n\n${content}`;
	writeFileAtomic(paperSummaryPath(slug, arxivId), fileContent);
	return generatedAt;
}

export function paperPdfExists(slug: string, arxivId: string): boolean {
	return fs.existsSync(paperPdfPath(slug, arxivId));
}

// ============================================================================
// Chats (scoped to a thread)
// ============================================================================

export function listChatDirs(slug: string): string[] {
	return listSubdirs(threadChatsDir(slug));
}

export function chatExists(slug: string, chatId: string): boolean {
	return fs.existsSync(chatMetaPath(slug, chatId));
}

export function readChat(slug: string, chatId: string): StoredChat | null {
	return readJsonIfExists<StoredChat>(chatMetaPath(slug, chatId));
}

export function writeChat(slug: string, chat: StoredChat): void {
	ensureDir(chatDir(slug, chat.id));
	writeJsonAtomic(chatMetaPath(slug, chat.id), chat);
}

export function deleteChat(slug: string, chatId: string): void {
	removeRecursive(chatDir(slug, chatId));
}

export function readChatMessages(slug: string, chatId: string): StoredChatMessage[] {
	const raw = readTextIfExists(chatMessagesPath(slug, chatId));
	if (raw == null) return [];
	const out: StoredChatMessage[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			out.push(JSON.parse(trimmed) as StoredChatMessage);
		} catch {
			// Skip malformed lines rather than corrupt the whole history. A
			// later cache-rebuild cycle will log/report anything unreadable.
		}
	}
	return out;
}

/**
 * Append a single message as one JSONL line. Messages are append-only; edits
 * require rewriting the whole file (uncommon, so we don't expose a helper).
 */
export function appendChatMessage(
	slug: string,
	chatId: string,
	msg: StoredChatMessage,
): void {
	ensureDir(chatDir(slug, chatId));
	const line = JSON.stringify(msg) + '\n';
	fs.appendFileSync(chatMessagesPath(slug, chatId), line);
}

// ============================================================================
// Connections (global)
// ============================================================================

export function readConnections(): StoredConnection[] {
	return readJsonIfExists<StoredConnection[]>(CONNECTIONS_FILE) ?? [];
}

export function writeConnections(list: StoredConnection[]): void {
	writeJsonAtomic(CONNECTIONS_FILE, list);
}
