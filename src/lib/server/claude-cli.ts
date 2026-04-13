import { spawn } from 'child_process';
import type { ChatMessagePart } from '$lib/types';
import type { ChatEvent } from './anthropic';
import { displayToolName } from './chat-tools';
import { composeChatSystemPrompt } from './chat-system-prompt';

interface RawBlock {
	type: string;
	name?: string;
	id?: string;
	thinking?: string;
	input?: unknown;
	text?: string;
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

interface AssistantMessageShape {
	content?: RawBlock[];
}

interface UserToolResultShape {
	type: string;
	tool_use_id?: string;
	content?: unknown;
	is_error?: boolean;
}

export interface CliChatTurnInput {
	userPrompt: string;
	resumeSessionId?: string | null;
	additionalSystemContext?: string;
	emit: (event: ChatEvent) => void;
	signal?: AbortSignal;
}

export interface CliChatTurnResult {
	assistantBlocks: ChatMessagePart[];
	sessionId: string | null;
	text: string;
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

function blocksToParts(blocks: RawBlock[]): ChatMessagePart[] {
	const out: ChatMessagePart[] = [];
	for (const b of blocks) {
		if (b.type === 'text' && typeof b.text === 'string') {
			out.push({ type: 'text', text: b.text });
		} else if (b.type === 'thinking' && typeof b.thinking === 'string') {
			out.push({ type: 'thinking', thinking: b.thinking });
		} else if ((b.type === 'tool_use' || b.type === 'server_tool_use') && b.id && b.name) {
			out.push({
				type: 'tool_use',
				id: b.id,
				name: displayToolName(b.name),
				input: b.input ?? {},
			});
		}
	}
	return out;
}

function toolResultToText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return (content as Array<{ type: string; text?: string }>)
			.filter((c) => c.type === 'text' && typeof c.text === 'string')
			.map((c) => c.text!)
			.join('');
	}
	return JSON.stringify(content);
}

export async function runCliChatTurn({
	userPrompt,
	resumeSessionId,
	additionalSystemContext,
	emit,
	signal,
}: CliChatTurnInput): Promise<CliChatTurnResult> {
	const args = [
		'-p',
		'--output-format',
		'stream-json',
		'--verbose',
		'--include-partial-messages',
		'--permission-mode',
		'bypassPermissions',
		'--tools',
		'Read,WebSearch,WebFetch',
		'--strict-mcp-config',
		'--system-prompt',
		composeChatSystemPrompt(additionalSystemContext),
	];

	if (resumeSessionId) {
		args.push('--resume', resumeSessionId);
	}

	const child = spawn('claude', args, {
		env: { ...process.env },
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	const blockMeta = new Map<number, { type: string; name?: string }>();
	const assistantBlocks: ChatMessagePart[] = [];
	let lastFinalText = '';
	let sessionId: string | null = resumeSessionId ?? null;
	let stderr = '';
	let buffer = '';
	let sawResult = false;
	let aborted = false;
	let finished = false;

	const abortHandler = () => {
		if (finished) return;
		aborted = true;
		try {
			child.kill('SIGTERM');
		} catch {
			// ignore
		}
	};

	if (signal) {
		if (signal.aborted) abortHandler();
		else signal.addEventListener('abort', abortHandler, { once: true });
	}

	function processLine(line: string) {
		if (!line.trim()) return;
		let msg: any;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}

		if (msg.session_id && typeof msg.session_id === 'string') {
			sessionId = msg.session_id;
		}

		switch (msg.type) {
			case 'stream_event': {
				handleStreamEvent(msg.event as RawStreamEvent, blockMeta, emit);
				break;
			}
			case 'assistant': {
				const content = (msg.message as AssistantMessageShape)?.content ?? [];
				assistantBlocks.push(...blocksToParts(content));
				lastFinalText = content
					.filter((b): b is RawBlock & { type: 'text'; text: string } =>
						b.type === 'text' && typeof b.text === 'string'
					)
					.map((b) => b.text)
					.join('');
				break;
			}
			case 'user': {
				const content = (msg.message as { content?: unknown })?.content;
				if (!Array.isArray(content)) break;
				for (const block of content as UserToolResultShape[]) {
					if (block.type === 'tool_result' && block.tool_use_id) {
						emit({
							type: 'tool_result',
							toolUseId: block.tool_use_id,
							output: toolResultToText(block.content),
							isError: block.is_error ?? false,
						});
					}
				}
				break;
			}
			case 'result': {
				sawResult = true;
				if (msg.subtype !== 'success') {
					const err = Array.isArray(msg.errors) && msg.errors.length > 0
						? msg.errors.join('; ')
						: msg.subtype || 'Claude CLI run failed';
					emit({ type: 'error', error: err });
				}
				if (typeof msg.result === 'string' && msg.result.trim()) {
					lastFinalText = msg.result;
				}
				break;
			}
		}
	}

	try {
		child.stdout.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';
			for (const line of lines) processLine(line);
		});

		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.stdin.write(userPrompt);
		child.stdin.end();

		await new Promise<void>((resolve, reject) => {
			child.on('error', reject);
			child.on('close', (code) => {
				finished = true;
				if (buffer.trim()) processLine(buffer);

				if (signal) {
					signal.removeEventListener('abort', abortHandler);
				}

				if (aborted) {
					emit({ type: 'error', error: 'Stream aborted' });
					resolve();
					return;
				}

				if (code !== 0 && !sawResult) {
					reject(new Error(stderr.trim() || `claude exited with code ${code}`));
					return;
				}

				resolve();
			});
		});
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
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
