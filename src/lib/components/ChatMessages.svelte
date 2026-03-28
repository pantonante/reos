<script lang="ts">
	import type { ChatMessage } from '$lib/types';
	import { marked } from 'marked';
	import { tick } from 'svelte';

	let {
		messages,
		isStreaming = false,
		streamingContent = '',
	}: {
		messages: ChatMessage[];
		isStreaming?: boolean;
		streamingContent?: string;
	} = $props();

	let container: HTMLDivElement;

	async function scrollToBottom() {
		await tick();
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	}

	// Auto-scroll when messages change or streaming content updates
	$effect(() => {
		messages.length;
		streamingContent;
		scrollToBottom();
	});

	function renderMarkdown(text: string): string {
		return marked.parse(text, { async: false }) as string;
	}
</script>

<div class="chat-messages" bind:this={container}>
	{#if messages.length === 0 && !isStreaming}
		<div class="empty-state">
			<p>Start a conversation</p>
		</div>
	{/if}

	{#each messages as msg (msg.id)}
		<div class="message {msg.role}">
			<div class="message-label">{msg.role === 'user' ? 'You' : 'Claude'}</div>
			{#if msg.role === 'assistant'}
				<div class="message-content markdown">{@html renderMarkdown(msg.content)}</div>
			{:else}
				<div class="message-content">{msg.content}</div>
			{/if}
		</div>
	{/each}

	{#if isStreaming && streamingContent}
		<div class="message assistant">
			<div class="message-label">Claude</div>
			<div class="message-content markdown">{@html renderMarkdown(streamingContent)}</div>
		</div>
	{:else if isStreaming}
		<div class="message assistant">
			<div class="message-label">Claude</div>
			<div class="message-content typing">
				<span class="dot"></span><span class="dot"></span><span class="dot"></span>
			</div>
		</div>
	{/if}
</div>

<style>
	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
		font-family: var(--font-display);
		font-size: 1.1rem;
	}

	.message {
		max-width: 80%;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.message.user {
		align-self: flex-end;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-1);
		padding: 0 var(--sp-2);
	}

	.message.user .message-label {
		text-align: right;
	}

	.message-content {
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.message.user .message-content {
		background: var(--accent-muted);
		color: var(--text-primary);
		border: 1px solid var(--accent);
		border-bottom-right-radius: var(--sp-1);
		white-space: pre-wrap;
	}

	.message.assistant .message-content {
		background: var(--bg-surface);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-bottom-left-radius: var(--sp-1);
	}

	/* Markdown content styling */
	.markdown :global(p) {
		margin: 0 0 0.5em;
	}

	.markdown :global(p:last-child) {
		margin-bottom: 0;
	}

	.markdown :global(pre) {
		background: var(--bg-base);
		padding: var(--sp-3);
		border-radius: var(--radius-sm);
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		margin: 0.5em 0;
	}

	.markdown :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--bg-base);
		padding: 1px 4px;
		border-radius: 3px;
	}

	.markdown :global(pre code) {
		background: none;
		padding: 0;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		margin: 0.5em 0;
		padding-left: 1.5em;
	}

	.markdown :global(blockquote) {
		border-left: 3px solid var(--accent);
		margin: 0.5em 0;
		padding-left: var(--sp-3);
		color: var(--text-secondary);
	}

	/* Typing indicator */
	.typing {
		display: flex;
		gap: 4px;
		padding: var(--sp-3) var(--sp-4) !important;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-tertiary);
		animation: bounce 1.4s ease-in-out infinite;
	}

	.dot:nth-child(2) {
		animation-delay: 0.16s;
	}

	.dot:nth-child(3) {
		animation-delay: 0.32s;
	}

	@keyframes bounce {
		0%, 80%, 100% { transform: translateY(0); }
		40% { transform: translateY(-6px); }
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@media (max-width: 768px) {
		.message {
			max-width: 95%;
		}

		.chat-messages {
			padding: var(--sp-4);
		}
	}
</style>
