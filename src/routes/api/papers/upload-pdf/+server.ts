import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { db } from '$lib/server/db';
import { resolvePdfWritePath } from '$lib/server/write-through';
import { PDF_DIR } from '$lib/server/paths';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('pdf') as File | null;
	const paperId = formData.get('paperId') as string | null;

	if (!file || !paperId) {
		return new Response(JSON.stringify({ error: 'pdf and paperId are required' }), { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	// Prefer the new per-thread layout if the paper exists; otherwise fall back
	// to the legacy root path so upload-for-unknown-ids (e.g. uploads captured
	// before their DB row is written) still works.
	const paper = db.getPaper(paperId);
	const filePath = paper ? resolvePdfWritePath(paper) : path.join(PDF_DIR, `${paperId}.pdf`);

	try {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, buffer);
	} catch (err) {
		console.error('[upload-pdf] Failed to save PDF:', err);
		return new Response(JSON.stringify({ error: 'Failed to save PDF' }), { status: 500 });
	}

	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
