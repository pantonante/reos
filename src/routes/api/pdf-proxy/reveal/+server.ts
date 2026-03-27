import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PDF_DIR } from '$lib/server/pdf-storage';
import { isLocalhost } from '$lib/server/localhost';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!isLocalhost(getClientAddress())) {
		return new Response('Forbidden', { status: 403 });
	}

	const arxivId = url.searchParams.get('id');
	if (!arxivId) {
		return new Response('Missing id parameter', { status: 400 });
	}

	const filePath = path.join(PDF_DIR, `${arxivId}.pdf`);

	if (!fs.existsSync(filePath)) {
		return new Response('PDF not found locally', { status: 404 });
	}

	exec(`open -R "${filePath}"`);

	return new Response('OK', { status: 200 });
};
