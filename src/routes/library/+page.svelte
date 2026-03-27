<script lang="ts">
	import { papers } from '$lib/stores.svelte';
	import PaperCard from '$lib/components/PaperCard.svelte';
	import type { ReadingStatus } from '$lib/types';

	let viewMode = $state<'card' | 'table'>('card');
	let sortBy = $state<'addedAt' | 'publishedDate' | 'title' | 'rating'>('addedAt');
	let filterStatus = $state<ReadingStatus | 'all'>('all');
	let filterCategory = $state('all');
	let searchQuery = $state('');

	const allCategories = $derived(
		[...new Set(papers.items.flatMap(p => p.categories))].sort()
	);

	const filtered = $derived.by(() => {
		let result = [...papers.items];

		if (filterStatus !== 'all') {
			result = result.filter(p => p.readingStatus === filterStatus);
		}

		if (filterCategory !== 'all') {
			result = result.filter(p => p.categories.includes(filterCategory));
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(p =>
				p.title.toLowerCase().includes(q) ||
				p.authors.some(a => a.toLowerCase().includes(q)) ||
				p.tags.some(t => t.includes(q))
			);
		}

		result.sort((a, b) => {
			switch (sortBy) {
				case 'addedAt':
					return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
				case 'publishedDate':
					return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
				case 'title':
					return a.title.localeCompare(b.title);
				case 'rating':
					return (b.rating ?? 0) - (a.rating ?? 0);
				default:
					return 0;
			}
		});

		return result;
	});

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	const statusLabels: Record<string, string> = {
		unread: 'Unread',
		reading: 'Reading',
		read: 'Read',
		archived: 'Archived',
	};

	const statusColors: Record<string, string> = {
		unread: 'var(--status-unread)',
		reading: 'var(--status-active)',
		read: 'var(--text-tertiary)',
		archived: 'var(--text-tertiary)',
	};
</script>

<div class="library-page">
	<header class="page-header">
		<div class="header-left">
			<h1>Library</h1>
			<p class="page-subtitle text-secondary">{papers.items.length} papers</p>
		</div>
		<div class="view-toggle">
			<button class="toggle-btn" class:active={viewMode === 'card'} onclick={() => viewMode = 'card'}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
			</button>
			<button class="toggle-btn" class:active={viewMode === 'table'} onclick={() => viewMode = 'table'}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
			</button>
		</div>
	</header>

	<div class="filters">
		<input
			type="text"
			class="search-input"
			placeholder="Filter papers…"
			bind:value={searchQuery}
		/>
		<select bind:value={filterStatus}>
			<option value="all">All statuses</option>
			<option value="unread">Unread</option>
			<option value="reading">Reading</option>
			<option value="read">Read</option>
			<option value="archived">Archived</option>
		</select>
		<select bind:value={filterCategory}>
			<option value="all">All categories</option>
			{#each allCategories as cat}
				<option value={cat}>{cat}</option>
			{/each}
		</select>
		<select bind:value={sortBy}>
			<option value="addedAt">Recently added</option>
			<option value="publishedDate">Publication date</option>
			<option value="title">Title</option>
			<option value="rating">Rating</option>
		</select>
	</div>

	{#if viewMode === 'card'}
		<div class="card-grid">
			{#each filtered as paper, i (paper.id)}
				<div style="animation-delay: {i * 30}ms">
					<PaperCard {paper} />
				</div>
			{/each}
		</div>
	{:else}
		<div class="table-wrap">
			<table class="paper-table">
				<thead>
					<tr>
						<th class="th-status"></th>
						<th>Title</th>
						<th>Authors</th>
						<th>Published</th>
						<th>Categories</th>
						<th>Rating</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as paper, i (paper.id)}
						<tr class="table-row" style="animation-delay: {i * 20}ms">
							<td>
								<span class="status-dot" style="background: {statusColors[paper.readingStatus]}" title={statusLabels[paper.readingStatus]}></span>
							</td>
							<td>
								<a href="/paper/{paper.id}" class="table-title">{paper.title}</a>
							</td>
							<td class="table-authors">{paper.authors.slice(0, 2).join(', ')}{paper.authors.length > 2 ? ' …' : ''}</td>
							<td class="mono table-date">{formatDate(paper.publishedDate)}</td>
							<td class="table-cats">
								{#each paper.categories.slice(0, 2) as cat}
									<span class="tag mono">{cat}</span>
								{/each}
							</td>
							<td class="mono table-rating">
								{#if paper.rating}
									{'●'.repeat(paper.rating)}{'○'.repeat(5 - paper.rating)}
								{:else}
									<span class="text-tertiary">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if filtered.length === 0}
		<div class="empty">
			<p class="text-secondary">No papers match your filters.</p>
		</div>
	{/if}
</div>

<style>
	.library-page {
		max-width: 1200px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--sp-6);
	}

	.header-left h1 {
		font-size: 2.2rem;
		font-weight: 300;
		letter-spacing: -0.03em;
		margin-bottom: var(--sp-2);
	}

	.page-subtitle { font-size: 0.9rem; }

	.view-toggle {
		display: flex;
		gap: 2px;
		background: var(--bg-raised);
		border-radius: var(--radius-sm);
		padding: 2px;
		border: 1px solid var(--border);
	}

	.toggle-btn {
		padding: var(--sp-2);
		border-radius: 3px;
		color: var(--text-tertiary);
		display: flex;
		align-items: center;
		transition: all var(--duration-fast);
	}

	.toggle-btn.active {
		background: var(--bg-surface);
		color: var(--text-primary);
	}

	.filters {
		display: flex;
		gap: var(--sp-3);
		margin-bottom: var(--sp-6);
		flex-wrap: wrap;
	}

	.search-input {
		flex: 1;
		min-width: 200px;
	}

	select {
		min-width: 140px;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--sp-4);
	}

	/* Table */
	.table-wrap {
		overflow-x: auto;
	}

	.paper-table {
		width: 100%;
		border-collapse: collapse;
	}

	.paper-table th {
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--border);
		font-weight: 500;
	}

	.th-status { width: 24px; }

	.table-row {
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.table-row td {
		padding: var(--sp-3);
		border-bottom: 1px solid var(--border-subtle);
		vertical-align: middle;
	}

	.table-row:hover td {
		background: var(--bg-raised);
	}

	.status-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.table-title {
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 0.92rem;
	}

	.table-authors {
		font-size: 0.82rem;
		color: var(--text-secondary);
		max-width: 200px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.table-date {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		white-space: nowrap;
	}

	.table-cats {
		display: flex;
		gap: var(--sp-1);
	}

	.tag {
		font-size: 0.68rem;
		color: var(--text-tertiary);
		background: var(--bg-surface);
		padding: 1px 6px;
		border-radius: 3px;
	}

	.table-rating {
		font-size: 0.65rem;
		color: var(--accent);
		letter-spacing: 1px;
	}

	.empty {
		text-align: center;
		padding: var(--sp-16) 0;
	}
</style>
