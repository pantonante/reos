import { json } from '@sveltejs/kit';
import * as wt from '$lib/server/write-through';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { paperId, toThreadId } = await request.json();
	if (!paperId || !toThreadId) {
		return json({ error: 'paperId and toThreadId are required' }, { status: 400 });
	}
	try {
		wt.movePaperBetweenThreads(paperId, toThreadId);
		return json({ ok: true });
	} catch (err: any) {
		return json({ error: err?.message ?? 'Move failed' }, { status: 400 });
	}
};
