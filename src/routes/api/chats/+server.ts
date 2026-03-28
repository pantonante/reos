import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllChats());
};

export const POST: RequestHandler = async ({ request }) => {
	const chat = await request.json();
	db.addChat(chat);
	return json(chat, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	db.updateChat(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	db.removeChat(id);
	return json({ ok: true });
};
