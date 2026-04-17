import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { parseReferences } from '$lib/server/lit-review-parser';
import type { AnnotatedReference } from '$lib/types';

export const GET: RequestHandler = async ({ params }) => {
	const threadId = params.id;
	const thread = db.getThread(threadId);
	if (!thread) return json({ error: 'thread not found' }, { status: 404 });

	if (!thread.synthesis?.trim()) {
		return json({ references: [], referenceSectionStart: -1 });
	}

	const { references, referenceSectionStart } = parseReferences(thread.synthesis);

	// Check which arxiv papers are already imported into this thread.
	const threadPapers = db.getAllPapers().filter(p => p.threadId === threadId);
	const importedArxivIds = new Set(threadPapers.map(p => p.arxivId).filter(Boolean));

	const annotated: AnnotatedReference[] = references.map(ref => {
		const imported = ref.arxivId ? importedArxivIds.has(ref.arxivId) : false;
		const paperId = imported
			? threadPapers.find(p => p.arxivId === ref.arxivId)?.id
			: undefined;
		return { ...ref, imported, paperId };
	});

	return json({ references: annotated, referenceSectionStart });
};
