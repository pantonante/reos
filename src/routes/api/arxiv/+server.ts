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

		// If rate-limited, fall back to scraping the abstract page
		if (text.includes('Rate exceeded') || !res.ok) {
			console.log(`[arxiv] API rate-limited for ${arxivId}, falling back to abstract page`);
			return await fetchFromAbstractPage(arxivId);
		}

		return new Response(text, {
			headers: { 'Content-Type': 'application/xml' },
		});
	} catch {
		// Network error on API — try abstract page fallback
		try {
			return await fetchFromAbstractPage(arxivId);
		} catch {
			return json({ error: 'Failed to fetch from Arxiv' }, { status: 502 });
		}
	}
};

async function fetchFromAbstractPage(arxivId: string): Promise<Response> {
	const res = await fetch(`https://arxiv.org/abs/${arxivId}`, {
		headers: { 'User-Agent': 'ReOS/1.0 (research paper manager)' },
	});

	if (!res.ok) {
		return new Response(
			`<feed><entry><title>Error</title></entry></feed>`,
			{ headers: { 'Content-Type': 'application/xml' } }
		);
	}

	const html = await res.text();

	// Extract metadata from <meta> tags
	const title = extractMeta(html, 'citation_title') || '';
	const abstract = extractMeta(html, 'citation_abstract') || '';
	const dateRaw = extractMeta(html, 'citation_date') || '';
	// citation_date is YYYY/MM/DD, convert to YYYY-MM-DD
	const published = dateRaw.replace(/\//g, '-');

	// Extract all authors
	const authors: string[] = [];
	const authorRegex = /<meta\s+name="citation_author"\s+content="([^"]+)"/g;
	let match;
	while ((match = authorRegex.exec(html)) !== null) {
		// citation_author is "Last, First" — convert to "First Last"
		const parts = match[1].split(',').map(s => s.trim());
		authors.push(parts.length > 1 ? `${parts[1]} ${parts[0]}` : parts[0]);
	}

	// Extract categories from the subjects line
	const categories: string[] = [];
	const catRegex = /\(([a-z-]+\.[A-Z]+)\)/g;
	const subjectsSection = html.match(/Subjects:.*?<\/td>/s)?.[0] || '';
	while ((match = catRegex.exec(subjectsSection)) !== null) {
		categories.push(match[1]);
	}

	// Build Atom XML in the same format the arXiv API returns
	const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const authorXml = authors.map(a => `<author><name>${escXml(a)}</name></author>`).join('');
	const categoryXml = categories.map(c => `<category term="${escXml(c)}"/>`).join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/${escXml(arxivId)}</id>
    <title>${escXml(title)}</title>
    <summary>${escXml(abstract)}</summary>
    <published>${published}T00:00:00Z</published>
    ${authorXml}
    ${categoryXml}
  </entry>
</feed>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml' },
	});
}

function extractMeta(html: string, name: string): string | null {
	const regex = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 's');
	const match = html.match(regex);
	return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}
