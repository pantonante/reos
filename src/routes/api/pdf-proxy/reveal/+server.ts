import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import fs from 'fs';
import { db } from '$lib/server/db';
import { resolvePdfPath } from '$lib/server/write-through';
import { isLocalhost } from '$lib/server/localhost';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!isLocalhost(getClientAddress())) {
		return new Response('Forbidden', { status: 403 });
	}

	const arxivId = url.searchParams.get('id');
	if (!arxivId) {
		return new Response('Missing id parameter', { status: 400 });
	}

	const paper = db.getAllPapers().find((p) => (p.arxivId || p.id) === arxivId);
	if (!paper) return new Response('Paper not found', { status: 404 });

	const filePath = resolvePdfPath(paper);
	if (!filePath || !fs.existsSync(filePath)) {
		return new Response('PDF not found locally', { status: 404 });
	}

	exec(`open -R "${filePath}"`);
	return new Response('OK', { status: 200 });
};
