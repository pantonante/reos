<script lang="ts">
	import '../app.css';
	import 'katex/dist/katex.min.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import PaperTabs from '$lib/components/PaperTabs.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import AddPaperModal from '$lib/components/AddPaperModal.svelte';
	import { ui, papers, threads, annotations, notes, chats } from '$lib/stores.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	const showTabs = $derived(ui.openPaperIds.length > 0);
	const isPaperRoute = $derived(page.url.pathname.startsWith('/paper/'));
	const isFullscreen = $derived(ui.pdfFullscreen && isPaperRoute);

	onMount(() => {
		papers.load();
		threads.load();
		annotations.load();
		notes.load();
		chats.load();
	});

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			ui.commandPaletteOpen = !ui.commandPaletteOpen;
		}
		// Escape exits fullscreen
		if (e.key === 'Escape' && ui.pdfFullscreen) {
			ui.pdfFullscreen = false;
		}
	}
</script>

<svelte:head>
	<title>Re:OS</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="app-shell" class:sidebar-collapsed={ui.sidebarCollapsed} class:fullscreen={isFullscreen}>
	<!-- Mobile top bar -->
	<div class="mobile-topbar">
		<button class="mobile-menu-btn" onclick={() => ui.mobileSidebarOpen = true} aria-label="Open menu">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
				<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
			</svg>
		</button>
		<span class="mobile-logo"><span class="logo-mark">Re:</span><span class="logo-text">OS</span></span>
		<button class="mobile-search-btn" onclick={() => ui.commandPaletteOpen = true} aria-label="Search">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
			</svg>
		</button>
	</div>

	<Sidebar />

	<!-- Mobile sidebar backdrop -->
	{#if ui.mobileSidebarOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="sidebar-backdrop" onclick={() => ui.mobileSidebarOpen = false}></div>
	{/if}

	<div class="main-area">
		{#if showTabs && !isFullscreen}
			<PaperTabs />
		{/if}
		<main class="main-content" class:no-padding={isPaperRoute}>
			{@render children()}
		</main>
	</div>
</div>

{#if ui.commandPaletteOpen}
	<CommandPalette />
{/if}

{#if ui.addPaperOpen}
	<AddPaperModal />
{/if}

<style>
	.app-shell {
		display: grid;
		grid-template-columns: var(--sidebar-width) 1fr;
		height: 100vh;
		height: 100dvh;
		transition: grid-template-columns var(--duration-normal) var(--ease-out);
	}

	.app-shell.sidebar-collapsed {
		grid-template-columns: var(--sidebar-collapsed) 1fr;
	}

	.app-shell.fullscreen {
		grid-template-columns: 1fr;
	}

	.app-shell.fullscreen :global(.sidebar) {
		display: none;
	}

	.app-shell.fullscreen :global(.pdf-header-bar) {
		display: none;
	}

	.main-area {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-height: 0;
		min-width: 0;
	}

	.main-content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: var(--sp-8);
		animation: fadeIn var(--duration-slow) var(--ease-out);
		min-height: 0;
	}

	.main-content.no-padding {
		padding: 0;
	}

	/* Mobile top bar — hidden on desktop */
	.mobile-topbar {
		display: none;
	}

	.sidebar-backdrop {
		display: none;
	}

	/* ── Tablet & Mobile (≤1024px) ── */
	@media (max-width: 768px) {
		.app-shell,
		.app-shell.sidebar-collapsed {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}

		.app-shell.fullscreen {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr;
		}

		.mobile-topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: var(--sp-2) var(--sp-4);
			background: var(--bg-raised);
			border-bottom: 1px solid var(--border);
			flex-shrink: 0;
			min-height: 48px;
			z-index: 10;
		}

		.app-shell.fullscreen .mobile-topbar {
			display: none;
		}

		.mobile-menu-btn,
		.mobile-search-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			border-radius: var(--radius-sm);
			color: var(--text-secondary);
			transition: background var(--duration-fast);
		}

		.mobile-menu-btn:hover,
		.mobile-search-btn:hover {
			background: var(--bg-hover);
		}

		.mobile-logo {
			font-family: var(--font-display);
			font-size: 1.2rem;
			font-weight: 600;
			letter-spacing: -0.03em;
		}

		.mobile-logo .logo-mark {
			color: var(--accent);
		}

		.mobile-logo .logo-text {
			color: var(--text-primary);
		}

		.sidebar-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
			z-index: 99;
			animation: fadeIn var(--duration-fast) var(--ease-out);
		}
	}
</style>
