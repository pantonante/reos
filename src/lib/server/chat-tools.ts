import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { db } from './db';
import { readSummary } from './summary';

/**
 * Re:OS-native tools exposed to the chat agent as an in-process MCP server.
 * The Claude Agent SDK runs Claude Code under the hood and discovers these
 * tools via the MCP protocol — the model sees them under the namespaced
 * names `mcp__reos__search_papers`, `mcp__reos__get_paper`, etc.
 *
 * Web search and web fetch are NOT defined here — they're enabled separately
 * via the SDK's built-in `WebSearch` and `WebFetch` tools, which run on
 * Anthropic's infrastructure (no client dispatch needed).
 */

function textResult(value: unknown) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(value) }],
	};
}

const searchPapersTool = tool(
	'search_papers',
	"Search the user's local paper library by free-text query. Matches against title, authors, abstract, tags, and categories. Use this to discover papers in the library before reading them in detail.",
	{
		query: z.string().describe('Free-text query. Single keywords or short phrases work best.'),
		limit: z
			.number()
			.int()
			.optional()
			.describe('Maximum number of results to return. Default 10, max 30.'),
	},
	async ({ query, limit }) => {
		const q = (query ?? '').toLowerCase().trim();
		const cap = Math.min(Math.max(limit ?? 10, 1), 30);
		if (!q) return textResult({ results: [], note: 'Empty query' });

		const terms = q.split(/\s+/).filter(Boolean);
		const papers = db.getAllPapers();

		const scored = papers
			.map((p) => {
				const haystack = [
					p.title,
					p.authors.join(' '),
					p.abstract,
					p.tags.join(' '),
					p.categories.join(' '),
				]
					.join(' ')
					.toLowerCase();
				let score = 0;
				for (const t of terms) {
					if (!haystack.includes(t)) continue;
					if (p.title.toLowerCase().includes(t)) score += 3;
					else score += 1;
				}
				return { paper: p, score };
			})
			.filter((r) => r.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, cap);

		return textResult({
			count: scored.length,
			results: scored.map(({ paper, score }) => ({
				id: paper.id,
				arxivId: paper.arxivId,
				title: paper.title,
				authors: paper.authors,
				publishedDate: paper.publishedDate,
				categories: paper.categories,
				tags: paper.tags,
				readingStatus: paper.readingStatus,
				abstractSnippet: paper.abstract.slice(0, 280),
				score,
			})),
		});
	}
);

const getPaperTool = tool(
	'get_paper',
	'Fetch full metadata for a single paper by its Re:OS id (the internal id, not the arxivId). Returns title, authors, abstract, categories, tags, reading status, and the AI-generated summary if one exists. Call this after search_papers to read details about a specific paper.',
	{
		id: z.string().describe('Internal Re:OS paper id.'),
	},
	async ({ id }) => {
		const p = db.getPaper(id);
		if (!p) return textResult({ error: `No paper with id ${id}` });
		const summary = p.arxivId ? readSummary(p.arxivId) : null;
		return textResult({
			id: p.id,
			arxivId: p.arxivId,
			title: p.title,
			authors: p.authors,
			abstract: p.abstract,
			publishedDate: p.publishedDate,
			categories: p.categories,
			tags: p.tags,
			readingStatus: p.readingStatus,
			rating: p.rating,
			arxivUrl: p.arxivUrl,
			addedAt: p.addedAt,
			summary: summary?.summary ?? null,
			summaryDate: summary?.summaryDate ?? null,
		});
	}
);

const listThreadsTool = tool(
	'list_threads',
	"List the user's research threads. Threads are ongoing investigations that group papers around a question. Optionally filter by status.",
	{
		status: z
			.enum(['active', 'paused', 'concluded'])
			.optional()
			.describe('Optional status filter.'),
	},
	async ({ status }) => {
		let threads = db.getAllThreads();
		if (status) threads = threads.filter((t) => t.status === status);
		return textResult({
			count: threads.length,
			threads: threads.map((t) => ({
				id: t.id,
				title: t.title,
				question: t.question,
				status: t.status,
				paperCount: t.papers.length,
				tags: t.tags,
				updatedAt: t.updatedAt,
			})),
		});
	}
);

const getThreadTool = tool(
	'get_thread',
	'Fetch full details for a single thread by id: title, research question, status, the ordered list of papers (with their context notes), the synthesis, tags, and external links.',
	{
		id: z.string().describe('Thread id.'),
	},
	async ({ id }) => {
		const t = db.getThread(id);
		if (!t) return textResult({ error: `No thread with id ${id}` });
		const papers = t.papers.map((tp) => {
			const p = db.getPaper(tp.paperId);
			return {
				paperId: tp.paperId,
				order: tp.order,
				contextNote: tp.contextNote,
				title: p?.title ?? null,
				arxivId: p?.arxivId ?? null,
			};
		});
		return textResult({
			id: t.id,
			title: t.title,
			question: t.question,
			status: t.status,
			synthesis: t.synthesis,
			tags: t.tags,
			links: t.links,
			papers,
			createdAt: t.createdAt,
			updatedAt: t.updatedAt,
		});
	}
);

const listAnnotationsTool = tool(
	'list_annotations',
	'List annotations (highlights, notes, questions, cross-references) the user has made on papers. Filter by paperId or threadId. Useful for surfacing what the user has already noted about a topic.',
	{
		paperId: z.string().optional().describe('Filter to annotations on this paper.'),
		threadId: z.string().optional().describe('Filter to annotations scoped to this thread.'),
	},
	async ({ paperId, threadId }) => {
		let anns = db.getAllAnnotations();
		if (paperId) anns = anns.filter((a) => a.paperId === paperId);
		if (threadId) anns = anns.filter((a) => a.threadId === threadId);
		return textResult({
			count: anns.length,
			annotations: anns.map((a) => ({
				id: a.id,
				paperId: a.paperId,
				threadId: a.threadId,
				type: a.type,
				content: a.content,
				selectedText: a.selectedText,
				page: a.page,
				createdAt: a.createdAt,
			})),
		});
	}
);

const listNotesTool = tool(
	'list_notes',
	"List the user's free-form notes on a paper.",
	{
		paperId: z.string().describe('Paper id to fetch notes for.'),
	},
	async ({ paperId }) => {
		const notes = db.getAllNotes().filter((n) => n.paperId === paperId);
		return textResult({
			count: notes.length,
			notes: notes.map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt })),
		});
	}
);

export const reosMcpServer = createSdkMcpServer({
	name: 'reos',
	version: '1.0.0',
	tools: [
		searchPapersTool,
		getPaperTool,
		listThreadsTool,
		getThreadTool,
		listAnnotationsTool,
		listNotesTool,
	],
});

/**
 * Friendly display names for tools that the model can call. The Agent SDK
 * exposes our MCP tools under namespaced names like `mcp__reos__search_papers`;
 * this map is used by the streaming endpoint to surface short labels in
 * `tool_start` events so the chat UI doesn't show the raw MCP names.
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
	mcp__reos__search_papers: 'search_papers',
	mcp__reos__get_paper: 'get_paper',
	mcp__reos__list_threads: 'list_threads',
	mcp__reos__get_thread: 'get_thread',
	mcp__reos__list_annotations: 'list_annotations',
	mcp__reos__list_notes: 'list_notes',
	WebSearch: 'web_search',
	WebFetch: 'web_fetch',
};

export function displayToolName(rawName: string): string {
	return TOOL_DISPLAY_NAMES[rawName] ?? rawName;
}
