import { extractArxivId } from '$lib/arxiv';

export interface ParsedReference {
	arxivId: string | null;
	label: string;
	url: string;
	type: 'arxiv' | 'external';
}

export interface ParsedReferences {
	references: ParsedReference[];
	/** Character offset in the original markdown where the first References/Bibliography heading starts. -1 if none found. */
	referenceSectionStart: number;
}

// Match any markdown heading whose text contains "references" or "bibliograph*".
// Accepts variants like `## References`, `## 10. Selected References`,
// `# Bibliographic sources`, `# Bibliography`, etc.
const REF_HEADING_RE = /^(#{1,6})\s+.*?(?:references?|bibliograph(?:y|ic|ical|ies)?).*$/gim;
const URL_RE = /https?:\/\/[^\s\)\]<>"']+/i;
const ARXIV_URL_RE = /https?:\/\/(?:arxiv\.org\/(?:abs|pdf)|export\.arxiv\.org\/(?:abs|pdf))\/[\w./-]+/i;

/**
 * Extract a human-readable label from a markdown reference line.
 * Strips URLs, arxiv IDs, markdown link syntax, and trailing punctuation.
 */
function extractLabel(line: string): string {
	return line
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // [text](url) → text
		.replace(URL_RE, '')                          // strip URLs
		.replace(/\(?arXiv:\s*\d{4}\.\d{4,5}(?:v\d+)?\)?/gi, '') // strip arXiv:XXXX.XXXXX
		.replace(/\d{4}\.\d{4,5}(?:v\d+)?/g, '')     // strip bare arxiv IDs
		.replace(/[[\]()]/g, '')                       // strip remaining brackets
		.replace(/[-–—:,;\s]+$/, '')                   // trim trailing punctuation
		.replace(/^[-–—:,;\s]+/, '')                   // trim leading punctuation
		.trim();
}

/**
 * Pull structured refs out of the literature-review markdown. Scans every
 * references/bibliography section the skill emits and extracts arXiv IDs and
 * external URLs from each entry line.
 */
export function parseReferences(markdown: string): ParsedReferences {
	const sections: string[] = [];
	const matches = [...markdown.matchAll(REF_HEADING_RE)];
	let referenceSectionStart = -1;

	if (matches.length === 0) {
		// Fallback: scan the whole doc. Better to over-capture than miss refs
		// when the skill formatting drifts.
		sections.push(markdown);
	} else {
		referenceSectionStart = matches[0].index ?? -1;
		for (let i = 0; i < matches.length; i++) {
			const m = matches[i];
			const level = m[1].length;
			const start = (m.index ?? 0) + m[0].length;
			// Stop at the next heading of same-or-higher level (or next refs heading).
			let end = markdown.length;
			const tail = markdown.slice(start);
			const nextSame = tail.search(new RegExp(`\\n#{1,${level}}\\s+\\S`));
			if (nextSame !== -1) end = start + nextSame;
			sections.push(markdown.slice(start, end));
		}
	}

	const references: ParsedReference[] = [];
	const seenArxiv = new Set<string>();
	const seenUrls = new Set<string>();

	for (const section of sections) {
		for (const rawLine of section.split(/\r?\n/)) {
			// Strip bullet/numeric prefixes like `- `, `* `, `1. `, `10. `.
			const line = rawLine.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim();
			if (!line) continue;
			// Ignore bold pseudo-headings like `**Surveys / Reviews**`.
			if (/^\*\*[^*]+\*\*\s*$/.test(line)) continue;

			// arXiv hit → structured reference with label
			const aid = extractArxivId(line);
			if (aid) {
				if (seenArxiv.has(aid)) continue;
				seenArxiv.add(aid);
				const label = extractLabel(line) || `arXiv:${aid}`;
				references.push({
					arxivId: aid,
					label,
					url: `https://arxiv.org/abs/${aid}`,
					type: 'arxiv',
				});
				continue;
			}

			const url = line.match(URL_RE)?.[0];
			if (!url) continue;
			const normalized = url.replace(/[.,;\)\]]+$/, '');
			if (seenUrls.has(normalized)) continue;
			seenUrls.add(normalized);
			const label = extractLabel(line) || normalized;
			references.push({
				arxivId: null,
				label,
				url: normalized,
				type: 'external',
			});
		}
	}

	return { references, referenceSectionStart };
}
