import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { PDF_DIR } from '$lib/server/pdf-storage';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('pdf') as File | null;
	const paperId = formData.get('paperId') as string | null;

	if (!file || !paperId) {
		return new Response(JSON.stringify({ error: 'pdf and paperId are required' }), { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const filePath = path.join(PDF_DIR, `${paperId}.pdf`);

	try {
		fs.mkdirSync(PDF_DIR, { recursive: true });
		fs.writeFileSync(filePath, buffer);
	} catch (err) {
		console.error('[upload-pdf] Failed to save PDF:', err);
		return new Response(JSON.stringify({ error: 'Failed to save PDF' }), { status: 500 });
	}

	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
