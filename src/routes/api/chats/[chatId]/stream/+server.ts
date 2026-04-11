import type { ChatMessage, ChatMessagePart } from '$lib/types';
import { db } from '$lib/server/db';
import { PDF_DIR } from '$lib/server/pdf-storage';
import { runChatTurn, type ChatEvent } from '$lib/server/anthropic';
import type { RequestHandler } from './$types';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const MAX_ATTACHABLE_PDF_BYTES = 14 * 1024 * 1024;

/**
 * Native Claude Agent SDK chat streaming endpoint.
 *
 * Each turn opens a `query()` against the user's Claude Code session
 * (resuming via `chat.claudeSessionId` if one already exists, otherwise
 * starting a fresh one). The Agent SDK runs the agent loop, executes
 * Re:OS-native MCP tools + WebSearch/WebFetch, and emits events that we
 * forward as SSE in the existing wire format. After the loop finishes
 * we persist the new user and assistant messages with their full content
 * blocks (`parts`) so the chat UI can re-render thinking + tool cards on
 * reload, and we save the (possibly new) Claude Code session id back to
 * the chat row for the next turn's resume.
 */
export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json();
	const message: string = body.message;
	const requestedPaperIds: string[] = [
		...((body.paperIds as string[] | undefined) ?? []),
		...(body.paperId ? [body.paperId as string] : []),
	];
	const chatId = params.chatId!;
	const chat = db.getChat(chatId);

	if (!chat) {
		return new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 });
	}

	// Build the new user turn's content blocks. PDFs first (so prompt
	// caching has the heavy stuff at the front of the prefix), then text.
	const userBlocks: ChatMessagePart[] = [];
	const fallbackPaperContexts: string[] = [];
	const seen = new Set<string>();
	for (const pid of requestedPaperIds) {
		if (!pid || seen.has(pid)) continue;
		seen.add(pid);
		const paper = db.getPaper(pid);
		if (!paper) continue;

		const contextLines = [
			`Title: ${paper.title}`,
			`ArXiv ID: ${paper.arxivId}`,
			`Authors: ${paper.authors.join(', ')}`,
			`Abstract: ${paper.abstract}`,
		];

		try {
			const pdfFullPath = path.join(PDF_DIR, `${paper.arxivId || paper.id}.pdf`);
			if (!fs.existsSync(pdfFullPath)) {
				fallbackPaperContexts.push(
					`Attachment status: Missing local PDF at ${pdfFullPath}\n${contextLines.join('\n')}`
				);
				continue;
			}
			const pdfStats = fs.statSync(pdfFullPath);
			if (pdfStats.size > MAX_ATTACHABLE_PDF_BYTES) {
				const sizeMb = (pdfStats.size / (1024 * 1024)).toFixed(1);
				const limitMb = (MAX_ATTACHABLE_PDF_BYTES / (1024 * 1024)).toFixed(0);
				fallbackPaperContexts.push(
					`Attachment status: PDF too large to inline (${sizeMb} MB > ${limitMb} MB safe upload cap)\n${contextLines.join('\n')}`
				);
				continue;
			}
			const pdfBytes = fs.readFileSync(pdfFullPath);
			userBlocks.push({
				type: 'document',
				source: {
					type: 'base64',
					media_type: 'application/pdf',
					data: pdfBytes.toString('base64'),
				},
				title: paper.title,
			});
		} catch {
			// Couldn't read the PDF — skip it. The model can still use tools.
			fallbackPaperContexts.push(
				`Attachment status: Failed to read local PDF bytes\n${contextLines.join('\n')}`
			);
		}
	}
	userBlocks.push({ type: 'text', text: message });

	const additionalSystemContext =
		fallbackPaperContexts.length > 0
			? [
					'One or more selected paper PDFs could not be attached for this turn.',
					'Briefly disclose this to the user, then continue using the fallback metadata below and available tools.',
					...fallbackPaperContexts.map((ctx, i) => `Fallback paper context ${i + 1}:\n${ctx}`),
			  ].join('\n\n')
			: undefined;

	// Persist the user message immediately so it survives stream interruption.
	const userMsg: ChatMessage = {
		id: crypto.randomUUID(),
		chatId,
		role: 'user',
		content: message,
		parts: userBlocks,
		createdAt: new Date().toISOString(),
	};
	db.addChatMessage(userMsg);
	db.updateChat(chatId, { updatedAt: new Date().toISOString() });

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const emit = (event: ChatEvent) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					// Controller closed (client disconnected) — ignore.
				}
			};

			try {
				const result = await runChatTurn({
					userMessageContent: userBlocks,
					resumeSessionId: chat.claudeSessionId,
					additionalSystemContext,
					emit,
					signal: request.signal,
				});

				// Persist the assistant turn (with reasoning + tool_use blocks
				// in `parts` so the UI can re-render the full activity on reload).
				if (result.assistantBlocks.length > 0) {
					const text = result.assistantBlocks
						.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
						.map((b) => b.text)
						.join('\n\n');
					db.addChatMessage({
						id: crypto.randomUUID(),
						chatId,
						role: 'assistant',
						content: text || result.text,
						parts: result.assistantBlocks,
						createdAt: new Date().toISOString(),
					});
				}

				// Save the (possibly new) Claude Code session id back to the
				// chat row so the next turn can resume the same context.
				if (result.sessionId && result.sessionId !== chat.claudeSessionId) {
					db.updateChat(chatId, {
						claudeSessionId: result.sessionId,
						updatedAt: new Date().toISOString(),
					});
				} else {
					db.updateChat(chatId, { updatedAt: new Date().toISOString() });
				}
			} catch (err) {
				const raw = (err as Error).message ?? 'Unknown error';
				const msg = /Request too large \(max 20MB\)/i.test(raw)
					? `${raw} The selected PDF is too large to attach in one request.`
					: raw;
				emit({ type: 'error', error: msg });
				const now = new Date().toISOString();
				try {
					db.addChatMessage({
						id: crypto.randomUUID(),
						chatId,
						role: 'assistant',
						content: `Error: ${msg}`,
						parts: [{ type: 'text', text: `_Error: ${msg}_` }],
						createdAt: now,
					});
					db.updateChat(chatId, { updatedAt: now });
				} catch {
					// best-effort persistence for stream errors
				}
			} finally {
				try {
					controller.close();
				} catch {
					// already closed
				}
			}
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
