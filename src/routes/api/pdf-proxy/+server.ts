import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { db } from '$lib/server/db';
import { resolvePdfPath, resolvePdfWritePath } from '$lib/server/write-through';
import { PDF_DIR } from '$lib/server/paths';

function servePdf(filePath: string): Response {
	const buffer = fs.readFileSync(filePath);
	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Cache-Control': 'public, max-age=86400',
		},
	});
}

export const GET: RequestHandler = async ({ url }) => {
	const arxivId = url.searchParams.get('id');
	const paperId = url.searchParams.get('paperId');
	if (!arxivId && !paperId) {
		return new Response('Missing id or paperId parameter', { status: 400 });
	}

	// Resolve via cache so we can find the owning thread folder.
	let paper = paperId ? db.getPaper(paperId) : null;
	if (!paper && arxivId) {
		paper = db.getAllPapers().find((p) => (p.arxivId || p.id) === arxivId) ?? null;
	}
	if (paper) {
		const local = resolvePdfPath(paper);
		if (local && fs.existsSync(local)) return servePdf(local);
	}

	// Direct-paperId lookup for uploaded PDFs captured pre-migration.
	if (paperId) {
		const legacy = path.join(PDF_DIR, `${paperId}.pdf`);
		if (fs.existsSync(legacy)) return servePdf(legacy);
		return new Response('PDF not found', { status: 404 });
	}

	// Fallback fetch from arXiv for brand-new captures whose PDF we haven't
	// downloaded yet. Target the new nested layout if we can resolve the thread.
	const pdfUrl = `https://arxiv.org/pdf/${encodeURIComponent(arxivId!)}`;
	console.log(`[pdf-proxy] Fetching PDF for ${arxivId} from ${pdfUrl}`);
	const res = await fetch(pdfUrl);
	if (!res.ok) {
		console.error(`[pdf-proxy] arXiv returned ${res.status}`);
		return new Response('Failed to fetch PDF', { status: res.status });
	}
	const pdfBuffer = await res.arrayBuffer();
	const writeTarget = paper
		? resolvePdfWritePath(paper)
		: path.join(PDF_DIR, `${arxivId}.pdf`);
	try {
		fs.mkdirSync(path.dirname(writeTarget), { recursive: true });
		fs.writeFileSync(writeTarget, Buffer.from(pdfBuffer));
		console.log(`[pdf-proxy] Saved PDF to ${writeTarget}`);
	} catch (err) {
		console.error('[pdf-proxy] Failed to save PDF to disk:', err);
	}
	return new Response(pdfBuffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Cache-Control': 'public, max-age=86400',
		},
	});
};
