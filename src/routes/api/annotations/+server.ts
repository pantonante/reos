import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(db.getAllAnnotations());
};

export const POST: RequestHandler = async ({ request }) => {
	const annotation = await request.json();
	db.addAnnotation(annotation);
	return json(annotation, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	db.updateAnnotation(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	db.removeAnnotation(id);
	return json({ ok: true });
};
