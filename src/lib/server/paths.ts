import path from 'path';
import { PDF_DIR } from './pdf-storage';

export { PDF_DIR };

export const THREADS_DIR = path.join(PDF_DIR, 'threads');
export const CONNECTIONS_FILE = path.join(PDF_DIR, 'connections.json');

export const INBOX_SLUG = 'inbox';
export const INBOX_TITLE = 'Inbox';

// --- thread-level paths ---
export function threadDir(slug: string): string {
	return path.join(THREADS_DIR, slug);
}

export function threadMetaPath(slug: string): string {
	return path.join(threadDir(slug), 'meta.json');
}

export function threadSynthesisPath(slug: string): string {
	return path.join(threadDir(slug), 'synthesis.md');
}

export function threadPapersDir(slug: string): string {
	return path.join(threadDir(slug), 'papers');
}

export function threadChatsDir(slug: string): string {
	return path.join(threadDir(slug), 'chats');
}

// --- paper-level paths (scoped to owning thread) ---
export function paperDir(slug: string, arxivId: string): string {
	return path.join(threadPapersDir(slug), arxivId);
}

export function paperMetaPath(slug: string, arxivId: string): string {
	return path.join(paperDir(slug, arxivId), 'meta.json');
}

export function paperPdfPath(slug: string, arxivId: string): string {
	return path.join(paperDir(slug, arxivId), 'paper.pdf');
}

export function paperSummaryPath(slug: string, arxivId: string): string {
	return path.join(paperDir(slug, arxivId), 'summary.md');
}

export function paperNotesPath(slug: string, arxivId: string): string {
	return path.join(paperDir(slug, arxivId), 'notes.md');
}

export function paperAnnotationsPath(slug: string, arxivId: string): string {
	return path.join(paperDir(slug, arxivId), 'annotations.json');
}

// --- chat-level paths (scoped to owning thread) ---
export function chatDir(slug: string, chatId: string): string {
	return path.join(threadChatsDir(slug), chatId);
}

export function chatMetaPath(slug: string, chatId: string): string {
	return path.join(chatDir(slug, chatId), 'meta.json');
}

export function chatMessagesPath(slug: string, chatId: string): string {
	return path.join(chatDir(slug, chatId), 'messages.jsonl');
}
