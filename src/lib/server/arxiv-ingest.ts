import fs from 'fs';
import path from 'path';
import type { Paper } from '$lib/types';
import { addPaper, resolvePdfWritePath } from './write-through';
import { db } from './db';

/**
 * Server-side arXiv metadata fetch. Mirrors the client's `fetchArxivPaper`
 * but runs on the Node side without DOMParser — the watcher/ingest pipeline
 * calls this directly rather than going through `/api/arxiv` + DOMParser.
 */
async function fetchArxivMetadata(arxivId: string): Promise<Partial<Paper>> {
	const res = await fetch(
		`https://export.arxiv.org/api/query?id_list=${arxivId}`,
		{ headers: { 'User-Agent': 'ReOS/1.0 (research paper manager)' } },
	);
	const text = await res.text();
	if (!res.ok || text.includes('Rate exceeded')) {
		return fetchArxivMetadataFromHtml(arxivId);
	}
	return parseAtomEntry(text, arxivId) ?? fetchArxivMetadataFromHtml(arxivId);
}

async function fetchArxivMetadataFromHtml(arxivId: string): Promise<Partial<Paper>> {
	const res = await fetch(`https://arxiv.org/abs/${arxivId}`, {
		headers: { 'User-Agent': 'ReOS/1.0 (research paper manager)' },
	});
	if (!res.ok) return {};
	const html = await res.text();
	const title = matchMeta(html, 'citation_title') ?? '';
	const abstract = matchMeta(html, 'citation_abstract') ?? '';
	const dateRaw = matchMeta(html, 'citation_date') ?? '';
	const publishedDate = dateRaw.replace(/\//g, '-');

	const authors: string[] = [];
	const authorRe = /<meta\s+name="citation_author"\s+content="([^"]+)"/g;
	let m: RegExpExecArray | null;
	while ((m = authorRe.exec(html)) !== null) {
		const parts = m[1].split(',').map((s) => s.trim());
		authors.push(parts.length > 1 ? `${parts[1]} ${parts[0]}` : parts[0]);
	}

	const categories: string[] = [];
	const subjects = html.match(/Subjects:.*?<\/td>/s)?.[0] ?? '';
	const catRe = /\(([a-z-]+\.[A-Z]+)\)/g;
	while ((m = catRe.exec(subjects)) !== null) categories.push(m[1]);

	return { title, abstract, publishedDate, authors, categories };
}

function parseAtomEntry(xml: string, arxivId: string): Partial<Paper> | null {
	// Minimal Atom entry extraction — we only need the handful of fields
	// fetchArxivPaper also extracts. Uses string ops; not a full XML parser,
	// but the arXiv Atom response is stable.
	const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
	if (!entryMatch) return null;
	const entry = entryMatch[1];

	const title = textOf(entry, 'title')?.replace(/\s+/g, ' ').trim();
	if (!title || title.toLowerCase().includes('error')) return null;
	const abstract = textOf(entry, 'summary')?.replace(/\s+/g, ' ').trim() ?? '';
	const publishedDate = textOf(entry, 'published')?.slice(0, 10) ?? '';

	const authors: string[] = [];
	const authorRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
	let m: RegExpExecArray | null;
	while ((m = authorRe.exec(entry)) !== null) {
		authors.push(m[1].trim());
	}

	const categories: string[] = [];
	const catRe = /<category\s+term="([^"]+)"/g;
	while ((m = catRe.exec(entry)) !== null) categories.push(m[1]);

	return { title, abstract, publishedDate, authors, categories };
}

function textOf(body: string, tag: string): string | null {
	const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
	return body.match(re)?.[1] ?? null;
}

function matchMeta(html: string, name: string): string | null {
	const re = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 's');
	return html.match(re)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
}

async function fetchArxivPdfBytes(arxivId: string): Promise<Buffer | null> {
	const res = await fetch(`https://arxiv.org/pdf/${arxivId}.pdf`, {
		headers: { 'User-Agent': 'ReOS/1.0 (research paper manager)' },
	});
	if (!res.ok) return null;
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length < 1024) return null;
	return buf;
}

/**
 * Fetch metadata + PDF for `arxivId` and add the resulting paper to `threadId`.
 * Returns the stored paper (with server-assigned id/slug), or null on failure.
 * Idempotent: returns the existing paper if this arXiv id is already in the
 * thread's papers/ folder.
 */
export async function addArxivPaperToThread(
	arxivId: string,
	threadId: string,
): Promise<Paper | null> {
	// Dedupe: if the thread already owns a paper with this arXiv id, skip.
	const existing = db
		.getAllPapers()
		.find((p) => p.arxivId === arxivId && p.threadId === threadId);
	if (existing) return existing;

	const meta = await fetchArxivMetadata(arxivId);
	if (!meta.title) {
		console.warn(`[arxiv-ingest] no metadata for ${arxivId}`);
		return null;
	}

	const now = new Date().toISOString();
	const draft: Paper = {
		id: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
		arxivId,
		title: meta.title,
		authors: meta.authors ?? [],
		abstract: meta.abstract ?? '',
		publishedDate: meta.publishedDate ?? '',
		categories: meta.categories ?? [],
		tags: [],
		readingStatus: 'unread',
		rating: null,
		pdfPath: '',
		arxivUrl: `https://arxiv.org/abs/${arxivId}`,
		addedAt: now,
		citations: [],
		links: [],
		summary: null,
		summaryDate: null,
		threadId,
	};
	const stored = addPaper(draft);

	const target = resolvePdfWritePath(stored);
	if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
		const bytes = await fetchArxivPdfBytes(arxivId);
		if (bytes) {
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, bytes);
		} else {
			console.warn(`[arxiv-ingest] failed to fetch PDF for ${arxivId}`);
		}
	}
	return stored;
}
