<script lang="ts">
	import { threads, papers } from '$lib/stores.svelte';
	import NewThreadModal from '$lib/components/NewThreadModal.svelte';
	import type { ThreadStatus } from '$lib/types';

	let viewMode = $state<'kanban' | 'list'>('kanban');
	let showNewThread = $state(false);
	let draggedThreadId = $state<string | null>(null);
	let dropTargetStatus = $state<ThreadStatus | null>(null);

	const columns: { status: ThreadStatus; label: string; color: string }[] = [
		{ status: 'active', label: 'Active', color: 'var(--status-active)' },
		{ status: 'paused', label: 'Paused', color: 'var(--status-paused)' },
		{ status: 'concluded', label: 'Concluded', color: 'var(--status-concluded)' },
	];

	function threadsByStatus(status: ThreadStatus) {
		return threads.items.filter(t => t.status === status);
	}

	function paperCount(threadId: string) {
		const thread = threads.get(threadId);
		return thread?.papers.length ?? 0;
	}

	function handleDragStart(e: DragEvent, threadId: string) {
		draggedThreadId = threadId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', threadId);
		}
	}

	function handleDragEnd() {
		draggedThreadId = null;
		dropTargetStatus = null;
	}

	function handleDragOver(e: DragEvent, status: ThreadStatus) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		dropTargetStatus = status;
	}

	function handleDragLeave(e: DragEvent, colEl: HTMLElement) {
		if (!colEl.contains(e.relatedTarget as Node)) {
			dropTargetStatus = null;
		}
	}

	function handleDrop(e: DragEvent, status: ThreadStatus) {
		e.preventDefault();
		dropTargetStatus = null;
		if (!draggedThreadId) return;
		const thread = threads.get(draggedThreadId);
		if (thread && thread.status !== status) {
			threads.update(thread.id, { status, updatedAt: new Date().toISOString() });
		}
		draggedThreadId = null;
	}
</script>

<div class="threads-page">
	<header class="page-header">
		<div class="header-left">
			<h1>Threads</h1>
			<p class="page-subtitle text-secondary">{threads.items.length} investigations</p>
		</div>
		<div class="header-actions">
			<button class="new-thread-btn" onclick={() => showNewThread = true}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				New thread
			</button>
			<div class="view-toggle">
				<button
					class="toggle-btn"
					class:active={viewMode === 'kanban'}
					onclick={() => viewMode = 'kanban'}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="12" rx="1"/></svg>
				</button>
				<button
					class="toggle-btn"
					class:active={viewMode === 'list'}
					onclick={() => viewMode = 'list'}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
				</button>
			</div>
		</div>
	</header>

	{#if viewMode === 'kanban'}
		<div class="kanban">
			{#each columns as col, ci}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="kanban-col"
				class:drop-target={dropTargetStatus === col.status && draggedThreadId !== null}
				style="animation-delay: {ci * 60}ms"
				ondragover={(e) => handleDragOver(e, col.status)}
				ondragleave={(e) => handleDragLeave(e, e.currentTarget)}
				ondrop={(e) => handleDrop(e, col.status)}
			>
					<div class="col-header">
						<span class="col-dot" style="background: {col.color}"></span>
						<span class="col-label">{col.label}</span>
						<span class="col-count mono">{threadsByStatus(col.status).length}</span>
					</div>
					<div class="col-cards">
						{#each threadsByStatus(col.status) as thread, ti}
							<a
								href="/threads/{thread.id}"
								class="thread-card"
								class:dragging={draggedThreadId === thread.id}
								style="animation-delay: {ci * 60 + ti * 40 + 80}ms"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, thread.id)}
								ondragend={handleDragEnd}
							>
								<h3 class="thread-title">{thread.title}</h3>
								<p class="thread-question">{thread.question}</p>
								<div class="thread-meta">
									<span class="mono">{paperCount(thread.id)} papers</span>
									{#if thread.synthesis}
										<span class="has-synthesis" title="Has synthesis">●</span>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="list-view">
			{#each threads.items as thread, i}
				<a
					href="/threads/{thread.id}"
					class="list-row"
					style="animation-delay: {i * 30 + 60}ms"
				>
					<span class="row-status-dot" style="background: {columns.find(c => c.status === thread.status)?.color}"></span>
					<div class="row-content">
						<span class="row-title">{thread.title}</span>
						<span class="row-question text-tertiary">{thread.question}</span>
					</div>
					<span class="row-papers mono">{paperCount(thread.id)}</span>
					<span class="row-status mono">{thread.status}</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

{#if showNewThread}
	<NewThreadModal onclose={() => showNewThread = false} />
{/if}

<style>
	.threads-page {
		max-width: 1200px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--sp-8);
	}

	.header-left h1 {
		font-size: 2.2rem;
		font-weight: 300;
		letter-spacing: -0.03em;
		margin-bottom: var(--sp-2);
	}

	.page-subtitle {
		font-size: 0.9rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.new-thread-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-4);
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-weight: 500;
		transition: background var(--duration-fast);
	}

	.new-thread-btn:hover {
		background: var(--accent-hover);
	}

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

	/* Kanban */
	.kanban {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-5);
	}

	.kanban-col {
		animation: slideUp var(--duration-slow) var(--ease-out) both;
		border-radius: var(--radius-md);
		padding: var(--sp-3);
		transition: background var(--duration-fast), outline var(--duration-fast);
		outline: 2px dashed transparent;
		outline-offset: -2px;
	}

	.kanban-col.drop-target {
		background: color-mix(in srgb, var(--accent) 6%, transparent);
		outline-color: var(--accent);
	}

	.col-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding-bottom: var(--sp-3);
		margin-bottom: var(--sp-3);
		border-bottom: 1px solid var(--border-subtle);
	}

	.col-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.col-label {
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.col-count {
		margin-left: auto;
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.col-cards {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.thread-card {
		display: block;
		padding: var(--sp-4);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: inherit;
		transition: all var(--duration-fast) var(--ease-out);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.thread-card:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}

	.thread-card.dragging {
		opacity: 0.4;
	}

	.thread-card[draggable="true"] {
		cursor: grab;
	}

	.thread-card[draggable="true"]:active {
		cursor: grabbing;
	}

	.thread-title {
		font-size: 0.95rem;
		font-weight: 500;
		margin-bottom: var(--sp-2);
	}

	.thread-question {
		font-size: 0.8rem;
		color: var(--text-secondary);
		line-height: 1.45;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-bottom: var(--sp-3);
	}

	.thread-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.has-synthesis {
		color: var(--accent);
		font-size: 0.6rem;
	}

	/* List view */
	.list-view {
		display: flex;
		flex-direction: column;
	}

	.list-row {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-4) var(--sp-4);
		border-bottom: 1px solid var(--border-subtle);
		text-decoration: none;
		color: inherit;
		transition: background var(--duration-fast);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.list-row:hover {
		background: var(--bg-raised);
	}

	.row-status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.row-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row-title {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 500;
	}

	.row-question {
		font-size: 0.8rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-papers {
		font-size: 0.72rem;
		color: var(--text-tertiary);
		white-space: nowrap;
	}

	.row-status {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		width: 72px;
		text-align: right;
	}

	/* ── Tablet (≤1024px) ── */
	@media (max-width: 1024px) {
		.header-left h1 {
			font-size: 1.8rem;
		}

		.kanban {
			gap: var(--sp-3);
		}

		.thread-card {
			padding: var(--sp-3);
		}

		.new-thread-btn {
			min-height: 44px;
		}
	}

	/* ── Phone / small tablet (≤768px) ── */
	@media (max-width: 768px) {
		.kanban {
			grid-template-columns: 1fr;
			gap: var(--sp-4);
		}

		.page-header {
			flex-direction: column;
			gap: var(--sp-3);
		}

		.header-actions {
			width: 100%;
			justify-content: space-between;
		}
	}
</style>
