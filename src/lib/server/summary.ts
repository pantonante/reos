import fs from 'fs';
import path from 'path';
import { PDF_DIR } from './pdf-storage';

/**
 * Get the path for a paper's summary file.
 */
export function getSummaryPath(arxivId: string): string {
	return path.join(PDF_DIR, `${arxivId}.summary.md`);
}

/**
 * Read a summary from disk. Returns null if no summary file exists.
 */
export function readSummary(arxivId: string): { summary: string; summaryDate: string } | null {
	const filePath = getSummaryPath(arxivId);
	if (!fs.existsSync(filePath)) return null;

	const raw = fs.readFileSync(filePath, 'utf-8');

	// Parse frontmatter
	let summary = raw;
	let summaryDate = '';

	if (raw.startsWith('---')) {
		const fmEnd = raw.indexOf('---', 3);
		if (fmEnd !== -1) {
			const frontmatter = raw.slice(3, fmEnd).trim();
			summary = raw.slice(fmEnd + 3).trim();

			const dateMatch = frontmatter.match(/generatedAt:\s*(.+)/);
			if (dateMatch) {
				summaryDate = dateMatch[1].trim();
			}
		}
	}

	return { summary, summaryDate };
}

/**
 * Write a summary to disk with frontmatter. Returns the generation timestamp.
 */
export function writeSummary(arxivId: string, content: string): string {
	const filePath = getSummaryPath(arxivId);
	const generatedAt = new Date().toISOString();

	const fileContent = `---\ngeneratedAt: ${generatedAt}\n---\n\n${content}`;
	fs.writeFileSync(filePath, fileContent, 'utf-8');

	return generatedAt;
}
