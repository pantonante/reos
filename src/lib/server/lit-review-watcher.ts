import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { THREADS_DIR } from './paths';
import { db } from './db';
import { appendThreadLinks, updateThread } from './write-through';
import { addArxivPaperToThread } from './arxiv-ingest';
import { parseReferences } from './lit-review-parser';
import { threadEvents } from './thread-events';

interface WatchedFile {
	threadId: string;
	timer: ReturnType<typeof setTimeout> | null;
}

const DEBOUNCE_MS = 1500;
const inflight = new Map<string, WatchedFile>(); // absolute file path → debounce state
const ingesting = new Set<string>(); // file paths currently being ingested

let watcherStarted = false;

/**
 * One-time startup of the chokidar watcher. Idempotent so repeat hooks/server
 * restarts under dev HMR don't spawn duplicate watchers.
 */
export function startLitReviewWatcher(): void {
	if (watcherStarted) return;
	watcherStarted = true;

	try { fs.mkdirSync(THREADS_DIR, { recursive: true }); } catch { /* exists */ }

	// chokidar 4 dropped glob support — watch the threads root and filter
	// events to `<threadId>/workspace/outputs/*-lit-review.md` in the handler.
	// Google Drive mounts don't emit reliable fsevents, so we poll on macOS.
	const watcher = chokidar.watch(THREADS_DIR, {
		ignoreInitial: false,
		persistent: true,
		usePolling: true,
		interval: 1500,
		binaryInterval: 3000,
		ignored: (p) => /\/(papers|chats)\/|\.DS_Store$|\.tmp$/.test(p),
	});

	watcher.on('add', (file) => onFile(file));
	watcher.on('change', (file) => onFile(file));
	watcher.on('error', (err) => console.error('[lit-review-watcher] error:', err));

	console.log(`[lit-review-watcher] watching ${THREADS_DIR} (polling)`);
}

// The skill's filename convention drifts (outputs/foo-lit-review.md, or
// foo_literature_review.md at workspace root, etc.) so we accept any markdown
// that looks like a literature review report in the thread's workspace.
const LIT_REVIEW_BASENAME_RE = /lit(?:erature)?[\s_-]*review.*\.md$/i;

function onFile(file: string): void {
	const basename = path.basename(file);
	if (!LIT_REVIEW_BASENAME_RE.test(basename)) return;
	// Skip the skill definition itself and anything under .claude/.
	if (basename === 'literature-review.md') return;
	if (file.includes(`${path.sep}.claude${path.sep}`)) return;

	const threadId = threadIdFromPath(file);
	if (!threadId) return;

	// Confirm the thread is actually a literature-review (defensive — skill can
	// be run from any workspace but we only ingest when the thread is typed).
	const thread = db.getThread(threadId);
	if (!thread || thread.threadType !== 'literature-review') return;

	const prev = inflight.get(file);
	if (prev?.timer) clearTimeout(prev.timer);
	const state: WatchedFile = {
		threadId,
		timer: setTimeout(() => {
			inflight.delete(file);
			ingestFile(file, threadId).catch((err) => {
				console.error('[lit-review-watcher] ingest failed for', file, err);
			});
		}, DEBOUNCE_MS),
	};
	inflight.set(file, state);
}

function threadIdFromPath(file: string): string | null {
	const rel = path.relative(THREADS_DIR, file);
	if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
	const parts = rel.split(path.sep);
	// Expected shape: <slug>/workspace/... — we accept any depth under workspace.
	if (parts.length < 3) return null;
	if (parts[1] !== 'workspace') return null;
	return parts[0];
}

async function ingestFile(file: string, threadId: string): Promise<void> {
	if (ingesting.has(file)) return;
	ingesting.add(file);
	try {
		const markdown = await fs.promises.readFile(file, 'utf8');
		if (!markdown.trim()) return;

		threadEvents.emitEvent({ type: 'lit-review:ingest-started', threadId });

		updateThread(threadId, { synthesis: markdown });
		threadEvents.emitEvent({ type: 'thread:updated', threadId });

		const { arxivIds, links } = parseReferences(markdown);

		let added = 0;
		for (const arxivId of arxivIds) {
			try {
				const result = await addArxivPaperToThread(arxivId, threadId);
				if (result) added++;
			} catch (err) {
				console.error(`[lit-review-watcher] failed to add arxiv ${arxivId}:`, err);
			}
		}
		if (added > 0) {
			threadEvents.emitEvent({ type: 'thread:papers-changed', threadId });
		}

		if (links.length) appendThreadLinks(threadId, links);
		if (links.length) threadEvents.emitEvent({ type: 'thread:updated', threadId });

		threadEvents.emitEvent({
			type: 'lit-review:ingest-done',
			threadId,
			arxivCount: added,
			linkCount: links.length,
		});
	} finally {
		ingesting.delete(file);
	}
}
