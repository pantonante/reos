<script lang="ts">
	import type { Paper } from '$lib/types';
	import { papers } from '$lib/stores.svelte';

	let {
		query = '',
		onPick,
		onClose,
	}: {
		query?: string;
		onPick: (paper: Paper) => void;
		onClose: () => void;
	} = $props();

	let highlightIdx = $state(0);

	const matches = $derived.by(() => {
		const q = query.toLowerCase().trim();
		const all = papers.items;
		if (!q) return all.slice(0, 8);
		const scored = all
			.map((p) => {
				const title = p.title.toLowerCase();
				const authors = p.authors.join(' ').toLowerCase();
				let score = 0;
				if (title.startsWith(q)) score += 5;
				else if (title.includes(q)) score += 3;
				if (authors.includes(q)) score += 2;
				return { paper: p, score };
			})
			.filter((m) => m.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 8);
		return scored.map((s) => s.paper);
	});

	$effect(() => {
		// reset highlight when matches change
		matches;
		highlightIdx = 0;
	});

	export function moveHighlight(delta: number) {
		if (matches.length === 0) return;
		highlightIdx = (highlightIdx + delta + matches.length) % matches.length;
	}

	export function selectHighlighted(): boolean {
		const p = matches[highlightIdx];
		if (p) {
			onPick(p);
			return true;
		}
		return false;
	}
</script>

<div class="menu" role="listbox">
	{#if matches.length === 0}
		<div class="empty">No papers found</div>
	{:else}
		{#each matches as p, i (p.id)}
			<button
				type="button"
				class="item"
				class:active={i === highlightIdx}
				role="option"
				aria-selected={i === highlightIdx}
				onmouseenter={() => (highlightIdx = i)}
				onclick={() => onPick(p)}
			>
				<div class="title">{p.title}</div>
				<div class="meta">{p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''} · {p.arxivId}</div>
			</button>
		{/each}
	{/if}
</div>

<style>
	.menu {
		position: absolute;
		bottom: 100%;
		left: 0;
		right: 0;
		margin-bottom: var(--sp-2);
		max-height: 320px;
		overflow-y: auto;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		padding: var(--sp-1);
		z-index: 30;
	}

	.empty {
		padding: var(--sp-3);
		text-align: center;
		color: var(--text-tertiary);
		font-size: 0.8rem;
	}

	.item {
		display: block;
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		color: var(--text-secondary);
		transition: background var(--duration-fast) var(--ease-out);
	}

	.item.active,
	.item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.item.active {
		background: var(--accent-muted);
	}

	.title {
		font-size: 0.85rem;
		line-height: 1.35;
		margin-bottom: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.meta {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-tertiary);
	}
</style>
