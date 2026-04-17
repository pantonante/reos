<script lang="ts">
	import { onMount } from 'svelte';
	import ReferenceCard from './ReferenceCard.svelte';
	import type { AnnotatedReference } from '$lib/types';
	import { papers, threads } from '$lib/stores.svelte';

	let {
		threadId,
		onupload,
	}: {
		threadId: string;
		onupload: (ref: AnnotatedReference) => void;
	} = $props();

	let references = $state<AnnotatedReference[]>([]);
	let loading = $state(true);
	let importingAll = $state(false);

	const importedCount = $derived(references.filter(r => r.imported).length);
	const arxivUnimported = $derived(references.filter(r => r.type === 'arxiv' && !r.imported));

	async function loadReferences() {
		try {
			const res = await fetch(`/api/threads/${threadId}/references`);
			if (!res.ok) return;
			const body = await res.json();
			references = body.references ?? [];
		} finally {
			loading = false;
		}
	}

	async function importSingle(arxivId: string) {
		const res = await fetch(`/api/threads/${threadId}/references/import`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ arxivId }),
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.error ?? 'Import failed');
		}
		// Refresh references and stores
		await Promise.all([loadReferences(), papers.reload(), threads.reload()]);
	}

	async function importAll() {
		if (importingAll || arxivUnimported.length === 0) return;
		importingAll = true;
		try {
			for (const ref of arxivUnimported) {
				if (ref.arxivId) {
					try {
						await fetch(`/api/threads/${threadId}/references/import`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ arxivId: ref.arxivId }),
						});
					} catch { /* continue with others */ }
				}
			}
			await Promise.all([loadReferences(), papers.reload(), threads.reload()]);
		} finally {
			importingAll = false;
		}
	}

	onMount(() => {
		void loadReferences();

		// Listen for SSE updates to auto-refresh
		const source = new EventSource(`/api/threads/${threadId}/events`);
		source.onmessage = (ev) => {
			try {
				const data = JSON.parse(ev.data);
				if (data?.type === 'synthesis:references-updated' ||
					data?.type === 'thread:papers-changed') {
					void loadReferences();
				}
			} catch { /* ignore */ }
		};
		return () => source.close();
	});
</script>

{#if loading}
	<div class="refs-loading">
		<span class="text-tertiary" style="font-size: 0.82rem;">Loading references…</span>
	</div>
{:else if references.length > 0}
	<div class="refs-container">
		<div class="refs-header">
			<div class="refs-title-row">
				<h4 class="refs-label mono">References</h4>
				<span class="refs-counts mono">
					{references.length} found · {importedCount} imported
				</span>
			</div>
			{#if arxivUnimported.length > 0}
				<button
					class="import-all-btn"
					onclick={importAll}
					disabled={importingAll}
				>
					{#if importingAll}
						Importing…
					{:else}
						Import all arXiv ({arxivUnimported.length})
					{/if}
				</button>
			{/if}
		</div>

		<div class="refs-list">
			{#each references as ref, i (ref.url)}
				<ReferenceCard
					reference={ref}
					index={i}
					onimport={importSingle}
					{onupload}
				/>
			{/each}
		</div>
	</div>
{/if}

<style>
	.refs-loading {
		padding: var(--sp-6) 0;
		text-align: center;
	}

	.refs-container {
		margin-top: var(--sp-6);
		padding-top: var(--sp-5);
		border-top: 1px solid var(--border);
	}

	.refs-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.refs-title-row {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.refs-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
		font-weight: 500;
	}

	.refs-counts {
		font-size: 0.68rem;
		color: var(--text-tertiary);
	}

	.import-all-btn {
		font-size: 0.76rem;
		font-family: var(--font-mono);
		color: var(--text-secondary);
		padding: var(--sp-1) var(--sp-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		transition: all var(--duration-fast) var(--ease-out);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.import-all-btn:hover:not(:disabled) {
		color: var(--status-active);
		border-color: var(--status-active);
		background: color-mix(in oklab, var(--status-active) 8%, transparent);
	}

	.import-all-btn:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.refs-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
</style>
