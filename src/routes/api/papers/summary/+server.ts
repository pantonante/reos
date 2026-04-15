import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { readPaperSummary } from '$lib/server/fs-store';
import { readSummary as readLegacySummary } from '$lib/server/summary';
import {
	canonicalArxivId,
	findThreadForPaper,
	resolvePdfPath,
	writePaperSummary,
} from '$lib/server/write-through';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

function readSummaryAnywhere(paperId: string, arxivId: string) {
	const slug = findThreadForPaper(paperId);
	if (slug) {
		const nested = readPaperSummary(slug, arxivId);
		if (nested) return nested;
	}
	return readLegacySummary(arxivId);
}

export const GET: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'Paper id is required' }, { status: 400 });

	const paper = db.getPaper(id);
	if (!paper) return json({ error: 'Paper not found' }, { status: 404 });

	const cached = readSummaryAnywhere(paper.id, canonicalArxivId(paper));
	if (!cached) return json({ error: 'Summary not found' }, { status: 404 });
	return json(cached);
};

export const POST: RequestHandler = async ({ request }) => {
	const { id, regenerate } = await request.json();
	const paper = db.getPaper(id);
	if (!paper) return json({ error: 'Paper not found' }, { status: 404 });

	const arxivId = canonicalArxivId(paper);
	if (!regenerate) {
		const cached = readSummaryAnywhere(paper.id, arxivId);
		if (cached) return json(cached);
	}

	const pdfPath = resolvePdfPath(paper);
	if (!pdfPath || !fs.existsSync(pdfPath)) {
		return json({ error: 'PDF not found on disk' }, { status: 404 });
	}

	const skillPath = path.resolve('.claude', 'skills', 'paper-reviewer', 'skill.md');
	let skillContent = '';
	try {
		const raw = fs.readFileSync(skillPath, 'utf-8');
		const fmEnd = raw.indexOf('---', raw.indexOf('---') + 3);
		skillContent = fmEnd !== -1 ? raw.slice(fmEnd + 3).trim() : raw;
	} catch {
		return json({ error: 'Skill file not found' }, { status: 500 });
	}

	const prompt = skillContent.replace(/\$ARGUMENTS/g, pdfPath);
	const finalPrompt = prompt.replace(
		/3\. Produce the structured review and save it to a file\. The output file should have the same name as the input PDF but with a `\.md` extension instead of `\.pdf`\. For example, if the input is `my-paper\.pdf`, save the review to `my-paper\.md` in the same directory\./,
		'3. Output the structured review directly as your final response. Do NOT save it to any file. Just output the markdown review text and nothing else.'
	);

	try {
		const summary = await new Promise<string>((resolve, reject) => {
			const child = exec(
				`claude -p --output-format text --allowedTools "Read" --permission-mode bypassPermissions`,
				{
					maxBuffer: 1024 * 1024,
					timeout: 300000,
					env: { ...process.env, PATH: process.env.PATH },
				},
				(error, stdout, stderr) => {
					if (error) {
						reject(new Error(stderr || error.message));
					} else {
						resolve(stdout.trim());
					}
				}
			);
			child.stdin?.write(finalPrompt);
			child.stdin?.end();
		});

		const summaryDate = writePaperSummary(paper.id, summary);
		return json({ summary, summaryDate });
	} catch (err: any) {
		return json({ error: `Summary generation failed: ${err.message}` }, { status: 500 });
	}
};
