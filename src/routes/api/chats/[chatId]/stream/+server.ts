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
		args.push('--resume', chat.claudeSessionId);
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
			const pdfFullPath = path.join(PDF_DIR, `${paper.arxivId || paper.id}.pdf`);
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
			let stderrOutput = '';

			child.stderr.on('data', (chunk: Buffer) => {
				stderrOutput += chunk.toString();
			});

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
								if (block.type === 'text' && block.text) {
									fullText += block.text;
									controller.enqueue(
										new TextEncoder().encode(
											`data: ${JSON.stringify({ type: 'text', text: block.text })}\n\n`
										)
									);
								}
							}
						}
						// Handle streaming text deltas
						if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
							fullText += event.delta.text;
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`
								)
							);
						}
						// Forward tool use events (WebSearch, WebFetch)
						if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
							const toolName = event.content_block.name;
							if (toolName === 'WebSearch' || toolName === 'WebFetch') {
								controller.enqueue(
									new TextEncoder().encode(
										`data: ${JSON.stringify({ type: 'tool_start', tool: toolName, id: event.content_block.id })}\n\n`
									)
								);
							}
						}
						if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
							// Accumulate tool input for display
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({ type: 'tool_input_delta', text: event.delta.partial_json })}\n\n`
								)
							);
						}
						if (event.type === 'content_block_stop') {
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({ type: 'tool_stop' })}\n\n`
								)
							);
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

			child.on('close', (code) => {
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

				// If CLI exited with error and no output, send error to client
				if (code !== 0 && !fullText && stderrOutput) {
					controller.enqueue(
						new TextEncoder().encode(
							`data: ${JSON.stringify({ type: 'error', error: stderrOutput.trim() })}\n\n`
						)
					);
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
					new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`)
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
