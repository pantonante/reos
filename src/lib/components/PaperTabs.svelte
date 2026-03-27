<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ui, papers } from '$lib/stores.svelte';

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
</script>

<svelte:window onclick={closeContextMenu} />

{#if tabs.length > 0}
	<div class="paper-tabs">
		<div class="tabs-scroll">
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
	}

	.tabs-scroll {
		display: flex;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
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
</style>
