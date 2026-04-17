import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { addArxivPaperToThread } from '$lib/server/arxiv-ingest';
import { threadEvents } from '$lib/server/thread-events';

export const POST: RequestHandler = async ({ params, request }) => {
	const threadId = params.id;
	const thread = db.getThread(threadId);
	if (!thread) return json({ error: 'thread not found' }, { status: 404 });

	const body = await request.json();
	const { arxivId } = body;

	if (!arxivId || typeof arxivId !== 'string') {
		return json({ error: 'arxivId is required' }, { status: 400 });
	}

	try {
		const paper = await addArxivPaperToThread(arxivId, threadId);
		if (!paper) {
			return json({ error: `Failed to fetch paper ${arxivId} from arXiv` }, { status: 502 });
		}
		threadEvents.emitEvent({ type: 'thread:papers-changed', threadId });
		return json(paper, { status: 201 });
	} catch (err) {
		return json(
			{ error: `Import failed: ${(err as Error).message}` },
			{ status: 500 },
		);
	}
};
