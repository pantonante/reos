import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as wt from '$lib/server/write-through';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllNotes());
};

export const POST: RequestHandler = async ({ request }) => {
	const note = await request.json();
	wt.addNote(note);
	return json(note, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	wt.updateNote(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	wt.removeNote(id);
	return json({ ok: true });
};
