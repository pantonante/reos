import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { PDF_DIR } from '$lib/server/pdf-storage';

export const GET: RequestHandler = async () => {
	return json(db.getAllPapers());
};

export const POST: RequestHandler = async ({ request }) => {
	const paper = await request.json();
	db.addPaper(paper);
	return json(paper, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, ...data } = await request.json();
	db.updatePaper(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	const paper = db.getPaper(id);
	if (paper) {
		const pdfPath = path.join(PDF_DIR, `${paper.arxivId || paper.id}.pdf`);
		try {
			fs.unlinkSync(pdfPath);
		} catch {
			// PDF may not have been downloaded yet
		}
	}
	db.removePaper(id);
	return json({ ok: true });
};
