import {
	query,
	type Options,
	type SDKMessage,
	type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ChatMessagePart } from '$lib/types';
import { reosMcpServer, displayToolName } from './chat-tools';

/**
 * Server-side wrapper around the Claude Agent SDK for the chat surface.
 *
 * The Agent SDK runs Claude Code under the hood and authenticates against
 * the user's Claude Max subscription via `claude login` (no API key needed).
 * Re:OS-native tools are exposed via an in-process MCP server defined in
 * `chat-tools.ts`; web search and web fetch are enabled as built-in tools.
 *
 * `runChatTurn` opens a `query()` for one user message, streams partial
 * assistant events back to the frontend in the existing SSE wire format,
 * and returns the captured assistant content blocks plus the session id so
 * the endpoint can persist them and resume the same Claude Code session on
 * the next turn.
 */

const MODEL = 'claude-opus-4-6';

const SYSTEM_PROMPT = `You are the Re:OS research assistant — an AI partner for an academic researcher who organizes papers into "threads" (ongoing investigations).

You have direct, read-only access to the user's local paper library, threads, annotations, and notes through the Re:OS tools (search_papers, get_paper, list_threads, get_thread, list_annotations, list_notes). When the user asks anything about their library, prefer calling these tools over guessing. The user may also attach a paper PDF directly to the conversation; when they do, read it carefully before answering.

You can also search and fetch the public web with WebSearch and WebFetch — use these for new papers, recent results, or context outside the user's library.

Style:
- Be concrete and concise. Researchers value precision over hedging.
- When you cite a paper from the library, include its title and arxivId so the user can navigate to it.
- When you cite the web, use markdown links.
- Use math notation in $...$ / $$...$$ when it helps.
- If a question is genuinely ambiguous, ask one short clarifying question instead of guessing.`;

export type ChatEvent =
	| { type: 'text'; text: string }
	| { type: 'thinking_delta'; text: string }
	| { type: 'thinking_done' }
	| { type: 'tool_start'; tool: string; id: string }
	| { type: 'tool_input_delta'; text: string }
	| { type: 'tool_stop' }
	| { type: 'tool_result'; toolUseId: string; output: string; isError?: boolean }
	| { type: 'done'; fullText: string }
	| { type: 'error'; error: string };

export interface ChatTurnInput {
	/** Content blocks for the new user turn (text + optional document blocks). */
	userMessageContent: ChatMessagePart[];
	/** Existing Claude Code session id to resume, if any. */
	resumeSessionId?: string | null;
	/** Optional per-turn context appended to the system prompt. */
	additionalSystemContext?: string;
	emit: (event: ChatEvent) => void;
	signal?: AbortSignal;
}

export interface ChatTurnResult {
	/** All assistant content blocks produced in this turn (across loop iterations). */
	assistantBlocks: ChatMessagePart[];
	/** Session id of the underlying Claude Code session — persist for resume. */
	sessionId: string | null;
	/** Concatenated text of the final assistant turn (for the legacy `content` column). */
	text: string;
}

// --- Stream-event mapping ---
//
// `includePartialMessages: true` makes the SDK emit `stream_event` SDK
// messages whose `event` field is the raw Anthropic content-block stream
// event. We handle the same shape we used to handle when calling the
// Messages API directly. Types are intentionally loose here — the SDK
// re-exports them as `BetaRawMessageStreamEvent` from a transitive dep,
// and we only inspect a small subset.

interface RawBlock {
	type: string;
	name?: string;
	id?: string;
	thinking?: string;
}

interface RawDelta {
	type: string;
	text?: string;
	thinking?: string;
	partial_json?: string;
}

interface RawStreamEvent {
	type: string;
	index?: number;
	content_block?: RawBlock;
	delta?: RawDelta;
}

function handleStreamEvent(
	event: RawStreamEvent,
	blockMeta: Map<number, { type: string; name?: string }>,
	emit: (e: ChatEvent) => void
) {
	const idx = event.index ?? 0;
	switch (event.type) {
		case 'content_block_start': {
			const block = event.content_block;
			if (!block) break;
			blockMeta.set(idx, { type: block.type, name: block.name });
			if ((block.type === 'tool_use' || block.type === 'server_tool_use') && block.id) {
				emit({
					type: 'tool_start',
					tool: displayToolName(block.name ?? 'tool'),
					id: block.id,
				});
			}
			if (block.type === 'thinking' && block.thinking) {
				emit({ type: 'thinking_delta', text: block.thinking });
			}
			break;
		}
		case 'content_block_delta': {
			const meta = blockMeta.get(idx);
			const delta = event.delta;
			if (!delta) break;
			if (delta.type === 'text_delta' && delta.text) {
				emit({ type: 'text', text: delta.text });
			} else if (delta.type === 'thinking_delta' && delta.thinking) {
				emit({ type: 'thinking_delta', text: delta.thinking });
			} else if (
				delta.type === 'input_json_delta' &&
				delta.partial_json !== undefined &&
				meta &&
				(meta.type === 'tool_use' || meta.type === 'server_tool_use')
			) {
				emit({ type: 'tool_input_delta', text: delta.partial_json });
			}
			break;
		}
		case 'content_block_stop': {
			const meta = blockMeta.get(idx);
			if (!meta) break;
			if (meta.type === 'thinking') {
				emit({ type: 'thinking_done' });
			} else if (meta.type === 'tool_use' || meta.type === 'server_tool_use') {
				emit({ type: 'tool_stop' });
			}
			break;
		}
	}
}

// --- Persisted-block extraction from a full assistant message ---

interface AssistantContentBlock {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	input?: unknown;
}

function blocksToParts(blocks: AssistantContentBlock[]): ChatMessagePart[] {
	const out: ChatMessagePart[] = [];
	for (const b of blocks) {
		if (b.type === 'text' && typeof b.text === 'string') {
			out.push({ type: 'text', text: b.text });
		} else if (b.type === 'thinking' && typeof b.thinking === 'string') {
			out.push({ type: 'thinking', thinking: b.thinking });
		} else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
			if (b.id && b.name) {
				out.push({
					type: 'tool_use',
					id: b.id,
					name: displayToolName(b.name),
					input: b.input ?? {},
				});
			}
		}
		// We deliberately drop tool_result, web_search_tool_result, and other
		// internal blocks — the chat UI doesn't render them, and the model's
		// own session storage holds the canonical history for resume.
	}
	return out;
}

// --- Main entry ---

export async function runChatTurn({
	userMessageContent,
	resumeSessionId,
	additionalSystemContext,
	emit,
	signal,
}: ChatTurnInput): Promise<ChatTurnResult> {
	// Build the streaming input: a single user message with text + any
	// document blocks. The Agent SDK consumes this as an AsyncIterable so
	// we can mix content types and (in the future) push follow-up turns.
	async function* inputStream(): AsyncGenerator<SDKUserMessage> {
		yield {
			type: 'user',
			message: {
				role: 'user',
				content: userMessageContent,
			} as unknown as SDKUserMessage['message'],
			parent_tool_use_id: null,
		};
	}

	// Wire the caller's AbortSignal through to the SDK. The SDK takes its
	// own AbortController; we forward aborts.
	const abortController = new AbortController();
	if (signal) {
		if (signal.aborted) abortController.abort();
		else signal.addEventListener('abort', () => abortController.abort(), { once: true });
	}

	const options: Options = {
		systemPrompt: additionalSystemContext
			? `${SYSTEM_PROMPT}\n\n${additionalSystemContext}`
			: SYSTEM_PROMPT,
		model: MODEL,
		thinking: { type: 'adaptive' },
		// Built-in tools we want enabled. Everything else (Bash, Edit, Write,
		// Read, Glob, Grep, …) is excluded — the model only gets Re:OS tools
		// + web access.
		tools: ['WebSearch', 'WebFetch'],
		mcpServers: { reos: reosMcpServer },
		// Don't load the user's `~/.claude/settings.json` or any project-level
		// settings — this server is its own isolated SDK consumer.
		settingSources: [],
		// Bypass permission prompts: the only tools available are read-only
		// Re:OS data accessors and Anthropic's hosted web tools, both of
		// which are safe to auto-allow in this trusted single-user app.
		permissionMode: 'bypassPermissions',
		allowDangerouslySkipPermissions: true,
		// Stream raw content-block events so we can drive the chat UI's
		// thinking + tool-call indicators in real time.
		includePartialMessages: true,
		abortController,
	};

	if (resumeSessionId) {
		options.resume = resumeSessionId;
	}

	const q = query({ prompt: inputStream(), options });

	const blockMeta = new Map<number, { type: string; name?: string }>();
	const assistantBlocks: ChatMessagePart[] = [];
	let lastFinalText = '';
	let sessionId: string | null = resumeSessionId ?? null;

	try {
		for await (const msg of q as AsyncGenerator<SDKMessage, void>) {
			if (msg.session_id) sessionId = msg.session_id;

			switch (msg.type) {
				case 'stream_event': {
					handleStreamEvent(msg.event as unknown as RawStreamEvent, blockMeta, emit);
					break;
				}
				case 'assistant': {
					// Capture full assistant content for persistence and emit a
					// `tool_result` event for any tool_result blocks (which the
					// raw stream events don't surface for MCP tools).
					const content = (msg.message as { content?: AssistantContentBlock[] }).content ?? [];
					assistantBlocks.push(...blocksToParts(content));
					lastFinalText = content
						.filter((b): b is AssistantContentBlock & { type: 'text'; text: string } =>
							b.type === 'text' && typeof b.text === 'string'
						)
						.map((b) => b.text)
						.join('');
					break;
				}
				case 'user': {
					// User-role messages mid-loop are tool_result echoes from
					// MCP/built-in tools. Surface them so the UI can show
					// completed tool cards with their output.
					const content = (msg.message as { content?: unknown }).content;
					if (Array.isArray(content)) {
						for (const block of content as Array<{
							type: string;
							tool_use_id?: string;
							content?: unknown;
							is_error?: boolean;
						}>) {
							if (block.type === 'tool_result' && block.tool_use_id) {
								let outputText = '';
								if (typeof block.content === 'string') {
									outputText = block.content;
								} else if (Array.isArray(block.content)) {
									outputText = (block.content as Array<{ type: string; text?: string }>)
										.filter((c) => c.type === 'text' && typeof c.text === 'string')
										.map((c) => c.text!)
										.join('');
								} else {
									outputText = JSON.stringify(block.content);
								}
								emit({
									type: 'tool_result',
									toolUseId: block.tool_use_id,
									output: outputText,
									isError: block.is_error ?? false,
								});
							}
						}
					}
					break;
				}
				case 'result': {
					if (msg.subtype !== 'success') {
						const err =
							'errors' in msg && Array.isArray(msg.errors) && msg.errors.length > 0
								? msg.errors.join('; ')
								: msg.subtype;
						emit({ type: 'error', error: err });
					}
					// `result` is the terminal message — break the loop.
					break;
				}
			}
		}
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			// Caller aborted; surface the last partial state via `error` and exit.
			emit({ type: 'error', error: 'Stream aborted' });
		} else {
			throw err;
		}
	}

	emit({ type: 'done', fullText: lastFinalText });

	return {
		assistantBlocks,
		sessionId,
		text: lastFinalText,
	};
}
