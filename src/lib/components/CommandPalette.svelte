<script lang="ts">
	import { goto } from '$app/navigation';
	import { ui, papers, threads } from '$lib/stores.svelte';

	let query = $state('');
	let selectedIndex = $state(0);

	type Result = { type: string; label: string; sublabel: string; action: () => void };

	function normalizeForSearch(input: string): string {
		return input
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	}

	function tokenize(input: string): string[] {
		return input ? input.split(/\s+/).filter(Boolean) : [];
	}

	function compact(input: string): string {
		return input.replace(/\s+/g, '');
	}

	function tokenVariants(token: string): string[] {
		const variants = new Set<string>([token]);

		// Minimal stemming so plural/gerund queries still match base words.
		if (token.endsWith('ies') && token.length > 4) variants.add(token.slice(0, -3) + 'y');
		if (token.endsWith('es') && token.length > 4) variants.add(token.slice(0, -2));
		if (token.endsWith('s') && token.length > 3) variants.add(token.slice(0, -1));
		if (token.endsWith('ing') && token.length > 5) variants.add(token.slice(0, -3));

		return [...variants].filter(v => v.length > 1);
	}

	function levenshteinWithin(a: string, b: string, maxDistance: number): boolean {
		if (a === b) return true;
		if (Math.abs(a.length - b.length) > maxDistance) return false;

		const cols = b.length + 1;
		let prev = new Array<number>(cols);
		let curr = new Array<number>(cols);
		for (let j = 0; j < cols; j++) prev[j] = j;

		for (let i = 1; i <= a.length; i++) {
			curr[0] = i;
			for (let j = 1; j < cols; j++) {
				const cost = a[i - 1] === b[j - 1] ? 0 : 1;
				curr[j] = Math.min(
					prev[j] + 1,
					curr[j - 1] + 1,
					prev[j - 1] + cost
				);
			}
			[prev, curr] = [curr, prev];
		}

		return prev[b.length] <= maxDistance;
	}

	function tokenMatches(token: string, normalizedText: string, compactText: string, words: string[]): boolean {
		const variants = tokenVariants(token);

		for (const v of variants) {
			if (normalizedText.includes(v) || compactText.includes(v)) return true;
		}

		// Lightweight fuzzy fallback for longer terms only.
		if (token.length < 5) return false;
		const maxDistance = token.length >= 9 ? 2 : 1;
		for (const v of variants) {
			for (const w of words) {
				if (levenshteinWithin(w, v, maxDistance)) return true;
			}
		}

		return false;
	}

	function matchesQuery(texts: string[], normalizedQuery: string, queryTokens: string[]): boolean {
		if (queryTokens.length === 0) return true;

		const normalizedText = normalizeForSearch(texts.join(' '));
		if (!normalizedText) return false;

		if (normalizedText.includes(normalizedQuery)) return true;

		const compactQuery = compact(normalizedQuery);
		const compactText = compact(normalizedText);
		if (compactQuery && compactText.includes(compactQuery)) return true;

		const words = tokenize(normalizedText);
		return queryTokens.every(token => tokenMatches(token, normalizedText, compactText, words));
	}

	const results = $derived.by(() => {
		const rawQuery = query.trim();
		const fullTextMode = rawQuery.startsWith('/');
		const normalizedQuery = normalizeForSearch(fullTextMode ? rawQuery.slice(1) : rawQuery);
		const queryTokens = tokenize(normalizedQuery);
		const items: Result[] = [];

		// Navigation commands
		const nav = [
			{ label: 'Go to Inbox', sublabel: 'View unread papers', action: () => goto('/') },
			{ label: 'Go to Threads', sublabel: 'View research threads', action: () => goto('/threads') },
			{ label: 'Go to Library', sublabel: 'Browse all papers', action: () => goto('/library') },
			{ label: 'Go to Graph', sublabel: 'Explore citation graph', action: () => goto('/graph') },
			{ label: 'Add Paper', sublabel: 'Import from Arxiv', action: () => { ui.commandPaletteOpen = false; ui.addPaperOpen = true; } },
			{ label: 'Generate All Summaries', sublabel: 'Process papers without summaries', action: () => { ui.commandPaletteOpen = false; ui.batchSummaryOpen = true; } },
		];

		for (const n of nav) {
			if (matchesQuery([n.label, n.sublabel], normalizedQuery, queryTokens)) {
				items.push({ type: 'nav', ...n });
			}
		}

		// Threads (prioritized so "go to specific thread by name" is reliable)
		for (const t of threads.items) {
			if (matchesQuery([t.title, t.question], normalizedQuery, queryTokens)) {
				items.push({
					type: 'thread',
					label: t.title,
					sublabel: t.question.slice(0, 80) + (t.question.length > 80 ? '…' : ''),
					action: () => goto(`/threads/${t.id}`),
				});
			}
		}

		// Papers
		for (const p of papers.items) {
			const matchesPaperCore = matchesQuery(
				[p.title, p.authors.join(' '), p.arxivId],
				normalizedQuery,
				queryTokens
			);
			const matchesPaperFullText =
				fullTextMode &&
				matchesQuery([p.abstract, p.summary ?? ''], normalizedQuery, queryTokens);

			if (matchesPaperCore || matchesPaperFullText) {
				items.push({
					type: 'paper',
					label: p.title,
					sublabel: `${p.authors[0]}${p.authors.length > 1 ? ' et al.' : ''} · ${p.arxivId}`,
					action: () => goto(`/paper/${p.id}`),
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
			e.preventDefault();
			e.stopPropagation();
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

<svelte:window onkeydown={handleKeydown} />

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
				placeholder="Search papers, threads, commands… (/ for full text)"
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
