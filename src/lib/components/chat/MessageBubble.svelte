<script lang="ts">
	import type { ChatMessage, ChatMessagePart } from '$lib/types';
	import { marked } from 'marked';
	import ReasoningBlock from './ReasoningBlock.svelte';
	import ToolCallCard from './ToolCallCard.svelte';

	let { message }: { message: ChatMessage } = $props();

	const parts = $derived<ChatMessagePart[]>(
		message.parts && message.parts.length > 0
			? message.parts
			: [{ type: 'text', text: message.content }]
	);

	// A user message whose parts are ALL tool_result blocks is an intermediate
	// agent-loop turn — the chat page filters those out, but defend in depth.
	const isOnlyToolResults = $derived(
		message.role === 'user' && parts.every((p) => p.type === 'tool_result')
	);

	const isUser = $derived(message.role === 'user');

	function renderMarkdown(text: string): string {
		return marked.parse(text, { async: false }) as string;
	}

	// Build a tool_use_id → result map so tool_use blocks can render with their result.
	const resultsById = $derived.by(() => {
		const map = new Map<string, { content: string; isError: boolean }>();
		for (const p of parts) {
			if (p.type === 'tool_result') {
				map.set(p.tool_use_id, { content: p.content, isError: p.is_error ?? false });
			}
		}
		return map;
	});
</script>

{#if !isOnlyToolResults}
	<article class="entry" class:user={isUser} class:assistant={!isUser}>
		<div class="content">
			{#each parts as part, i (i)}
				{#if part.type === 'text' && part.text.trim()}
					{#if isUser}
						<p class="prompt-text">{part.text}</p>
					{:else}
						<div class="prose">{@html renderMarkdown(part.text)}</div>
					{/if}
				{:else if part.type === 'thinking'}
					<ReasoningBlock text={part.thinking} />
				{:else if part.type === 'tool_use'}
					{@const result = resultsById.get(part.id)}
					<ToolCallCard
						tool={part.name}
						input={part.input}
						result={result?.content ?? null}
						isError={result?.isError ?? false}
					/>
				{:else if part.type === 'document' && isUser}
					<div class="doc-chip">
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14 2 14 8 20 8" />
						</svg>
						<em>{part.title ?? 'Document'}</em>
					</div>
				{/if}
			{/each}
		</div>
	</article>
{/if}

<style>
	.entry {
		animation: rise 480ms var(--ease-out) both;
	}

	/* ── User prompt: italic serif, marginal, accent rule on the left ── */
	.entry.user {
		padding-left: var(--sp-5);
		border-left: 2px solid var(--accent);
		max-width: 56ch;
		color: var(--text-secondary);
	}

	.prompt-text {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		line-height: 1.55;
		font-feature-settings: 'liga' on, 'dlig' on;
		white-space: pre-wrap;
		color: var(--text-secondary);
	}

	.entry.user .doc-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--sp-2);
		padding: 3px var(--sp-2);
		font-family: var(--font-display);
		font-size: 0.78rem;
		color: var(--text-tertiary);
		border-bottom: 1px dotted var(--accent);
	}

	.entry.user .doc-chip svg {
		color: var(--accent);
		flex-shrink: 0;
	}

	/* ── Assistant response: Crimson Pro prose, full column, no chrome ── */
	.entry.assistant .content {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		max-width: 68ch;
	}

	.prose {
		font-family: var(--font-display);
		font-size: 1.08rem;
		line-height: 1.7;
		color: var(--text-primary);
		font-feature-settings: 'liga' on, 'dlig' on, 'onum' on;
	}

	.prose :global(p) {
		margin: 0 0 0.85em;
	}

	.prose :global(p:last-child) {
		margin-bottom: 0;
	}

	/* The opening line of an assistant response gets a touch more weight,
	   echoing the way essays open with a slightly heavier first sentence. */
	.prose :global(p:first-child::first-line) {
		font-weight: 500;
	}

	.prose :global(h1),
	.prose :global(h2),
	.prose :global(h3) {
		font-family: var(--font-display);
		font-weight: 500;
		letter-spacing: -0.012em;
		margin: 1.1em 0 0.4em;
		color: var(--text-primary);
	}

	.prose :global(h1) {
		font-size: 1.4rem;
	}

	.prose :global(h2) {
		font-size: 1.22rem;
	}

	.prose :global(h3) {
		font-size: 1.08rem;
		font-style: italic;
	}

	.prose :global(em) {
		font-style: italic;
		color: var(--text-primary);
	}

	.prose :global(strong) {
		font-weight: 600;
		color: var(--text-primary);
	}

	.prose :global(a) {
		color: var(--text-primary);
		text-decoration: none;
		background-image: linear-gradient(var(--accent), var(--accent));
		background-position: 0 100%;
		background-repeat: no-repeat;
		background-size: 100% 1px;
		padding-bottom: 1px;
		transition: background-size var(--duration-fast) var(--ease-out);
	}

	.prose :global(a:hover) {
		background-size: 100% 2px;
	}

	.prose :global(ul),
	.prose :global(ol) {
		margin: 0.6em 0 0.9em;
		padding-left: 1.4em;
	}

	.prose :global(li) {
		margin: 0.25em 0;
	}

	.prose :global(blockquote) {
		border-left: 2px solid var(--accent);
		padding: 0.1em 0 0.1em var(--sp-4);
		margin: 0.7em 0;
		color: var(--text-secondary);
		font-style: italic;
	}

	/* Code stays in mono so the editorial voice doesn't fight technical content */
	.prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.82em;
		background: var(--bg-raised);
		padding: 1px 5px;
		border-radius: 3px;
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		font-feature-settings: normal;
	}

	.prose :global(pre) {
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-sm);
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.55;
		margin: 0.85em 0;
		font-feature-settings: normal;
	}

	.prose :global(pre code) {
		background: none;
		padding: 0;
		border: none;
		color: var(--text-primary);
	}

	.prose :global(table) {
		border-collapse: collapse;
		margin: 0.85em 0;
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	.prose :global(th),
	.prose :global(td) {
		border-bottom: 1px solid var(--border);
		padding: var(--sp-2) var(--sp-3);
		text-align: left;
	}

	.prose :global(th) {
		font-weight: 600;
		font-family: var(--font-display);
		font-style: italic;
		color: var(--text-secondary);
		font-size: 0.85rem;
		text-transform: lowercase;
		letter-spacing: 0.02em;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.entry.user {
			padding-left: var(--sp-4);
			max-width: none;
		}

		.entry.assistant .content {
			max-width: none;
		}

		.prose {
			font-size: 1.02rem;
		}
	}
</style>
