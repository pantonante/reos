import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as wt from '$lib/server/write-through';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllAnnotations());
};

export const POST: RequestHandler = async ({ request }) => {
	const annotation = await request.json();
	wt.addAnnotation(annotation);
	return json(annotation, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	wt.updateAnnotation(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	wt.removeAnnotation(id);
	return json({ ok: true });
};
