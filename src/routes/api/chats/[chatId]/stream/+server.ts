import { db } from '$lib/server/db';
import { PDF_DIR } from '$lib/server/pdf-storage';
import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';

export const POST: RequestHandler = async ({ request, params }) => {
	const { message, paperId } = await request.json();
	const chatId = params.chatId;
	const chat = db.getChat(chatId);

	if (!chat) {
		return new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 });
	}

	// Save user message
	db.addChatMessage({
		id: crypto.randomUUID(),
		chatId,
		role: 'user',
		content: message,
		createdAt: new Date().toISOString(),
	});

	// Update chat timestamp
	db.updateChat(chatId, { updatedAt: new Date().toISOString() });

	// Build claude CLI args
	const args = ['-p', '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Read,Glob,Grep,WebFetch,WebSearch'];
	if (chat.claudeSessionId) {
		args.push('--session-id', chat.claudeSessionId);
	}

	const child = spawn('claude', args, {
		env: { ...process.env },
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	// If paperId is provided, prepend PDF context for the first message
	let prompt = message;
	if (paperId) {
		const paper = db.getPaper(paperId);
		if (paper) {
			const pdfFullPath = path.join(PDF_DIR, `${paper.arxivId}.pdf`);
			prompt = `Read this pdf paper at "${pdfFullPath}". Title: "${paper.title}".\n\n${message}`;
		}
	}

	child.stdin.write(prompt);
	child.stdin.end();

	const stream = new ReadableStream({
		start(controller) {
			let fullText = '';
			let sessionId = chat.claudeSessionId;
			let buffer = '';

			child.stdout.on('data', (chunk: Buffer) => {
				buffer += chunk.toString();
				const lines = buffer.split('\n');
				// Keep the last potentially incomplete line in the buffer
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);
						if (event.type === 'assistant' && event.message?.content) {
							for (const block of event.message.content) {
								if (block.type === 'text') {
									fullText += block.text;
									controller.enqueue(
										new TextEncoder().encode(
											`data: ${JSON.stringify({ type: 'text', text: block.text })}\n\n`
										)
									);
								}
							}
						}
						if (event.type === 'result') {
							sessionId = event.session_id;
							// Use result text as the canonical full response
							if (event.result) {
								fullText = event.result;
							}
						}
					} catch {
						// Skip malformed JSON lines
					}
				}
			});

			child.on('close', () => {
				// Process any remaining buffer
				if (buffer.trim()) {
					try {
						const event = JSON.parse(buffer);
						if (event.type === 'result') {
							sessionId = event.session_id;
							if (event.result) fullText = event.result;
						}
					} catch { /* ignore */ }
				}

				// Save assistant message
				if (fullText) {
					db.addChatMessage({
						id: crypto.randomUUID(),
						chatId,
						role: 'assistant',
						content: fullText,
						createdAt: new Date().toISOString(),
					});
				}

				// Persist session ID for conversation continuity
				if (sessionId && sessionId !== chat.claudeSessionId) {
					db.updateChat(chatId, {
						claudeSessionId: sessionId,
						updatedAt: new Date().toISOString(),
					});
				}

				controller.enqueue(
					new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
				);
				controller.close();
			});

			child.on('error', (err) => {
				controller.enqueue(
					new TextEncoder().encode(
						`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`
					)
				);
				controller.close();
			});
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
};
