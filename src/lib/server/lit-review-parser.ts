import { extractArxivId } from '$lib/arxiv';

export interface ParsedReferences {
	arxivIds: string[];
	links: { label: string; url: string }[];
}

// Match any markdown heading whose text contains "references" or "bibliograph*".
// Accepts variants like `## References`, `## 10. Selected References`,
// `# Bibliographic sources`, `# Bibliography`, etc.
const REF_HEADING_RE = /^(#{1,6})\s+.*?(?:references?|bibliograph(?:y|ic|ical|ies)?).*$/gim;
const URL_RE = /https?:\/\/[^\s\)\]<>"']+/i;

/**
 * Pull structured refs out of the literature-review markdown. Scans every
 * references/bibliography section the skill emits and extracts arXiv IDs and
 * external URLs from each entry line.
 */
export function parseReferences(markdown: string): ParsedReferences {
	const sections: string[] = [];
	const matches = [...markdown.matchAll(REF_HEADING_RE)];
	if (matches.length === 0) {
		// Fallback: scan the whole doc. Better to over-capture than miss refs
		// when the skill formatting drifts.
		sections.push(markdown);
	} else {
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

	const arxivSet = new Set<string>();
	const links: { label: string; url: string }[] = [];
	const linkUrls = new Set<string>();

	for (const section of sections) {
		for (const rawLine of section.split(/\r?\n/)) {
			// Strip bullet/numeric prefixes like `- `, `* `, `1. `, `10. `.
			const line = rawLine.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim();
			if (!line) continue;
			// Ignore bold pseudo-headings like `**Surveys / Reviews**`.
			if (/^\*\*[^*]+\*\*\s*$/.test(line)) continue;

			// arXiv hit → treat the whole line as a paper reference and skip
			// extracting a link for it.
			const aid = extractArxivId(line);
			if (aid) {
				arxivSet.add(aid);
				continue;
			}

			const url = line.match(URL_RE)?.[0];
			if (!url) continue;
			const normalized = url.replace(/[.,;\)\]]+$/, '');
			if (linkUrls.has(normalized)) continue;
			linkUrls.add(normalized);
			const label =
				line.replace(normalized, '').replace(/[-–—:\s]+$/, '').trim() || normalized;
			links.push({ label, url: normalized });
		}
	}

	return { arxivIds: [...arxivSet], links };
}
