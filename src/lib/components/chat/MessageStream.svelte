<script lang="ts">
	import type { ChatMessage } from '$lib/types';
	import { tick } from 'svelte';
	import MessageBubble from './MessageBubble.svelte';
	import ReasoningBlock from './ReasoningBlock.svelte';
	import ToolCallCard from './ToolCallCard.svelte';
	import { marked } from 'marked';

	export type LiveTool = {
		id: string;
		name: string;
		input: string;
		isLocal: boolean;
		result?: string | null;
		isError?: boolean;
		done?: boolean;
	};

	let {
		messages,
		isStreaming = false,
		streamingText = '',
		liveThinkingBlocks = [],
		liveThinkingCurrent = '',
		liveTools = [],
		compact = false,
	}: {
		messages: ChatMessage[];
		isStreaming?: boolean;
		streamingText?: string;
		liveThinkingBlocks?: string[];
		liveThinkingCurrent?: string;
		liveTools?: LiveTool[];
		compact?: boolean;
	} = $props();

	let container: HTMLDivElement;

	async function scrollToBottom() {
		await tick();
		if (container) container.scrollTop = container.scrollHeight;
	}

	$effect(() => {
		messages.length;
		streamingText;
		liveThinkingCurrent;
		liveTools.length;
		scrollToBottom();
	});

	function renderMarkdown(text: string): string {
		return marked.parse(text, { async: false }) as string;
	}

	// Visible (non tool-result) messages, paired with their index for hairline rules
	const visible = $derived(
		messages.filter(
			(m) => !(m.role === 'user' && (m.parts ?? []).every((p) => p.type === 'tool_result'))
		)
	);
</script>

<div class="stream" class:compact bind:this={container}>
	<div class="column">
		{#each visible as msg, i (msg.id)}
			{#if i > 0 && msg.role === 'user'}
				<hr class="rule" aria-hidden="true" />
			{/if}
			<MessageBubble message={msg} />
		{/each}

		{#if isStreaming}
			<article class="entry assistant in-flight">
				<div class="content">
					{#each liveThinkingBlocks as block, i (i)}
						<ReasoningBlock text={block} />
					{/each}
					{#if liveThinkingCurrent}
						<ReasoningBlock text={liveThinkingCurrent} live />
					{/if}
					{#each liveTools as tool (tool.id)}
						<ToolCallCard
							tool={tool.name}
							input={tool.input}
							result={tool.result ?? null}
							isError={tool.isError ?? false}
							streaming={!tool.done}
						/>
					{/each}
					{#if streamingText}
						<div class="prose">{@html renderMarkdown(streamingText)}</div>
					{:else if liveThinkingBlocks.length === 0 && !liveThinkingCurrent && liveTools.length === 0}
						<div class="awaiting">
							<span class="cursor"></span>
						</div>
					{/if}
				</div>
			</article>
		{/if}
	</div>
</div>

<style>
	.stream {
		flex: 1;
		overflow-y: auto;
		padding: var(--sp-10) var(--sp-8) var(--sp-12);
	}

	.stream.compact {
		padding: var(--sp-5) var(--sp-4) var(--sp-6);
	}

	.column {
		max-width: 720px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-8);
	}

	.compact .column {
		gap: var(--sp-6);
		max-width: none;
	}

	/* Hairline separator between exchanges — like a section rule in a journal.
	   Centered on the column with decorative tapers at each end. */
	.rule {
		border: none;
		height: 1px;
		margin: var(--sp-4) 0;
		background: linear-gradient(
			to right,
			transparent 0%,
			var(--border) 20%,
			var(--border) 80%,
			transparent 100%
		);
		position: relative;
	}

	.rule::after {
		content: '§';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--bg-base);
		padding: 0 var(--sp-3);
		font-family: var(--font-display);
		font-style: italic;
		color: var(--text-tertiary);
		font-size: 0.85rem;
		line-height: 1;
	}

	/* In-flight assistant article uses the same shape as committed bubbles */
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
	}

	.prose :global(a) {
		color: var(--text-primary);
		text-decoration: none;
		background-image: linear-gradient(var(--accent), var(--accent));
		background-position: 0 100%;
		background-repeat: no-repeat;
		background-size: 100% 1px;
		padding-bottom: 1px;
	}

	/* Awaiting indicator: a single blinking caret rather than bouncing dots.
	   Editorial restraint — feels like a typesetter's cursor. */
	.awaiting {
		display: flex;
		align-items: center;
		min-height: 1.4rem;
	}

	.cursor {
		display: inline-block;
		width: 8px;
		height: 1.1rem;
		background: var(--accent);
		animation: blink 1.05s steps(2, jump-none) infinite;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		50.01%,
		100% {
			opacity: 0;
		}
	}

	@media (max-width: 768px) {
		.stream {
			padding: var(--sp-5) var(--sp-4) var(--sp-8);
		}

		.column {
			gap: var(--sp-6);
		}

		.entry.assistant .content {
			max-width: none;
		}

		.prose {
			font-size: 1.02rem;
		}
	}
</style>
