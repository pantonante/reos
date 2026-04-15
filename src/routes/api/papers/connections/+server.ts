import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { PDF_DIR } from '$lib/server/paths';
import { replaceConnectionsForPaper } from '$lib/server/write-through';
import type { RequestHandler } from './$types';
import type { PaperConnection } from '$lib/types';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export const GET: RequestHandler = async ({ url }) => {
	const paperId = url.searchParams.get('paperId');
	if (paperId) {
		return json(db.getConnectionsForPaper(paperId));
	}
	return json(db.getAllConnections());
};

export const POST: RequestHandler = async ({ request }) => {
	const { paperId, regenerate } = await request.json();
	const paper = db.getPaper(paperId);
	if (!paper) return json({ error: 'Paper not found' }, { status: 404 });

	// Return cached connections unless regenerating
	if (!regenerate) {
		const existing = db.getConnectionsForPaper(paperId);
		if (existing.length > 0) {
			return json(existing);
		}
	}

	const allPapers = db.getAllPapers();
	const candidates = allPapers.filter(p => p.id !== paperId);
	if (candidates.length === 0) {
		return new Response(
			`data: ${JSON.stringify({ type: 'done', connections: [] })}\n\n`,
			{ headers: sseHeaders() }
		);
	}

	// Build lightweight input JSON -- abstracts inline, summaries/PDFs via file paths
	const input = {
		papersFolder: PDF_DIR,
		target: {
			id: paper.id,
			arxivId: paper.arxivId,
			title: paper.title,
			abstract: paper.abstract,
		},
		candidates: candidates.map(p => ({
			id: p.id,
			arxivId: p.arxivId,
			title: p.title,
			abstract: p.abstract,
		})),
	};

	// Write to temp file
	const tmpFile = path.join(os.tmpdir(), `reos-connections-${Date.now()}.json`);
	fs.writeFileSync(tmpFile, JSON.stringify(input, null, 2));

	// Read the skill prompt template
	const skillPath = path.resolve('.claude', 'skills', 'paper-connector', 'skill.md');
	let skillContent = '';
	try {
		const raw = fs.readFileSync(skillPath, 'utf-8');
		const fmEnd = raw.indexOf('---', raw.indexOf('---') + 3);
		skillContent = fmEnd !== -1 ? raw.slice(fmEnd + 3).trim() : raw;
	} catch {
		fs.unlinkSync(tmpFile);
		return json({ error: 'Skill file not found' }, { status: 500 });
	}

	const prompt = skillContent.replace(/\$ARGUMENTS/g, tmpFile);

	// Spawn claude with streaming JSON output
	const child = spawn('claude', [
		'-p', '--output-format', 'stream-json', '--verbose',
		'--allowedTools', 'Read,Glob',
		'--permission-mode', 'bypassPermissions',
	], {
		env: { ...process.env },
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	child.stdin.write(prompt);
	child.stdin.end();

	const stream = new ReadableStream({
		start(controller) {
			let fullText = '';
			let buffer = '';

			const send = (data: Record<string, unknown>) => {
				controller.enqueue(
					new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
				);
			};

			// Send initial status
			send({ type: 'status', text: `Analyzing: ${paper.title}` });

			child.stderr.on('data', () => {
				// Suppress stderr noise
			});

			child.stdout.on('data', (chunk: Buffer) => {
				buffer += chunk.toString();
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);

						// Stream text deltas
						if (event.type === 'assistant' && event.message?.content) {
							for (const block of event.message.content) {
								if (block.type === 'text' && block.text) {
									fullText += block.text;
									send({ type: 'text', text: block.text });
								}
							}
						}
						if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
							fullText += event.delta.text;
							send({ type: 'text', text: event.delta.text });
						}

						// Forward tool use events
						if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
							send({ type: 'tool_start', tool: event.content_block.name, id: event.content_block.id });
						}
						if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
							send({ type: 'tool_input', text: event.delta.partial_json });
						}
						if (event.type === 'content_block_stop') {
							send({ type: 'tool_stop' });
						}

						// Capture final result
						if (event.type === 'result' && event.result) {
							fullText = event.result;
						}
					} catch {
						// Skip malformed lines
					}
				}
			});

			child.on('close', () => {
				// Process remaining buffer
				if (buffer.trim()) {
					try {
						const event = JSON.parse(buffer);
						if (event.type === 'result' && event.result) {
							fullText = event.result;
						}
					} catch { /* ignore */ }
				}

				// Parse connections from the full output
				let connections: PaperConnection[] = [];
				try {
					let jsonStr = fullText;
					const fenceMatch = fullText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
					if (fenceMatch) jsonStr = fenceMatch[1].trim();

					const result = JSON.parse(jsonStr);
					const validTypes = ['builds-on', 'same-method', 'same-topic', 'contradicts', 'complementary'];
					const paperIds = new Set(allPapers.map(p => p.id));
					const now = new Date().toISOString();

					connections = (result.connections || [])
						.filter((c: any) =>
							paperIds.has(c.fromPaperId) &&
							paperIds.has(c.toPaperId) &&
							validTypes.includes(c.connectionType) &&
							typeof c.strength === 'number' &&
							c.strength >= 0.3 && c.strength <= 1.0
						)
						.map((c: any) => ({
							id: crypto.randomUUID(),
							fromPaperId: c.fromPaperId,
							toPaperId: c.toPaperId,
							connectionType: c.connectionType,
							strength: c.strength,
							explanation: c.explanation || '',
							generatedAt: now,
						}));

					replaceConnectionsForPaper(paperId, connections);
				} catch (err: any) {
					send({ type: 'error', error: `Failed to parse connections: ${err.message}` });
				}

				// Clean up temp file
				try { fs.unlinkSync(tmpFile); } catch {}

				send({ type: 'done', connections });
				controller.close();
			});

			child.on('error', (err) => {
				try { fs.unlinkSync(tmpFile); } catch {}
				send({ type: 'error', error: err.message });
				controller.close();
			});
		},
	});

	return new Response(stream, { headers: sseHeaders() });
};

function sseHeaders() {
	return {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
	};
}

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	if (id) {
		// Placeholder for individual connection deletion
	}
	return json({ ok: true });
};
