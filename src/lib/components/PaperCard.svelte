<script lang="ts">
	import type { Paper } from '$lib/types';

	let { paper, compact = false }: { paper: Paper; compact?: boolean } = $props();

	const statusColors: Record<string, string> = {
		unread: 'var(--status-unread)',
		reading: 'var(--status-active)',
		read: 'var(--text-tertiary)',
		archived: 'var(--text-tertiary)',
	};

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
	}
</script>

<a href="/paper/{paper.id}" class="paper-card" class:compact>
	<div class="card-top">
		<span class="status-dot" style="background: {statusColors[paper.readingStatus]}"></span>
		<span class="arxiv-id mono">{paper.arxivId}</span>
		<span class="date mono">{formatDate(paper.publishedDate)}</span>
	</div>
	<h3 class="card-title">{paper.title}</h3>
	<p class="card-authors">{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ''}</p>
	{#if !compact}
		<p class="card-abstract">{paper.abstract.slice(0, 160)}…</p>
	{/if}
	<div class="card-footer">
		<div class="tags">
			{#each paper.categories.slice(0, 3) as cat}
				<span class="tag mono">{cat}</span>
			{/each}
		</div>
		{#if paper.rating}
			<span class="rating mono">{'●'.repeat(paper.rating)}{'○'.repeat(5 - paper.rating)}</span>
		{/if}
	</div>
</a>

<style>
	.paper-card {
		display: block;
		padding: var(--sp-5);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: inherit;
		transition: all var(--duration-fast) var(--ease-out);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.paper-card:hover {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent-muted);
		transform: translateY(-1px);
	}

	.card-top {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.arxiv-id {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.date {
		margin-left: auto;
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.card-title {
		font-size: 1.05rem;
		font-weight: 500;
		line-height: 1.35;
		margin-bottom: var(--sp-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-authors {
		font-size: 0.82rem;
		color: var(--text-secondary);
		margin-bottom: var(--sp-3);
	}

	.card-abstract {
		font-size: 0.82rem;
		color: var(--text-tertiary);
		line-height: 1.5;
		margin-bottom: var(--sp-3);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.tags {
		display: flex;
		gap: var(--sp-1);
		flex-wrap: wrap;
	}

	.tag {
		font-size: 0.68rem;
		color: var(--text-tertiary);
		background: var(--bg-surface);
		padding: 1px 6px;
		border-radius: 3px;
	}

	.rating {
		font-size: 0.65rem;
		color: var(--accent);
		letter-spacing: 1px;
	}

	.compact .card-title {
		font-size: 0.95rem;
		-webkit-line-clamp: 1;
	}

	.compact {
		padding: var(--sp-3) var(--sp-4);
	}
</style>
