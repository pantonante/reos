<script lang="ts">
	import { ui, papers } from '$lib/stores.svelte';
	import { goto } from '$app/navigation';
	import { extractArxivId, fetchArxivPaper } from '$lib/arxiv';

	let input = $state('');
	let loading = $state(false);
	let error = $state('');
	let duplicate = $state<string | null>(null);

	async function handleSubmit() {
		error = '';
		duplicate = null;
		const arxivId = extractArxivId(input);

		if (!arxivId) {
			error = 'Could not parse Arxiv ID. Try pasting a URL like arxiv.org/abs/2401.12345 or just the ID.';
			return;
		}

		const existing = papers.items.find(p => p.arxivId === arxivId);
		if (existing) {
			duplicate = existing.id;
			return;
		}

		loading = true;
		try {
			const newPaper = await fetchArxivPaper(arxivId);
			papers.add(newPaper);
			ui.addPaperOpen = false;
			goto(`/paper/${newPaper.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch from Arxiv.';
		} finally {
			loading = false;
		}
	}

	function goToDuplicate() {
		if (duplicate) {
			ui.addPaperOpen = false;
			goto(`/paper/${duplicate}`);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') ui.addPaperOpen = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={() => ui.addPaperOpen = false}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>Add Paper</h2>
		<p class="subtitle">Paste an Arxiv URL or ID</p>

		<form onsubmit={e => { e.preventDefault(); handleSubmit(); }}>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				class="arxiv-input"
				placeholder="e.g. 2401.12345 or arxiv.org/abs/2401.12345"
				bind:value={input}
				autofocus
			/>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			{#if duplicate}
				<div class="duplicate-notice">
					<p>This paper is already in your library.</p>
					<button type="button" class="link-btn" onclick={goToDuplicate}>Go to paper →</button>
				</div>
			{/if}

			<div class="actions">
				<button type="button" class="btn-secondary" onclick={() => ui.addPaperOpen = false}>Cancel</button>
				<button type="submit" class="btn-primary" disabled={loading || !input.trim()}>
					{loading ? 'Fetching…' : 'Add'}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		z-index: 100;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 20vh;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.modal {
		width: 460px;
		max-width: 90vw;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--sp-8);
		animation: slideUp var(--duration-normal) var(--ease-out);
	}

	h2 {
		font-size: 1.3rem;
		margin-bottom: var(--sp-1);
	}

	.subtitle {
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin-bottom: var(--sp-6);
	}

	.arxiv-input {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		font-family: var(--font-mono);
		font-size: 0.95rem;
		border-radius: var(--radius-md);
	}

	.error {
		color: var(--status-unread);
		font-size: 0.85rem;
		margin-top: var(--sp-3);
	}

	.duplicate-notice {
		margin-top: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--accent-muted);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
	}

	.duplicate-notice p {
		color: var(--accent);
		margin-bottom: var(--sp-2);
	}

	.link-btn {
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.link-btn:hover {
		text-decoration: underline;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
		margin-top: var(--sp-6);
	}

	.btn-secondary,
	.btn-primary {
		padding: var(--sp-2) var(--sp-5);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.btn-secondary {
		color: var(--text-secondary);
	}

	.btn-secondary:hover {
		background: var(--bg-hover);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
