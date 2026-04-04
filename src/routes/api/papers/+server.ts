import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { readSummary } from '$lib/server/summary';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { PDF_DIR } from '$lib/server/pdf-storage';

function enrichWithSummary(paper: any) {
	const arxivId = paper.arxivId || paper.id;
	const cached = readSummary(arxivId);
	return {
		...paper,
		summary: cached?.summary ?? null,
		summaryDate: cached?.summaryDate ?? null,
	};
}

export const GET: RequestHandler = async () => {
	const papers = db.getAllPapers().map(enrichWithSummary);
	return json(papers);
};

export const POST: RequestHandler = async ({ request }) => {
	const paper = await request.json();
	db.addPaper(paper);
	return json(paper, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, summary, summaryDate, ...data } = await request.json();
	// Ignore summary/summaryDate -- they live on disk now
	db.updatePaper(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	const paper = db.getPaper(id);
	if (paper) {
		const arxivId = paper.arxivId || paper.id;
		const pdfPath = path.join(PDF_DIR, `${arxivId}.pdf`);
		const summaryPath = path.join(PDF_DIR, `${arxivId}.summary.md`);
		try { fs.unlinkSync(pdfPath); } catch {}
		try { fs.unlinkSync(summaryPath); } catch {}
	}
	db.removePaper(id);
	return json({ ok: true });
};
