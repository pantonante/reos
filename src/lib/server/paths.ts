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

// --- literature-review workspace paths ---
// A workspace is the CWD we hand to the embedded `claude` CLI. The skill
// writes its final report into `outputs/`, which the chokidar watcher scans.
export function threadWorkspaceDir(slug: string): string {
	return path.join(threadDir(slug), 'workspace');
}

export function threadOutputsDir(slug: string): string {
	return path.join(threadWorkspaceDir(slug), 'outputs');
}

export function threadSkillsDir(slug: string): string {
	return path.join(threadWorkspaceDir(slug), '.claude', 'skills');
}

export function threadClaudeSettingsPath(slug: string): string {
	return path.join(threadWorkspaceDir(slug), '.claude', 'settings.json');
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
