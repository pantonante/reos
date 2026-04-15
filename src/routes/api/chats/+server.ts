import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as wt from '$lib/server/write-through';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllChats());
};

export const POST: RequestHandler = async ({ request }) => {
	const chat = await request.json();
	if (!chat.chatEngine) chat.chatEngine = 'sdk';
	const stored = wt.addChat(chat);
	return json(stored, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	wt.updateChat(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	wt.removeChat(id);
	return json({ ok: true });
};
