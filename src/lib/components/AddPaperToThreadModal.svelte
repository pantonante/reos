<script lang="ts">
	import { papers, threads } from '$lib/stores.svelte';
	import { extractArxivId, fetchArxivPaper } from '$lib/arxiv';
	import type { Thread } from '$lib/types';

	let { thread, onclose }: { thread: Thread; onclose: () => void } = $props();

	let mode = $state<'arxiv' | 'library'>('arxiv');
	let arxivInput = $state('');
	let contextNote = $state('');
	let loading = $state(false);
	let error = $state('');
	let selectedPaperId = $state<string | null>(null);
	let searchQuery = $state('');

	const existingPaperIds = $derived(new Set(thread.papers.map(tp => tp.paperId)));

	const availablePapers = $derived(
		papers.items.filter(p => {
			if (existingPaperIds.has(p.id)) return false;
			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase();
			return p.title.toLowerCase().includes(q) ||
				p.authors.some(a => a.toLowerCase().includes(q)) ||
				p.arxivId.includes(q);
		})
	);

	function addToThread(paperId: string) {
		const newPapers = [
			...thread.papers,
			{ paperId, contextNote: contextNote.trim(), order: thread.papers.length },
		];
		threads.update(thread.id, { papers: newPapers, updatedAt: new Date().toISOString() });
	}

	async function handleArxivSubmit() {
		error = '';
		const arxivId = extractArxivId(arxivInput);

		if (!arxivId) {
			error = 'Could not parse Arxiv ID. Try 2401.12345 or a full arxiv.org URL.';
			return;
		}

		// Check if already in library
		const existing = papers.items.find(p => p.arxivId === arxivId);
		if (existing) {
			if (existingPaperIds.has(existing.id)) {
				error = 'This paper is already in this thread.';
				return;
			}
			addToThread(existing.id);
			onclose();
			return;
		}

		loading = true;
		try {
			const newPaper = await fetchArxivPaper(arxivId);
			papers.add(newPaper);
			addToThread(newPaper.id);
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch from Arxiv.';
		} finally {
			loading = false;
		}
	}

	function handleLibraryAdd() {
		if (!selectedPaperId) return;
		addToThread(selectedPaperId);
		onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onclose}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>Add Paper</h2>

		<div class="mode-tabs">
			<button class="mode-tab" class:active={mode === 'arxiv'} onclick={() => mode = 'arxiv'}>
				From Arxiv
			</button>
			<button class="mode-tab" class:active={mode === 'library'} onclick={() => mode = 'library'}>
				From Library
				{#if availablePapers.length > 0}
					<span class="tab-count mono">{availablePapers.length}</span>
				{/if}
			</button>
		</div>

		{#if mode === 'arxiv'}
			<form onsubmit={e => { e.preventDefault(); handleArxivSubmit(); }}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					class="arxiv-input"
					placeholder="Arxiv URL or ID, e.g. 2401.12345"
					bind:value={arxivInput}
					autofocus
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="context-field">
					<label class="field-label mono" for="ctx-arxiv">Context note (optional)</label>
					<textarea
						id="ctx-arxiv"
						placeholder="Why is this paper relevant to this thread?"
						bind:value={contextNote}
						rows="2"
					></textarea>
				</div>

				<div class="actions">
					<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
					<button type="submit" class="btn-primary" disabled={loading || !arxivInput.trim()}>
						{loading ? 'Fetching…' : 'Add'}
					</button>
				</div>
			</form>

		{:else}
			<input
				type="text"
				class="search-input"
				placeholder="Search your library…"
				bind:value={searchQuery}
			/>

			<div class="paper-list">
				{#each availablePapers as paper (paper.id)}
					<button
						class="paper-option"
						class:selected={selectedPaperId === paper.id}
						onclick={() => selectedPaperId = paper.id}
					>
						<span class="paper-option-title">{paper.title}</span>
						<span class="paper-option-meta mono">
							{paper.authors[0]}{paper.authors.length > 1 ? ' et al.' : ''} · {paper.arxivId}
						</span>
					</button>
				{:else}
					<p class="empty text-tertiary">
						{searchQuery ? 'No matching papers.' : availablePapers.length === 0 && papers.items.length === 0 ? 'Library is empty. Use "From Arxiv" to add papers.' : 'All library papers are already in this thread.'}
					</p>
				{/each}
			</div>

			{#if selectedPaperId}
				<div class="context-field">
					<label class="field-label mono" for="ctx-lib">Context note (optional)</label>
					<textarea
						id="ctx-lib"
						placeholder="Why is this paper relevant to this thread?"
						bind:value={contextNote}
						rows="2"
					></textarea>
				</div>
			{/if}

			<div class="actions">
				<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
				<button
					type="button"
					class="btn-primary"
					disabled={!selectedPaperId}
					onclick={handleLibraryAdd}
				>Add</button>
			</div>
		{/if}
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
		padding-top: 12vh;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.modal {
		width: 520px;
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
		margin-bottom: var(--sp-4);
	}

	/* Mode tabs */
	.mode-tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
		margin-bottom: var(--sp-5);
	}

	.mode-tab {
		padding: var(--sp-2) var(--sp-4);
		font-size: 0.85rem;
		color: var(--text-tertiary);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: all var(--duration-fast);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.mode-tab:hover { color: var(--text-secondary); }

	.mode-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.tab-count {
		font-size: 0.65rem;
		background: var(--bg-surface);
		padding: 0 5px;
		border-radius: 3px;
		color: var(--text-tertiary);
	}

	/* Arxiv input */
	.arxiv-input {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		font-family: var(--font-mono);
		font-size: 0.92rem;
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
	}

	.error {
		color: var(--status-unread);
		font-size: 0.82rem;
		margin-bottom: var(--sp-4);
	}

	/* Library search */
	.search-input {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
	}

	.paper-list {
		max-height: 220px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: var(--sp-5);
	}

	.paper-option {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-sm);
		text-align: left;
		transition: background var(--duration-fast);
	}

	.paper-option:hover { background: var(--bg-hover); }

	.paper-option.selected {
		background: var(--accent-muted);
		outline: 1px solid var(--accent);
	}

	.paper-option-title {
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-weight: 500;
		line-height: 1.3;
	}

	.paper-option-meta {
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.empty {
		text-align: center;
		padding: var(--sp-6) 0;
		font-size: 0.88rem;
	}

	/* Context note */
	.context-field {
		margin-bottom: var(--sp-5);
	}

	.field-label {
		display: block;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	textarea {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		resize: vertical;
		line-height: 1.5;
	}

	/* Actions */
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
	}

	.btn-secondary,
	.btn-primary {
		padding: var(--sp-2) var(--sp-5);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.btn-secondary { color: var(--text-secondary); }
	.btn-secondary:hover { background: var(--bg-hover); }

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
