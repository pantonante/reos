import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { PDF_DIR } from '$lib/server/pdf-storage';

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

	// Find papers exclusive to this thread (not in any other thread)
	const exclusivePaperIds = db.getExclusivePapers(id);

	// Delete the thread first (cascades thread_papers, thread_links)
	db.removeThread(id);

	// Delete exclusive papers and their PDF files
	for (const paperId of exclusivePaperIds) {
		const paper = db.getPaper(paperId);
		if (paper) {
			const pdfPath = path.join(PDF_DIR, `${paper.arxivId || paper.id}.pdf`);
			try { fs.unlinkSync(pdfPath); } catch { /* PDF may not exist */ }
		}
		db.removePaper(paperId);
	}

	return json({ ok: true, deletedPapers: exclusivePaperIds });
};
