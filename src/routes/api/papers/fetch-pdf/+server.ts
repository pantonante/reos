import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { resolvePdfWritePath } from '$lib/server/write-through';

export const POST: RequestHandler = async ({ request }) => {
	const { paperId, arxivId } = (await request.json()) as {
		paperId?: string;
		arxivId?: string;
	};
	if (!paperId) return json({ error: 'paperId is required' }, { status: 400 });

	const paper = db.getPaper(paperId);
	if (!paper) return json({ error: `paper ${paperId} not found` }, { status: 404 });

	const id = arxivId || paper.arxivId;
	if (!id) return json({ error: 'missing arxivId' }, { status: 400 });

	const target = resolvePdfWritePath(paper);
	if (fs.existsSync(target) && fs.statSync(target).size > 0) {
		return json({ ok: true, path: target, cached: true });
	}

	const url = `https://arxiv.org/pdf/${id}.pdf`;
	let res: Response;
	try {
		res = await fetch(url, { headers: { 'User-Agent': 'ReOS/1.0 (research paper manager)' } });
	} catch (err) {
		return json({ error: `fetch failed: ${(err as Error).message}` }, { status: 502 });
	}
	if (!res.ok) return json({ error: `arxiv returned ${res.status}` }, { status: 502 });

	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length < 1024) {
		return json({ error: 'pdf too small; likely a redirect page' }, { status: 502 });
	}
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, buf);
	return json({ ok: true, path: target, bytes: buf.length });
};
