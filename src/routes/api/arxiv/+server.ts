import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const arxivId = url.searchParams.get('id');
	if (!arxivId) {
		return json({ error: 'Missing id parameter' }, { status: 400 });
	}

	try {
		const res = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
		const text = await res.text();

		return new Response(text, {
			headers: { 'Content-Type': 'application/xml' },
		});
	} catch {
		return json({ error: 'Failed to fetch from Arxiv' }, { status: 502 });
	}
};
