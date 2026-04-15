import { db } from '$lib/server/db';
import { readPaperSummary } from '$lib/server/fs-store';
import { readSummary as readLegacySummary } from '$lib/server/summary';
import type { Paper } from '$lib/types';
import {
	canonicalArxivId,
	findThreadForPaper,
	resolvePdfPath,
	resolvePdfWritePath,
	writePaperSummary,
} from '$lib/server/write-through';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const MAX_CONCURRENCY = 3;

function summaryExists(paper: Paper): boolean {
	const aid = canonicalArxivId(paper);
	const slug = findThreadForPaper(paper.id);
	if (slug && readPaperSummary(slug, aid)) return true;
	return !!readLegacySummary(aid);
}

async function downloadPdf(paper: Paper): Promise<string | null> {
	const existing = resolvePdfPath(paper);
	if (existing && fs.existsSync(existing)) return existing;

	try {
		const pdfUrl = `https://arxiv.org/pdf/${encodeURIComponent(canonicalArxivId(paper))}`;
		const res = await fetch(pdfUrl);
		if (!res.ok) return null;

		const pdfBuffer = await res.arrayBuffer();
		const target = resolvePdfWritePath(paper);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, Buffer.from(pdfBuffer));
		return target;
	} catch {
		return null;
	}
}

async function generateSummary(pdfPath: string): Promise<string> {

	const skillPath = path.resolve('.claude', 'skills', 'paper-reviewer', 'skill.md');
	const raw = fs.readFileSync(skillPath, 'utf-8');
	const fmEnd = raw.indexOf('---', raw.indexOf('---') + 3);
	const skillContent = fmEnd !== -1 ? raw.slice(fmEnd + 3).trim() : raw;

	const prompt = skillContent.replace(/\$ARGUMENTS/g, pdfPath);
	const finalPrompt = prompt.replace(
		/3\. Produce the structured review and save it to a file\. The output file should have the same name as the input PDF but with a `\.md` extension instead of `\.pdf`\. For example, if the input is `my-paper\.pdf`, save the review to `my-paper\.md` in the same directory\./,
		'3. Output the structured review directly as your final response. Do NOT save it to any file. Just output the markdown review text and nothing else.'
	);

	return new Promise<string>((resolve, reject) => {
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
}

export const POST: RequestHandler = async ({ request }) => {
	const allPapers = db.getAllPapers();
	const papersToProcess = allPapers.filter((p) => !summaryExists(p));

	const total = papersToProcess.length;
	let completed = 0;
	let succeeded = 0;
	let failed = 0;
	let cancelled = false;

	const stream = new ReadableStream({
		start(controller) {
			const send = (data: Record<string, unknown>) => {
				try {
					controller.enqueue(
						new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
					);
				} catch {
					// Stream closed
					cancelled = true;
				}
			};

			send({ type: 'start', total });

			if (total === 0) {
				send({ type: 'complete', succeeded: 0, failed: 0, total: 0 });
				controller.close();
				return;
			}

			// Concurrency pool
			let index = 0;

			async function processNext(): Promise<void> {
				while (index < papersToProcess.length) {
					if (cancelled) return;

					const paper = papersToProcess[index++];

					try {
						// Download PDF if needed
						send({
							type: 'progress',
							paperId: paper.id,
							title: paper.title,
							status: 'downloading',
							current: completed + 1,
							total,
						});

						const pdfPath = await downloadPdf(paper);
						if (!pdfPath) {
							completed++;
							failed++;
							send({
								type: 'progress',
								paperId: paper.id,
								title: paper.title,
								status: 'error',
								error: 'PDF download failed',
								current: completed,
								total,
							});
							continue;
						}

						if (cancelled) return;

						// Generate summary
						send({
							type: 'progress',
							paperId: paper.id,
							title: paper.title,
							status: 'generating',
							current: completed + 1,
							total,
						});

						const summary = await generateSummary(pdfPath);
						writePaperSummary(paper.id, summary);

						completed++;
						succeeded++;
						send({
							type: 'progress',
							paperId: paper.id,
							title: paper.title,
							status: 'done',
							current: completed,
							total,
						});
					} catch (err: any) {
						completed++;
						failed++;
						send({
							type: 'progress',
							paperId: paper.id,
							title: paper.title,
							status: 'error',
							error: err.message || 'Unknown error',
							current: completed,
							total,
						});
					}
				}
			}

			const workers = Array.from(
				{ length: Math.min(MAX_CONCURRENCY, total) },
				() => processNext()
			);

			Promise.all(workers).then(() => {
				if (!cancelled) {
					send({ type: 'complete', succeeded, failed, total });
				}
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
		},

		cancel() {
			cancelled = true;
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
};
