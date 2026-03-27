import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllNotes());
};

export const POST: RequestHandler = async ({ request }) => {
	const note = await request.json();
	db.addNote(note);
	return json(note, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	db.updateNote(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	db.removeNote(id);
	return json({ ok: true });
};
