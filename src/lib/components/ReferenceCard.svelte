<script lang="ts">
	import type { AnnotatedReference } from '$lib/types';

	let {
		reference,
		index = 0,
		onimport,
		onupload,
	}: {
		reference: AnnotatedReference;
		index?: number;
		onimport: (arxivId: string) => Promise<void>;
		onupload: (ref: AnnotatedReference) => void;
	} = $props();

	let importing = $state(false);

	async function handleImport() {
		if (!reference.arxivId || importing) return;
		importing = true;
		try {
			await onimport(reference.arxivId);
		} finally {
			importing = false;
		}
	}
</script>

<div
	class="ref-card"
	class:imported={reference.imported}
	style="animation-delay: {index * 40}ms"
>
	<div class="ref-status">
		{#if reference.imported}
			<a href="/paper/{reference.paperId}" class="dot imported" title="Imported — click to view">
				<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
					<circle cx="8" cy="8" r="8"/>
				</svg>
			</a>
		{:else}
			<span class="dot pending" title="Not imported">
				<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="8" cy="8" r="6"/>
				</svg>
			</span>
		{/if}
	</div>

	{#if reference.type === 'external' && !reference.imported}
		<a
			class="ref-body ref-body-link"
			href={reference.url}
			target="_blank"
			rel="noopener"
			title="Open publisher page to download the PDF"
		>
			<span class="ref-label">{reference.label}</span>
			<span class="ref-meta mono">
				{reference.url.replace(/^https?:\/\//, '').slice(0, 48)}{reference.url.length > 55 ? '…' : ''}
			</span>
		</a>
	{:else}
		<div class="ref-body">
			<span class="ref-label">{reference.label}</span>
			<span class="ref-meta mono">
				{#if reference.type === 'arxiv'}
					arXiv:{reference.arxivId}
				{:else}
					{reference.url.replace(/^https?:\/\//, '').slice(0, 48)}{reference.url.length > 55 ? '…' : ''}
				{/if}
			</span>
		</div>
	{/if}

	<div class="ref-actions">
		{#if reference.imported}
			<a href="/paper/{reference.paperId}" class="action-btn view" title="View paper">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
					<polyline points="15 3 21 3 21 9"/>
					<line x1="10" y1="14" x2="21" y2="3"/>
				</svg>
			</a>
		{:else if reference.type === 'arxiv'}
			<button
				class="action-btn import"
				onclick={handleImport}
				disabled={importing}
				title="Import from arXiv"
			>
				{#if importing}
					<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.3"/>
						<path d="M12 2v4" stroke-linecap="round"/>
					</svg>
				{:else}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="5" x2="12" y2="19"/>
						<line x1="5" y1="12" x2="19" y2="12"/>
					</svg>
				{/if}
			</button>
		{:else}
			<button
				class="action-btn upload"
				onclick={() => onupload(reference)}
				title="Upload PDF once downloaded"
			>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="17 8 12 3 7 8"/>
					<line x1="12" y1="3" x2="12" y2="15"/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	.ref-card {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		transition: all var(--duration-fast) var(--ease-out);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.ref-card:hover {
		background: var(--bg-raised);
		border-color: var(--border);
	}

	.ref-card.imported {
		opacity: 0.75;
	}

	.ref-card.imported:hover {
		opacity: 1;
	}

	.ref-status {
		flex-shrink: 0;
		padding-top: 3px;
	}

	.dot {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
	}

	.dot.imported {
		color: var(--status-active);
		text-decoration: none;
	}

	.dot.pending {
		color: var(--text-tertiary);
	}

	.ref-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.ref-body-link {
		text-decoration: none;
		color: inherit;
		border-radius: var(--radius-sm);
	}

	.ref-body-link:hover .ref-label {
		color: var(--accent);
	}

	.ref-label {
		font-size: 0.88rem;
		font-family: var(--font-display);
		line-height: 1.35;
		color: var(--text-primary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.ref-meta {
		font-size: 0.7rem;
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ref-actions {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding-top: 2px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		transition: all var(--duration-fast) var(--ease-out);
		text-decoration: none;
		border: none;
		background: none;
		cursor: pointer;
	}

	.action-btn:hover:not(:disabled) {
		color: var(--accent);
		background: var(--accent-muted);
	}

	.action-btn.import:hover:not(:disabled) {
		color: var(--status-active);
		background: color-mix(in oklab, var(--status-active) 14%, transparent);
	}

	.action-btn.view {
		color: var(--status-active);
	}

	.action-btn.view:hover {
		background: color-mix(in oklab, var(--status-active) 14%, transparent);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
