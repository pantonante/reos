<script lang="ts">
	import type { Chat, Paper } from '$lib/types';

	let {
		chat,
		paper = null,
	}: {
		chat: Chat | undefined;
		paper?: Paper | null;
	} = $props();
</script>

<header class="chat-header">
	<div class="title-row">
		<h1 class="title">{chat?.title ?? 'Chat'}</h1>
		{#if paper}
			<a class="paper-chip" href={`/paper/${paper.id}`} title={paper.title}>
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
				<em>{paper.title}</em>
			</a>
		{/if}
	</div>
</header>

<style>
	.chat-header {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-4) var(--sp-6);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-base);
		flex-shrink: 0;
		position: relative;
	}

	/* Decorative hairline accent under the header */
	.chat-header::after {
		content: '';
		position: absolute;
		bottom: -1px;
		left: 50%;
		transform: translateX(-50%);
		width: 32px;
		height: 1px;
		background: var(--accent);
	}

	.title-row {
		display: flex;
		align-items: baseline;
		gap: var(--sp-3);
		min-width: 0;
		flex: 1;
	}

	.title {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 500;
		margin: 0;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 50ch;
		font-feature-settings: 'liga' on, 'dlig' on, 'onum' on;
		letter-spacing: -0.005em;
	}

	.paper-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 0;
		color: var(--text-tertiary);
		font-family: var(--font-display);
		font-size: 0.82rem;
		text-decoration: none;
		max-width: 32ch;
		min-width: 0;
		border-bottom: 1px dotted var(--border);
		transition: all var(--duration-fast) var(--ease-out);
	}

	.paper-chip:hover {
		color: var(--text-secondary);
		border-bottom-color: var(--accent);
	}

	.paper-chip svg {
		color: var(--accent);
		flex-shrink: 0;
	}

	.paper-chip em {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-style: italic;
	}

	@media (max-width: 768px) {
		.chat-header {
			padding: var(--sp-3) var(--sp-4);
		}
	}
</style>
