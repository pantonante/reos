import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllThreads());
};

export const POST: RequestHandler = async ({ request }) => {
	const thread = await request.json();
	db.addThread(thread);
	return json(thread, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	db.updateThread(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	db.removeThread(id);
	return json({ ok: true });
};
