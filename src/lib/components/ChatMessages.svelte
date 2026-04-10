<script lang="ts">
	import type { ChatMessage } from '$lib/types';
	import { marked } from 'marked';
	import { tick } from 'svelte';

	let {
		messages,
		isStreaming = false,
		streamingContent = '',
		activeTools = [],
		thinkingContent = '',
		thinkingBlocks = [],
		accessedFiles = [],
	}: {
		messages: ChatMessage[];
		isStreaming?: boolean;
		streamingContent?: string;
		activeTools?: { tool: string; input: string }[];
		thinkingContent?: string;
		thinkingBlocks?: string[];
		accessedFiles?: string[];
	} = $props();

	function shortenPath(p: string): string {
		const parts = p.split('/').filter(Boolean);
		if (parts.length <= 2) return p;
		return parts.slice(-2).join('/');
	}

	function toolLabel(tool: { tool: string; input: string }): string {
		try {
			const parsed = JSON.parse(tool.input);
			if (tool.tool === 'WebSearch' && parsed.query) return `Searching: ${parsed.query}`;
			if (tool.tool === 'WebFetch' && parsed.url) return `Fetching: ${parsed.url}`;
			if (tool.tool === 'Read' && parsed.file_path) return `Reading: ${shortenPath(parsed.file_path)}`;
			if (tool.tool === 'Glob' && parsed.pattern) return `Finding: ${parsed.pattern}`;
			if (tool.tool === 'Grep' && parsed.pattern) return `Searching: ${parsed.pattern}`;
		} catch { /* input still accumulating */ }
		const labels: Record<string, string> = {
			WebSearch: 'Searching the web...',
			WebFetch: 'Fetching web page...',
			Read: 'Reading file...',
			Glob: 'Finding files...',
			Grep: 'Searching files...',
		};
		return labels[tool.tool] || 'Working...';
	}

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

	{#if isStreaming}
		<div class="message assistant">
			<div class="message-label">Claude</div>

			{#if thinkingBlocks.length > 0 || thinkingContent}
				<div class="thinking-section">
					{#each thinkingBlocks as block, i}
						<details class="thinking-block">
							<summary>Thought {i + 1}</summary>
							<div class="thinking-text">{block}</div>
						</details>
					{/each}
					{#if thinkingContent}
						<details class="thinking-block" open>
							<summary>Thinking…</summary>
							<div class="thinking-text">{thinkingContent}</div>
						</details>
					{/if}
				</div>
			{/if}

			{#if accessedFiles.length > 0}
				<div class="accessed-files">
					{#each accessedFiles as filePath}
						<span class="file-pill" title={filePath}>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
								<polyline points="14 2 14 8 20 8"/>
							</svg>
							{shortenPath(filePath)}
						</span>
					{/each}
				</div>
			{/if}

			{#if activeTools.length > 0}
				<div class="tools-section">
					{#each activeTools as tool}
						<div class="tool-activity">
							<svg class="tool-icon spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
							<span class="tool-label">{toolLabel(tool)}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if streamingContent}
				<div class="message-content markdown">{@html renderMarkdown(streamingContent)}</div>
			{:else if !thinkingContent && thinkingBlocks.length === 0 && activeTools.length === 0}
				<div class="message-content typing">
					<span class="dot"></span><span class="dot"></span><span class="dot"></span>
				</div>
			{/if}
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

	/* Thinking blocks */
	.thinking-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		margin-bottom: var(--sp-2);
	}

	.thinking-block {
		background: var(--bg-base);
		border-left: 2px solid var(--accent);
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.thinking-block summary {
		padding: var(--sp-2) var(--sp-3);
		cursor: pointer;
		font-style: italic;
		user-select: none;
		list-style: none;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.thinking-block summary::before {
		content: '▸';
		font-style: normal;
		font-size: 0.7rem;
		transition: transform var(--duration-fast);
	}

	.thinking-block[open] summary::before {
		transform: rotate(90deg);
	}

	.thinking-text {
		padding: var(--sp-2) var(--sp-3);
		padding-top: 0;
		font-family: var(--font-mono);
		white-space: pre-wrap;
		max-height: 200px;
		overflow-y: auto;
		line-height: 1.5;
		font-size: 0.75rem;
	}

	/* Accessed files pills */
	.accessed-files {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		margin-bottom: var(--sp-2);
	}

	.file-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px var(--sp-2);
		background: var(--bg-base);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--text-secondary);
		white-space: nowrap;
		max-width: 280px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-pill svg {
		flex-shrink: 0;
		color: var(--accent);
	}

	/* Tools section */
	.tools-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		margin-bottom: var(--sp-2);
	}

	/* Tool activity indicator */
	.tool-activity {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.78rem;
		color: var(--text-secondary);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		align-self: flex-start;
		max-width: 80%;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.tool-icon {
		flex-shrink: 0;
		color: var(--accent);
	}

	.tool-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
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
