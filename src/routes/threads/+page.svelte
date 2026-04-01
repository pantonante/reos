<script lang="ts">
	import { goto } from '$app/navigation';
	import { threads } from '$lib/stores.svelte';
	import NewThreadModal from '$lib/components/NewThreadModal.svelte';
	import type { Thread, ThreadStatus } from '$lib/types';
	import { tick } from 'svelte';

	let viewMode = $state<'kanban' | 'list'>('kanban');
	let showNewThread = $state(false);

	const columns: { status: ThreadStatus; label: string; color: string }[] = [
		{ status: 'active', label: 'Active', color: 'var(--status-active)' },
		{ status: 'paused', label: 'Paused', color: 'var(--status-paused)' },
		{ status: 'concluded', label: 'Concluded', color: 'var(--status-concluded)' },
	];

	function threadsByStatus(status: ThreadStatus): Thread[] {
		return threads.items.filter(t => t.status === status);
	}

	function paperCount(threadId: string) {
		const thread = threads.get(threadId);
		return thread?.papers.length ?? 0;
	}

	// ── Drag & drop ──
	// Layout: during a drag we build a virtual layout that shows where the
	// dragged card *would* land. This is a pure snapshot — not reactive state
	// that feeds back into effects.

	const DRAG_THRESHOLD = 6;

	let dragId = $state<string | null>(null);
	let ghostPos = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let dragOffset = { x: 0, y: 0 };

	// The virtual layout override: column -> ordered ids (including dragged card)
	// null when not dragging. Set imperatively, never read inside $effect/$derived.
	let layoutOverride = $state<Record<ThreadStatus, string[]> | null>(null);

	// Pending pointer down — not yet a drag
	let pending: { id: string; x: number; y: number; el: HTMLElement } | null = null;

	// Element registry for FLIP
	let cardEls = new Map<string, HTMLElement>();
	let prevRects = new Map<string, DOMRect>();

	function cardAction(node: HTMLElement, id: string) {
		cardEls.set(id, node);
		return {
			update(newId: string) { cardEls.delete(id); id = newId; cardEls.set(id, node); },
			destroy() { cardEls.delete(id); },
		};
	}

	function snapshot() {
		prevRects.clear();
		for (const [id, el] of cardEls) prevRects.set(id, el.getBoundingClientRect());
	}

	async function flip() {
		await tick();
		for (const [id, el] of cardEls) {
			const old = prevRects.get(id);
			if (!old) continue;
			const cur = el.getBoundingClientRect();
			const dx = old.left - cur.left;
			const dy = old.top - cur.top;
			if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
			el.style.transition = 'none';
			el.style.transform = `translate(${dx}px, ${dy}px)`;
			el.offsetHeight; // reflow
			el.style.transition = 'transform 250ms cubic-bezier(0.25, 0.8, 0.25, 1)';
			el.style.transform = '';
		}
	}

	// What to render for each column
	function displayThreads(status: ThreadStatus): Thread[] {
		if (layoutOverride) {
			return (layoutOverride[status] ?? [])
				.map(id => threads.get(id))
				.filter((t): t is Thread => t != null);
		}
		return threadsByStatus(status);
	}

	// Build initial layout snapshot from current data
	function buildLayout(): Record<ThreadStatus, string[]> {
		const out = {} as Record<ThreadStatus, string[]>;
		for (const col of columns) {
			out[col.status] = threadsByStatus(col.status).map(t => t.id);
		}
		return out;
	}

	function onPointerDown(e: PointerEvent, threadId: string) {
		if (e.button !== 0) return;
		e.preventDefault();
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		pending = { id: threadId, x: e.clientX, y: e.clientY, el };
	}

	function onPointerMove(e: PointerEvent) {
		if (pending && !dragId) {
			const dx = e.clientX - pending.x;
			const dy = e.clientY - pending.y;
			if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;

			// Activate drag
			const rect = pending.el.getBoundingClientRect();
			dragId = pending.id;
			ghostPos = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
			layoutOverride = buildLayout();
			snapshot();
			pending = null;
		}

		if (!dragId || !ghostPos || !layoutOverride) return;

		ghostPos = { ...ghostPos, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };

		// Find target column
		const cx = e.clientX;
		const cy = e.clientY;
		let targetCol: ThreadStatus | null = null;
		let bestDist = Infinity;

		for (const col of columns) {
			const el = document.querySelector(`[data-col="${col.status}"]`) as HTMLElement | null;
			if (!el) continue;
			const r = el.getBoundingClientRect();
			if (cx >= r.left - 30 && cx <= r.right + 30) {
				const d = Math.abs(cx - (r.left + r.width / 2));
				if (d < bestDist) { bestDist = d; targetCol = col.status; }
			}
		}
		if (!targetCol) {
			// fallback: nearest column
			for (const col of columns) {
				const el = document.querySelector(`[data-col="${col.status}"]`) as HTMLElement | null;
				if (!el) continue;
				const r = el.getBoundingClientRect();
				const d = Math.abs(cx - (r.left + r.width / 2));
				if (d < bestDist) { bestDist = d; targetCol = col.status; }
			}
		}
		if (!targetCol) return;

		// Find insert index
		const others = (layoutOverride[targetCol] ?? []).filter(id => id !== dragId);
		let insertIdx = others.length;
		for (let i = 0; i < others.length; i++) {
			const el = cardEls.get(others[i]);
			if (!el) continue;
			const r = el.getBoundingClientRect();
			if (cy < r.top + r.height / 2) { insertIdx = i; break; }
		}

		// Check if layout actually changed
		const newLayout = {} as Record<ThreadStatus, string[]>;
		for (const col of columns) {
			newLayout[col.status] = (layoutOverride[col.status] ?? []).filter(id => id !== dragId);
		}
		newLayout[targetCol].splice(insertIdx, 0, dragId);

		const changed = columns.some(col =>
			newLayout[col.status].length !== (layoutOverride![col.status] ?? []).length ||
			newLayout[col.status].some((id, i) => id !== layoutOverride![col.status][i])
		);

		if (changed) {
			snapshot();
			layoutOverride = newLayout;
			flip();
		}
	}

	function onPointerUp() {
		if (pending) {
			// Was a click, not a drag — navigate
			const id = pending.id;
			pending = null;
			goto(`/threads/${id}`);
			return;
		}

		if (!dragId || !layoutOverride) {
			dragId = null;
			ghostPos = null;
			layoutOverride = null;
			return;
		}

		// Find which column the dragged thread ended up in
		let newStatus: ThreadStatus | null = null;
		for (const col of columns) {
			if ((layoutOverride[col.status] ?? []).includes(dragId)) {
				newStatus = col.status;
				break;
			}
		}

		const thread = threads.get(dragId);
		if (thread && newStatus && thread.status !== newStatus) {
			threads.update(thread.id, { status: newStatus, updatedAt: new Date().toISOString() });
		}

		dragId = null;
		ghostPos = null;
		layoutOverride = null;
	}
</script>

<svelte:window onpointerup={onPointerUp} />

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

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#if viewMode === 'kanban'}
		<div
			class="kanban"
			class:is-dragging={dragId !== null}
			onpointermove={onPointerMove}
		>
			{#each columns as col, ci}
				<div
					class="kanban-col"
					class:drop-target={dragId !== null && layoutOverride !== null && (layoutOverride[col.status] ?? []).includes(dragId)}
					data-col={col.status}
					style="animation-delay: {ci * 60}ms"
				>
					<div class="col-header">
						<span class="col-dot" style="background: {col.color}"></span>
						<span class="col-label">{col.label}</span>
						<span class="col-count mono">{displayThreads(col.status).length}</span>
					</div>
					<div class="col-cards">
						{#each displayThreads(col.status) as thread, ti (thread.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="thread-card-wrapper"
								class:is-ghost={dragId === thread.id}
								use:cardAction={thread.id}
								onpointerdown={(e) => onPointerDown(e, thread.id)}
							>
								<div
									class="thread-card"
									style="animation-delay: {ci * 60 + ti * 40 + 80}ms"
								>
									<h3 class="thread-title">{thread.title}</h3>
									<p class="thread-question">{thread.question}</p>
									<div class="thread-meta">
										<span class="mono">{paperCount(thread.id)} papers</span>
										{#if thread.synthesis}
											<span class="has-synthesis" title="Has synthesis">●</span>
										{/if}
									</div>
								</div>
							</div>
						{/each}
						{#if displayThreads(col.status).length === 0 && dragId}
							<div class="empty-drop-zone">Drop here</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Floating drag ghost -->
		{#if ghostPos && dragId}
			{@const thread = threads.get(dragId)}
			{#if thread}
				<div
					class="drag-ghost"
					style="left: {ghostPos.x}px; top: {ghostPos.y}px; width: {ghostPos.w}px;"
				>
					<div class="thread-card ghost-card">
						<h3 class="thread-title">{thread.title}</h3>
						<p class="thread-question">{thread.question}</p>
						<div class="thread-meta">
							<span class="mono">{paperCount(thread.id)} papers</span>
						</div>
					</div>
				</div>
			{/if}
		{/if}
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

	/* ── Kanban ── */
	.kanban {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-5);
		user-select: none;
	}

	.kanban.is-dragging {
		cursor: grabbing;
	}

	.kanban-col {
		animation: slideUp var(--duration-slow) var(--ease-out) both;
		border-radius: var(--radius-md);
		padding: var(--sp-3);
		transition: background 200ms ease, box-shadow 200ms ease;
		min-height: 120px;
	}

	.kanban-col.drop-target {
		background: color-mix(in srgb, var(--accent) 5%, transparent);
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 25%, transparent);
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
		min-height: 40px;
	}

	/* ── Cards ── */
	.thread-card-wrapper {
		touch-action: none;
	}

	.thread-card-wrapper.is-ghost {
		opacity: 0.15;
		pointer-events: none;
	}

	.thread-card {
		padding: var(--sp-4);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: inherit;
		transition: border-color 150ms ease, box-shadow 150ms ease;
		animation: slideUp var(--duration-slow) var(--ease-out) both;
		cursor: grab;
	}

	.kanban.is-dragging .thread-card {
		cursor: grabbing;
	}

	.thread-card:hover {
		border-color: var(--accent);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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

	.empty-drop-zone {
		padding: var(--sp-6) var(--sp-4);
		border: 1.5px dashed color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: var(--radius-md);
		text-align: center;
		font-size: 0.78rem;
		color: var(--text-tertiary);
		background: color-mix(in srgb, var(--accent) 3%, transparent);
	}

	/* ── Drag ghost ── */
	.drag-ghost {
		position: fixed;
		z-index: 10000;
		pointer-events: none;
		opacity: 0.92;
		transform: rotate(1.5deg) scale(1.03);
		filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.18));
	}

	.drag-ghost .ghost-card {
		animation: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
	}

	/* ── List view ── */
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

	/* ── Mobile ── */
	@media (max-width: 768px) {
		.header-left h1 {
			font-size: 1.8rem;
		}

		.kanban {
			grid-template-columns: 1fr;
			gap: var(--sp-4);
		}

		.thread-card {
			padding: var(--sp-3);
		}

		.new-thread-btn {
			min-height: 44px;
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
