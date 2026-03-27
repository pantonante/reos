<script lang="ts">
	import { goto } from '$app/navigation';
	import { ui, papers, threads } from '$lib/stores.svelte';

	let query = $state('');
	let selectedIndex = $state(0);

	type Result = { type: string; label: string; sublabel: string; action: () => void };

	const results = $derived.by(() => {
		const q = query.toLowerCase().trim();
		const items: Result[] = [];

		// Navigation commands
		const nav = [
			{ label: 'Go to Inbox', sublabel: 'View unread papers', action: () => goto('/') },
			{ label: 'Go to Threads', sublabel: 'View research threads', action: () => goto('/threads') },
			{ label: 'Go to Library', sublabel: 'Browse all papers', action: () => goto('/library') },
			{ label: 'Go to Graph', sublabel: 'Explore citation graph', action: () => goto('/graph') },
			{ label: 'Add Paper', sublabel: 'Import from Arxiv', action: () => { ui.commandPaletteOpen = false; ui.addPaperOpen = true; } },
		];

		for (const n of nav) {
			if (!q || n.label.toLowerCase().includes(q) || n.sublabel.toLowerCase().includes(q)) {
				items.push({ type: 'nav', ...n });
			}
		}

		// Papers
		for (const p of papers.items) {
			if (!q || p.title.toLowerCase().includes(q) || p.authors.some(a => a.toLowerCase().includes(q)) || p.arxivId.includes(q)) {
				items.push({
					type: 'paper',
					label: p.title,
					sublabel: `${p.authors[0]}${p.authors.length > 1 ? ' et al.' : ''} · ${p.arxivId}`,
					action: () => goto(`/paper/${p.id}`),
				});
			}
		}

		// Threads
		for (const t of threads.items) {
			if (!q || t.title.toLowerCase().includes(q) || t.question.toLowerCase().includes(q)) {
				items.push({
					type: 'thread',
					label: t.title,
					sublabel: t.question.slice(0, 80) + (t.question.length > 80 ? '…' : ''),
					action: () => goto(`/threads/${t.id}`),
				});
			}
		}

		return items.slice(0, 12);
	});

	$effect(() => {
		// Reset selection when results change
		query;
		selectedIndex = 0;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			ui.commandPaletteOpen = false;
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter' && results[selectedIndex]) {
			e.preventDefault();
			results[selectedIndex].action();
			ui.commandPaletteOpen = false;
		}
	}

	function select(i: number) {
		results[i].action();
		ui.commandPaletteOpen = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="palette-backdrop" onclick={() => ui.commandPaletteOpen = false} onkeydown={handleKeydown}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="palette" onclick={(e) => e.stopPropagation()}>
		<div class="palette-input-wrap">
			<svg class="palette-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="8"/>
				<line x1="21" y1="21" x2="16.65" y2="16.65"/>
			</svg>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				class="palette-input"
				placeholder="Search papers, threads, commands…"
				bind:value={query}
				autofocus
			/>
			<kbd class="esc-hint">esc</kbd>
		</div>
		{#if results.length > 0}
			<div class="palette-results">
				{#each results as result, i}
					<button
						class="palette-result"
						class:selected={i === selectedIndex}
						onmouseenter={() => selectedIndex = i}
						onclick={() => select(i)}
					>
						<span class="result-type mono">{result.type}</span>
						<div class="result-text">
							<span class="result-label">{result.label}</span>
							<span class="result-sublabel">{result.sublabel}</span>
						</div>
					</button>
				{/each}
			</div>
		{:else if query}
			<div class="palette-empty">No results for "{query}"</div>
		{/if}
	</div>
</div>

<style>
	.palette-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		z-index: 100;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 15vh;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.palette {
		width: 560px;
		max-width: 90vw;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		animation: slideUp var(--duration-normal) var(--ease-out);
	}

	.palette-input-wrap {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-5);
		border-bottom: 1px solid var(--border);
	}

	.palette-icon {
		flex-shrink: 0;
		color: var(--text-tertiary);
	}

	.palette-input {
		flex: 1;
		border: none;
		background: none;
		font-size: 1rem;
		padding: 0;
		color: var(--text-primary);
	}

	.palette-input:focus {
		box-shadow: none;
	}

	.palette-input::placeholder {
		color: var(--text-tertiary);
	}

	.esc-hint {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-tertiary);
		background: var(--bg-base);
		padding: 2px 6px;
		border-radius: 3px;
		border: 1px solid var(--border);
	}

	.palette-results {
		max-height: 360px;
		overflow-y: auto;
		padding: var(--sp-2);
	}

	.palette-result {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: var(--sp-3) var(--sp-3);
		border-radius: var(--radius-sm);
		text-align: left;
		transition: background var(--duration-fast);
	}

	.palette-result.selected {
		background: var(--bg-hover);
	}

	.result-type {
		flex-shrink: 0;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		width: 48px;
	}

	.result-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.result-label {
		font-size: 0.9rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-sublabel {
		font-size: 0.78rem;
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.palette-empty {
		padding: var(--sp-8) var(--sp-5);
		text-align: center;
		color: var(--text-tertiary);
		font-size: 0.9rem;
	}
</style>
