<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import PaperTabs from '$lib/components/PaperTabs.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import AddPaperModal from '$lib/components/AddPaperModal.svelte';
	import { ui, papers, threads, annotations, notes } from '$lib/stores.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	const showTabs = $derived(ui.openPaperIds.length > 0);

	onMount(() => {
		papers.load();
		threads.load();
		annotations.load();
		notes.load();
	});

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			ui.commandPaletteOpen = !ui.commandPaletteOpen;
		}
	}
</script>

<svelte:head>
	<title>Re:OS</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="app-shell" class:sidebar-collapsed={ui.sidebarCollapsed}>
	<Sidebar />
	<div class="main-area">
		{#if showTabs}
			<PaperTabs />
		{/if}
		<main class="main-content" class:no-padding={page.url.pathname.startsWith('/paper/')}>
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
		transition: grid-template-columns var(--duration-normal) var(--ease-out);
	}

	.app-shell.sidebar-collapsed {
		grid-template-columns: var(--sidebar-collapsed) 1fr;
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
</style>
