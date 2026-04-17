import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { killPty } from '$lib/server/pty-registry';

export const DELETE: RequestHandler = async ({ params }) => {
	const { id: threadId, tid: terminalId } = params;
	if (!threadId || !terminalId) return json({ error: 'missing params' }, { status: 400 });
	killPty(threadId, terminalId);
	return json({ ok: true });
};
