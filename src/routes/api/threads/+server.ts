import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as wt from '$lib/server/write-through';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllThreads());
};

export const POST: RequestHandler = async ({ request }) => {
	const thread = await request.json();
	const stored = wt.addThread(thread);
	return json(stored, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	wt.updateThread(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	try {
		const { deletedPaperIds } = wt.removeThread(id);
		return json({ ok: true, deletedPapers: deletedPaperIds });
	} catch (err: any) {
		return json({ error: err?.message ?? 'Delete failed' }, { status: 400 });
	}
};
