<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ui, papers } from '$lib/stores.svelte';

	const unreadCount = $derived(papers.items.filter(p => p.readingStatus === 'unread' || p.readingStatus === 'reading').length);

	const navItems = $derived([
		{ href: '/', label: 'Inbox', icon: 'inbox' as const, badge: unreadCount },
		{ href: '/threads', label: 'Threads', icon: 'threads' as const, badge: 0 },
		{ href: '/library', label: 'Library', icon: 'library' as const, badge: 0 },
		{ href: '/graph', label: 'Graph', icon: 'graph' as const, badge: 0 },
	]);

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	function handleNavClick(e: MouseEvent, href: string) {
		// On mobile, close sidebar after navigating
		if (ui.mobileSidebarOpen) {
			e.preventDefault();
			ui.mobileSidebarOpen = false;
			goto(href);
		}
	}
</script>

<nav class="sidebar" class:collapsed={ui.sidebarCollapsed} class:mobile-open={ui.mobileSidebarOpen}>
	<div class="sidebar-header">
		<button class="logo-btn" onclick={() => ui.sidebarCollapsed = !ui.sidebarCollapsed}>
			<span class="logo-mark">Re:</span>
			{#if !ui.sidebarCollapsed}
				<span class="logo-text">OS</span>
			{/if}
		</button>
	</div>

	<div class="nav-section">
		{#each navItems as item}
			<a
				href={item.href}
				class="nav-item"
				class:active={isActive(item.href)}
				onclick={(e) => handleNavClick(e, item.href)}
			>
				<span class="nav-icon">
					{#if item.icon === 'inbox'}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
							<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
						</svg>
					{:else if item.icon === 'threads'}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 3v18"/>
							<path d="M5 8l7-5 7 5"/>
							<path d="M5 16l7 5 7-5"/>
						</svg>
					{:else if item.icon === 'library'}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
						</svg>
					{:else if item.icon === 'graph'}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="5" r="3"/>
							<circle cx="5" cy="19" r="3"/>
							<circle cx="19" cy="19" r="3"/>
							<line x1="12" y1="8" x2="5" y2="16"/>
							<line x1="12" y1="8" x2="19" y2="16"/>
						</svg>
					{/if}
				</span>
				{#if !ui.sidebarCollapsed}
					<span class="nav-label">{item.label}</span>
					{#if 'badge' in item && item.badge > 0}
						<span class="nav-badge">{item.badge}</span>
					{/if}
				{/if}
			</a>
		{/each}
	</div>

	<div class="sidebar-footer">
		<button class="nav-item" onclick={() => ui.commandPaletteOpen = true}>
			<span class="nav-icon">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="11" cy="11" r="8"/>
					<line x1="21" y1="21" x2="16.65" y2="16.65"/>
				</svg>
			</span>
			{#if !ui.sidebarCollapsed}
				<span class="nav-label">Search</span>
				<kbd class="kbd">⌘K</kbd>
			{/if}
		</button>
	</div>
</nav>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--bg-raised);
		border-right: 1px solid var(--border);
		height: 100vh;
		overflow: hidden;
		transition: width var(--duration-normal) var(--ease-out);
		min-width: 0;
		max-width: 100%;
	}

	.sidebar-header {
		padding: var(--sp-4) var(--sp-4) var(--sp-2);
	}

	.logo-btn {
		display: flex;
		align-items: baseline;
		gap: 0;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		transition: background var(--duration-fast);
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	.logo-btn:hover {
		background: var(--bg-hover);
	}

	.logo-mark {
		color: var(--accent);
	}

	.logo-text {
		color: var(--text-primary);
	}

	.nav-section {
		flex: 1;
		padding: var(--sp-2) var(--sp-3);
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.9rem;
		font-weight: 450;
		text-decoration: none;
		transition: all var(--duration-fast) var(--ease-out);
		white-space: nowrap;
	}

	.nav-item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.nav-item.active {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.nav-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
	}

	.nav-badge {
		margin-left: auto;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 0.7rem;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 10px;
		font-family: var(--font-mono);
	}

	.kbd {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-tertiary);
		background: var(--bg-base);
		padding: 1px 5px;
		border-radius: 3px;
		border: 1px solid var(--border);
	}

	.sidebar-footer {
		padding: var(--sp-3);
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.collapsed .nav-item {
		justify-content: center;
		padding: var(--sp-2);
	}

	.collapsed .nav-section,
	.collapsed .sidebar-footer {
		padding: var(--sp-2);
	}

	/* ── Tablet & Mobile (≤1024px) ── */
	@media (max-width: 1024px) {
		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			width: 260px;
			z-index: 100;
			transform: translateX(-100%);
			transition: transform var(--duration-normal) var(--ease-out);
			box-shadow: var(--shadow-lg);
		}

		.sidebar.mobile-open {
			transform: translateX(0);
		}

		/* Always show labels on mobile sidebar (never collapsed) */
		.sidebar.collapsed {
			width: 260px;
		}

		.sidebar.collapsed .nav-item {
			justify-content: flex-start;
			padding: var(--sp-2) var(--sp-3);
		}

		.sidebar.collapsed .nav-section,
		.sidebar.collapsed .sidebar-footer {
			padding: var(--sp-2) var(--sp-3);
		}

		/* Show labels and badges even if desktop mode was collapsed */
		.sidebar.collapsed .nav-label,
		.sidebar.collapsed .nav-badge,
		.sidebar.collapsed .logo-text,
		.sidebar.collapsed .kbd {
			display: inline;
		}

		.nav-item {
			min-height: 44px;
		}
	}
</style>
