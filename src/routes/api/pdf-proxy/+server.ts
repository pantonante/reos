import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import { PDF_DIR } from '$lib/server/pdf-storage';

export const GET: RequestHandler = async ({ url }) => {
	const arxivId = url.searchParams.get('id');
	const paperId = url.searchParams.get('paperId');
	if (!arxivId && !paperId) {
		return new Response('Missing id or paperId parameter', { status: 400 });
	}

	// For uploaded PDFs, serve by paperId
	if (paperId) {
		const filePath = path.join(PDF_DIR, `${paperId}.pdf`);
		if (fs.existsSync(filePath)) {
			const buffer = fs.readFileSync(filePath);
			return new Response(buffer, {
				headers: {
					'Content-Type': 'application/pdf',
					'Cache-Control': 'public, max-age=86400',
				},
			});
		}
		return new Response('PDF not found', { status: 404 });
	}

	const filePath = path.join(PDF_DIR, `${arxivId}.pdf`);

	// Serve from local storage if already downloaded
	if (fs.existsSync(filePath)) {
		const buffer = fs.readFileSync(filePath);
		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Cache-Control': 'public, max-age=86400',
			},
		});
	}

	// Fetch from arXiv and save locally
	const pdfUrl = `https://arxiv.org/pdf/${encodeURIComponent(arxivId)}`;
	console.log(`[pdf-proxy] Fetching PDF for ${arxivId} from ${pdfUrl}`);
	const res = await fetch(pdfUrl);
	if (!res.ok) {
		console.error(`[pdf-proxy] arXiv returned ${res.status}`);
		return new Response('Failed to fetch PDF', { status: res.status });
	}

	const pdfBuffer = await res.arrayBuffer();
	console.log(`[pdf-proxy] Got ${pdfBuffer.byteLength} bytes, saving to ${filePath}`);

	// Save to Google Drive folder
	try {
		fs.mkdirSync(PDF_DIR, { recursive: true });
		fs.writeFileSync(filePath, Buffer.from(pdfBuffer));
		console.log(`[pdf-proxy] Saved PDF to ${filePath}`);
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
