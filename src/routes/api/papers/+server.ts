import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { readSummary as readLegacySummary } from '$lib/server/summary';
import { canonicalArxivId, findThreadForPaper } from '$lib/server/write-through';
import * as wt from '$lib/server/write-through';
import { readPaperSummary } from '$lib/server/fs-store';
import type { RequestHandler } from './$types';

function enrichWithSummary(paper: any) {
	const aid = paper.arxivId || paper.id;
	const slug = paper.threadId ?? findThreadForPaper(paper.id);
	const nested = slug ? readPaperSummary(slug, aid) : null;
	const cached = nested ?? readLegacySummary(aid);
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
	const stored = wt.addPaper(paper);
	return json(stored, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { id, summary, summaryDate, ...data } = await request.json();
	// summary/summaryDate live on disk; ignore them on update.
	wt.updatePaper(id, data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	wt.removePaper(id);
	return json({ ok: true });
};
