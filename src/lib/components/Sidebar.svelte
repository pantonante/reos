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
		<button class="collapse-toggle" onclick={() => ui.sidebarCollapsed = !ui.sidebarCollapsed} title={ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
				<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
			</svg>
		</button>
		{#if !ui.sidebarCollapsed}
			<span class="logo"><span class="logo-mark">Re:</span><span class="logo-text">OS</span></span>
		{/if}
	</div>

	<div class="nav-section">
		{#each navItems as item}
			<a
				href={item.href}
				class="nav-item"
				class:active={isActive(item.href)}
				onclick={(e) => handleNavClick(e, item.href)}
				title={ui.sidebarCollapsed ? item.label : undefined}
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
					{#if ui.sidebarCollapsed && item.badge > 0}
						<span class="nav-badge-dot">{item.badge}</span>
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
		<button class="search-trigger" onclick={() => ui.commandPaletteOpen = true} title={ui.sidebarCollapsed ? 'Search (⌘K)' : undefined}>
			<svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="7"/>
				<line x1="16.5" y1="16.5" x2="21" y2="21"/>
			</svg>
			{#if !ui.sidebarCollapsed}
				<span class="search-label">Search…</span>
				<kbd class="search-kbd">⌘K</kbd>
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
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-4) var(--sp-2);
	}

	.collapse-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		transition: background var(--duration-fast), color var(--duration-fast);
	}

	.collapse-toggle:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.logo {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 600;
		letter-spacing: -0.03em;
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
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
	}

	.nav-badge-dot {
		position: absolute;
		top: -4px;
		right: -6px;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 0.6rem;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 8px;
		font-family: var(--font-mono);
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
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

	.sidebar-footer {
		padding: var(--sp-3);
	}

	.search-trigger {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		padding: 7px var(--sp-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-base);
		color: var(--text-tertiary);
		font-size: 0.82rem;
		font-family: var(--font-body);
		cursor: pointer;
		transition: border-color var(--duration-fast), background var(--duration-fast);
	}

	.search-trigger:hover {
		border-color: var(--text-tertiary);
		background: var(--bg-overlay);
	}

	.search-icon {
		flex-shrink: 0;
		opacity: 0.6;
	}

	.search-label {
		flex: 1;
		text-align: left;
	}

	.search-kbd {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-tertiary);
		background: var(--bg-raised);
		padding: 1px 5px;
		border-radius: 3px;
		border: 1px solid var(--border);
		line-height: 1.4;
	}

	.collapsed .sidebar-header {
		justify-content: center;
		padding: var(--sp-4) var(--sp-2) var(--sp-2);
	}

	.collapsed .nav-item {
		justify-content: center;
		padding: var(--sp-2);
	}

	.collapsed .nav-section {
		padding: var(--sp-2);
	}

	.collapsed .sidebar-footer {
		padding: var(--sp-2);
	}

	.collapsed .search-trigger {
		justify-content: center;
		padding: 7px;
		border-color: transparent;
		background: transparent;
	}

	.collapsed .search-trigger:hover {
		background: var(--bg-hover);
		border-color: transparent;
	}

	.collapsed .search-icon {
		opacity: 0.8;
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

		.sidebar.collapsed .nav-badge-dot {
			display: none;
		}

		/* Show labels and badges even if desktop mode was collapsed */
		.sidebar.collapsed .nav-label,
		.sidebar.collapsed .nav-badge,
		.sidebar.collapsed .logo,
		.sidebar.collapsed .search-label,
		.sidebar.collapsed .search-kbd {
			display: inline;
		}

		.sidebar.collapsed .search-trigger {
			justify-content: flex-start;
			padding: 7px var(--sp-3);
			border-color: var(--border);
			background: var(--bg-base);
		}

		.sidebar .collapse-toggle {
			display: none;
		}

		.nav-item {
			min-height: 44px;
		}
	}
</style>
