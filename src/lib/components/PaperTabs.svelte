<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ui, papers } from '$lib/stores.svelte';
	import { tick } from 'svelte';

	const tabs = $derived(
		ui.openPaperIds
			.map(id => {
				const paper = papers.get(id);
				return paper ? { id, title: paper.title, arxivId: paper.arxivId } : null;
			})
			.filter(Boolean) as { id: string; title: string; arxivId: string }[]
	);

	const currentId = $derived(page.url.pathname.startsWith('/paper/') ? page.params.id : null);

	function closeTab(e: MouseEvent, id: string) {
		e.preventDefault();
		e.stopPropagation();
		const next = ui.closePaper(id);
		if (currentId === id) {
			goto(next ? `/paper/${next}` : '/');
		}
	}

	function onMiddleClick(e: MouseEvent, id: string) {
		if (e.button === 1) {
			closeTab(e, id);
		}
	}

	let contextMenuTab = $state<string | null>(null);
	let contextMenuPos = $state({ x: 0, y: 0 });

	function onContextMenu(e: MouseEvent, id: string) {
		e.preventDefault();
		contextMenuTab = id;
		contextMenuPos = { x: e.clientX, y: e.clientY };
	}

	function closeContextMenu() {
		contextMenuTab = null;
	}

	function handleCloseOthers() {
		if (contextMenuTab) {
			ui.closeOtherPapers(contextMenuTab);
			goto(`/paper/${contextMenuTab}`);
		}
		closeContextMenu();
	}

	function handleCloseAll() {
		ui.closeAllPapers();
		goto('/');
		closeContextMenu();
	}

	/* ── Overflow detection ── */
	let scrollContainer = $state<HTMLElement | null>(null);
	let hasOverflow = $state(false);
	let overflowOpen = $state(false);
	let overflowBtnEl = $state<HTMLElement | null>(null);

	function checkOverflow() {
		if (!scrollContainer) return;
		hasOverflow = scrollContainer.scrollWidth > scrollContainer.clientWidth + 2;
	}

	$effect(() => {
		if (!scrollContainer) return;
		const ro = new ResizeObserver(() => checkOverflow());
		ro.observe(scrollContainer);
		return () => ro.disconnect();
	});

	// Re-check when tabs change
	$effect(() => {
		tabs.length;
		tick().then(checkOverflow);
	});

	function toggleOverflow(e: MouseEvent) {
		e.stopPropagation();
		overflowOpen = !overflowOpen;
	}

	function closeOverflow() {
		overflowOpen = false;
	}

	function selectOverflowTab(id: string) {
		overflowOpen = false;
		goto(`/paper/${id}`);
	}
</script>

<svelte:window onclick={() => { closeContextMenu(); closeOverflow(); }} />

{#if tabs.length > 0}
	<div class="paper-tabs">
		<div class="tabs-scroll" bind:this={scrollContainer}>
			{#each tabs as tab (tab.id)}
				<a
					href="/paper/{tab.id}"
					class="tab"
					class:active={currentId === tab.id}
					onauxclick={(e) => onMiddleClick(e, tab.id)}
					oncontextmenu={(e) => onContextMenu(e, tab.id)}
					title={tab.title}
				>
					<span class="tab-title">{tab.title}</span>
					<button
						class="tab-close"
						onclick={(e) => closeTab(e, tab.id)}
						title="Close"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
							<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</a>
			{/each}
		</div>

		{#if hasOverflow}
			<div class="overflow-zone" bind:this={overflowBtnEl}>
				<button
					class="overflow-btn"
					onclick={toggleOverflow}
					title="Show all open papers ({tabs.length})"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
					</svg>
					<span class="overflow-count">{tabs.length}</span>
				</button>

				{#if overflowOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="overflow-dropdown" onclick={(e) => e.stopPropagation()}>
						<div class="overflow-header">
							<span class="overflow-label">Open papers</span>
							<span class="overflow-total">{tabs.length}</span>
						</div>
						<div class="overflow-list">
							{#each tabs as tab (tab.id)}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="overflow-item"
									class:active={currentId === tab.id}
									role="button"
									tabindex="0"
									onclick={() => selectOverflowTab(tab.id)}
									onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectOverflowTab(tab.id); }}
								>
									<span class="overflow-item-title">{tab.title}</span>
									<button
										class="overflow-item-close"
										onclick={(e) => closeTab(e, tab.id)}
										title="Close"
									>
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
											<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
										</svg>
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

{#if contextMenuTab}
	<div class="context-menu" style="left: {contextMenuPos.x}px; top: {contextMenuPos.y}px;">
		<button class="context-item" onclick={() => { if (contextMenuTab) { const next = ui.closePaper(contextMenuTab); if (currentId === contextMenuTab) goto(next ? `/paper/${next}` : '/'); } closeContextMenu(); }}>Close</button>
		<button class="context-item" onclick={handleCloseOthers}>Close Others</button>
		<button class="context-item" onclick={handleCloseAll}>Close All</button>
	</div>
{/if}

<style>
	.paper-tabs {
		background: var(--bg-raised);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		min-height: 0;
		display: flex;
		align-items: stretch;
	}

	.tabs-scroll {
		display: flex;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		flex: 1;
		min-width: 0;
	}

	.tabs-scroll::-webkit-scrollbar {
		display: none;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		padding-right: var(--sp-2);
		font-size: 0.78rem;
		color: var(--text-tertiary);
		text-decoration: none;
		border-right: 1px solid var(--border);
		white-space: nowrap;
		max-width: 200px;
		min-width: 0;
		flex-shrink: 0;
		transition: background var(--duration-fast), color var(--duration-fast);
		cursor: pointer;
	}

	.tab:hover {
		background: var(--bg-hover);
		color: var(--text-secondary);
	}

	.tab.active {
		background: var(--bg-base);
		color: var(--text-primary);
		border-bottom: 2px solid var(--accent);
		margin-bottom: -1px;
	}

	.tab-title {
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-body);
		font-weight: 450;
	}

	.tab-close {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		opacity: 0;
		transition: all var(--duration-fast);
	}

	.tab:hover .tab-close,
	.tab.active .tab-close {
		opacity: 1;
	}

	.tab-close:hover {
		background: var(--bg-surface);
		color: var(--text-primary);
	}

	/* ── Overflow menu ── */
	.overflow-zone {
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: stretch;
		border-left: 1px solid var(--border);
	}

	.overflow-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 var(--sp-3);
		color: var(--text-tertiary);
		transition: background var(--duration-fast), color var(--duration-fast);
		cursor: pointer;
	}

	.overflow-btn:hover {
		background: var(--bg-hover);
		color: var(--text-secondary);
	}

	.overflow-count {
		font-size: 0.68rem;
		font-family: var(--font-mono);
		font-weight: 500;
		color: var(--accent);
		letter-spacing: -0.02em;
	}

	.overflow-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 1000;
		min-width: 280px;
		max-width: 360px;
		background: var(--bg-overlay);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		animation: overflow-in 120ms ease-out;
	}

	@keyframes overflow-in {
		from { opacity: 0; transform: translateY(-4px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.overflow-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--border);
	}

	.overflow-label {
		font-size: 0.7rem;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
	}

	.overflow-total {
		font-size: 0.68rem;
		font-family: var(--font-mono);
		color: var(--accent);
		background: var(--accent-muted);
		padding: 1px 6px;
		border-radius: 8px;
	}

	.overflow-list {
		max-height: 320px;
		overflow-y: auto;
		padding: var(--sp-1);
	}

	.overflow-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		text-align: left;
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.78rem;
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
		transition: background var(--duration-fast), color var(--duration-fast);
		cursor: pointer;
	}

	.overflow-item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.overflow-item.active {
		color: var(--accent);
		background: var(--accent-muted);
	}

	.overflow-item-title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-body);
		font-weight: 450;
	}

	.overflow-item-close {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		opacity: 0;
		transition: all var(--duration-fast);
	}

	.overflow-item:hover .overflow-item-close {
		opacity: 1;
	}

	.overflow-item-close:hover {
		background: var(--bg-surface);
		color: var(--text-primary);
	}

	/* Context menu */
	.context-menu {
		position: fixed;
		background: var(--bg-overlay);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-md);
		z-index: 1000;
		min-width: 140px;
		padding: var(--sp-1);
	}

	.context-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.78rem;
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
		transition: all var(--duration-fast);
	}

	.context-item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	@media (max-width: 768px) {
		.tab {
			padding: var(--sp-3) var(--sp-4);
			padding-right: var(--sp-3);
			font-size: 0.82rem;
			max-width: 180px;
			min-height: 44px;
		}

		/* Always show close button on touch */
		.tab-close {
			opacity: 1;
		}

		.overflow-item-close {
			opacity: 1;
		}
	}

	@media (max-width: 480px) {
		.tab {
			max-width: 140px;
			padding: var(--sp-2) var(--sp-3);
		}

		.overflow-dropdown {
			min-width: 240px;
		}
	}
</style>
