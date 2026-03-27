import type { Paper } from './types';

export function extractArxivId(raw: string): string | null {
	const match = raw.trim().match(/(\d{4}\.\d{4,5})(v\d+)?/);
	return match ? match[1] : null;
}

export async function fetchArxivPaper(arxivId: string): Promise<Paper> {
	const res = await fetch(`/api/arxiv?id=${arxivId}`);
	if (!res.ok) throw new Error('Failed to fetch from Arxiv');

	const text = await res.text();
	const parser = new DOMParser();
	const xml = parser.parseFromString(text, 'text/xml');
	const entry = xml.querySelector('entry');

	if (!entry || entry.querySelector('title')?.textContent?.includes('Error')) {
		throw new Error(`Paper ${arxivId} not found on Arxiv.`);
	}

	const title = entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
	const authors = Array.from(entry.querySelectorAll('author name')).map(n => n.textContent?.trim() ?? '');
	const abstract = entry.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
	const published = entry.querySelector('published')?.textContent?.slice(0, 10) ?? '';
	const categories = Array.from(entry.querySelectorAll('category')).map(c => c.getAttribute('term') ?? '').filter(Boolean);

	return {
		id: `p${Date.now()}`,
		arxivId,
		title,
		authors,
		abstract,
		publishedDate: published,
		categories,
		tags: [],
		readingStatus: 'unread',
		rating: null,
		pdfPath: `/papers/${arxivId}.pdf`,
		arxivUrl: `https://arxiv.org/abs/${arxivId}`,
		addedAt: new Date().toISOString(),
		citations: [],
		summary: null,
		summaryDate: null,
	};
}
