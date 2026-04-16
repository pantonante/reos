import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { ensureWorkspace } from '$lib/server/workspace';
import { getOrCreatePty, listTerminals } from '$lib/server/pty-registry';

function newTerminalId(): string {
	return Math.random().toString(36).slice(2, 10);
}

export const GET: RequestHandler = async ({ params }) => {
	const threadId = params.id;
	const thread = db.getThread(threadId);
	if (!thread) return json({ error: 'thread not found' }, { status: 404 });
	return json({ terminals: listTerminals(threadId) });
};

export const POST: RequestHandler = async ({ params }) => {
	const threadId = params.id;
	const thread = db.getThread(threadId);
	if (!thread) return json({ error: 'thread not found' }, { status: 404 });

	ensureWorkspace(threadId, {
		installLitReviewSkill: thread.threadType === 'literature-review',
	});

	const terminalId = newTerminalId();
	try {
		await getOrCreatePty(threadId, terminalId);
	} catch (err) {
		return json({ error: `failed to spawn claude: ${(err as Error).message}` }, { status: 500 });
	}
	return json({ id: terminalId });
};
