import type { Chat, ChatMessage, ChatMessagePart } from '$lib/types';
import { db } from '$lib/server/db';
import { PDF_DIR } from '$lib/server/pdf-storage';
import { runChatTurn, type ChatEvent } from '$lib/server/anthropic';
import { runCliChatTurn } from '$lib/server/claude-cli';
import { ensureCompressedPdf } from '$lib/server/pdf-compression';
import type { RequestHandler } from './$types';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const MAX_ATTACHABLE_PDF_BYTES = 14 * 1024 * 1024;

function mb(bytes: number): string {
	return (bytes / (1024 * 1024)).toFixed(1);
}

function buildCliPrompt(message: string, paperContexts: string[], fallbackContexts: string[]): string {
	const sections: string[] = [];
	if (paperContexts.length > 0) {
		sections.push([
			'Selected papers for this turn (metadata + local PDF path).',
			'If you need the PDF content, use the Read tool on the local path.',
			...paperContexts.map((ctx, i) => `Paper ${i + 1}:\n${ctx}`),
		].join('\n\n'));
	}
	if (fallbackContexts.length > 0) {
		sections.push([
			'Attachment/compression status for selected papers:',
			...fallbackContexts.map((ctx, i) => `Status ${i + 1}:\n${ctx}`),
		].join('\n\n'));
	}
	sections.push(`User message:\n${message}`);
	return sections.join('\n\n');
}

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

	// Build this turn's attachment/context state before opening the model stream.
	const attachablePdfs: Array<{ title: string; pdfPath: string; compressed: boolean }> = [];
	const cliPaperContexts: string[] = [];
	const fallbackPaperContexts: string[] = [];
	const cliSwitchReasons: string[] = [];
	let usedCompressedPdf = false;
	let useCliMode = chat.chatEngine === 'cli';

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

		const pdfFullPath = path.join(PDF_DIR, `${paper.arxivId || paper.id}.pdf`);
		const cliContext = [...contextLines, `Local PDF path: ${pdfFullPath}`].join('\n');
		cliPaperContexts.push(cliContext);

		try {
			if (!fs.existsSync(pdfFullPath)) {
				fallbackPaperContexts.push(
					`Attachment status: Missing local PDF at ${pdfFullPath}\n${contextLines.join('\n')}`
				);
				continue;
			}

			// Once a chat is on persistent CLI mode, stop trying to inline PDFs.
			if (useCliMode) continue;

			const originalSize = fs.statSync(pdfFullPath).size;
			if (originalSize <= MAX_ATTACHABLE_PDF_BYTES) {
				attachablePdfs.push({ title: paper.title, pdfPath: pdfFullPath, compressed: false });
				continue;
			}

			const compressed = await ensureCompressedPdf(pdfFullPath);
			if (compressed.ok && compressed.sizeBytes !== null && compressed.sizeBytes <= MAX_ATTACHABLE_PDF_BYTES) {
				usedCompressedPdf = true;
				attachablePdfs.push({
					title: paper.title,
					pdfPath: compressed.outputPath,
					compressed: true,
				});
				continue;
			}

			useCliMode = true;
			const limitText = `${mb(MAX_ATTACHABLE_PDF_BYTES)} MB`;
			if (compressed.ok && compressed.sizeBytes !== null) {
				const reason = `${paper.title}: compressed PDF still too large (${mb(compressed.sizeBytes)} MB > ${limitText})`;
				cliSwitchReasons.push(reason);
				fallbackPaperContexts.push(
					`Attachment status: Original PDF ${mb(originalSize)} MB; compressed PDF still too large at ${mb(compressed.sizeBytes)} MB (cap ${limitText})\n${contextLines.join('\n')}`
				);
			} else {
				const reason = `${paper.title}: Ghostscript compression failed (${compressed.reason ?? 'unknown error'})`;
				cliSwitchReasons.push(reason);
				fallbackPaperContexts.push(
					`Attachment status: Original PDF ${mb(originalSize)} MB; Ghostscript compression failed (${compressed.reason ?? 'unknown error'})\n${contextLines.join('\n')}`
				);
			}
		} catch {
			fallbackPaperContexts.push(
				`Attachment status: Failed to read local PDF bytes\n${contextLines.join('\n')}`
			);
		}
	}

	// Build user message blocks. SDK mode can carry inline PDF document blocks;
	// CLI mode uses text-only prompting with local path references.
	const userBlocks: ChatMessagePart[] = [];
	if (!useCliMode) {
		for (const att of attachablePdfs) {
			try {
				const pdfBytes = fs.readFileSync(att.pdfPath);
				userBlocks.push({
					type: 'document',
					source: {
						type: 'base64',
						media_type: 'application/pdf',
						data: pdfBytes.toString('base64'),
					},
					title: att.title,
				});
				if (att.compressed) usedCompressedPdf = true;
			} catch {
				fallbackPaperContexts.push(
					`Attachment status: Failed to read local PDF bytes at ${att.pdfPath}\nTitle: ${att.title}`
				);
			}
		}
	}
	userBlocks.push({ type: 'text', text: message });

	const systemNotes: string[] = [];
	const switchedToCliThisTurn = useCliMode && chat.chatEngine !== 'cli';

	if (usedCompressedPdf && !useCliMode) {
		systemNotes.push(
			'One or more selected PDFs were auto-compressed with Ghostscript to `.sm.pdf` before attaching. Briefly disclose this once, then continue normally.'
		);
	}

	if (switchedToCliThisTurn) {
		systemNotes.push(
			'This chat turn is running through Claude Code CLI because at least one selected PDF exceeded inline attachment limits even after Ghostscript compression. Briefly disclose this once, then continue.'
		);
		if (cliSwitchReasons.length > 0) {
			systemNotes.push([
				'Switch reasons:',
				...cliSwitchReasons.map((r, i) => `${i + 1}. ${r}`),
			].join('\n'));
		}
	}

	if (fallbackPaperContexts.length > 0) {
		systemNotes.push(
			[
				'One or more selected paper PDFs could not be attached for this turn.',
				'Continue using the fallback paper metadata below and available tools.',
				...fallbackPaperContexts.map((ctx, i) => `Fallback paper context ${i + 1}:\n${ctx}`),
			].join('\n\n')
		);
	}

	const additionalSystemContext = systemNotes.length > 0 ? systemNotes.join('\n\n') : undefined;
	const cliPrompt = buildCliPrompt(message, cliPaperContexts, fallbackPaperContexts);

	// Persist the user message immediately so it survives stream interruption.
	const now = new Date().toISOString();
	const userMsg: ChatMessage = {
		id: crypto.randomUUID(),
		chatId,
		role: 'user',
		content: message,
		parts: userBlocks,
		createdAt: now,
	};
	db.addChatMessage(userMsg);
	if (useCliMode) {
		db.updateChat(chatId, { chatEngine: 'cli', updatedAt: now });
	} else {
		db.updateChat(chatId, { updatedAt: now });
	}

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
				let turnUsesCli = useCliMode;
				let result: Awaited<ReturnType<typeof runChatTurn>>;
				try {
					result = turnUsesCli
						? await runCliChatTurn({
								userPrompt: cliPrompt,
								resumeSessionId: chat.claudeSessionId,
								additionalSystemContext,
								emit,
								signal: request.signal,
						  })
						: await runChatTurn({
								userMessageContent: userBlocks,
								resumeSessionId: chat.claudeSessionId,
								additionalSystemContext,
								emit,
								signal: request.signal,
						  });
				} catch (primaryErr) {
					const raw = (primaryErr as Error).message ?? 'Unknown error';
					if (!turnUsesCli && /Request too large \(max 20MB\)/i.test(raw)) {
						turnUsesCli = true;
						const runtimeFallbackContext = [
							additionalSystemContext,
							'This turn exceeded the provider request-size cap after inline attachments were prepared.',
							'Continue in Claude Code CLI mode, and briefly disclose that the chat switched modes due attachment size.',
						].filter(Boolean).join('\n\n');
						result = await runCliChatTurn({
							userPrompt: cliPrompt,
							resumeSessionId: chat.claudeSessionId,
							additionalSystemContext: runtimeFallbackContext,
							emit,
							signal: request.signal,
						});
					} else {
						throw primaryErr;
					}
				}

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
				const updateData: Partial<Chat> = {
					updatedAt: new Date().toISOString(),
				};
				if (turnUsesCli) {
					updateData.chatEngine = 'cli';
				}
				if (result.sessionId && result.sessionId !== chat.claudeSessionId) {
					updateData.claudeSessionId = result.sessionId;
				}
				db.updateChat(chatId, updateData);
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
