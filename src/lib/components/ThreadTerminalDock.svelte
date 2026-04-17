<script lang="ts">
	import { onMount } from 'svelte';
	import Terminal from './Terminal.svelte';

	let {
		threadId,
		initialCollapsed = true,
		hint = '',
	}: {
		threadId: string;
		initialCollapsed?: boolean;
		hint?: string;
	} = $props();

	let collapsed = $state(initialCollapsed);
	let terminals = $state<string[]>([]);
	let activeId = $state<string | null>(null);
	let loading = $state(true);
	let busy = $state(false);
	let errorText = $state<string | null>(null);

	async function loadTerminals() {
		loading = true;
		errorText = null;
		try {
			const res = await fetch(`/api/threads/${threadId}/terminals`);
			if (!res.ok) {
				errorText = `failed to list terminals (${res.status})`;
				return;
			}
			const body = await res.json();
			terminals = Array.isArray(body?.terminals) ? body.terminals : [];
			if (terminals.length && !activeId) activeId = terminals[0];
		} finally {
			loading = false;
		}
	}

	async function newTerminal() {
		if (busy) return;
		busy = true;
		errorText = null;
		try {
			const res = await fetch(`/api/threads/${threadId}/terminals`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorText = body?.error ?? `failed to start terminal (${res.status})`;
				return;
			}
			const body = await res.json();
			if (typeof body?.id === 'string') {
				terminals = [...terminals, body.id];
				activeId = body.id;
				collapsed = false;
			}
		} finally {
			busy = false;
		}
	}

	async function closeTerminal(id: string, e?: Event) {
		e?.stopPropagation();
		if (busy) return;
		busy = true;
		try {
			await fetch(`/api/threads/${threadId}/terminals/${id}`, { method: 'DELETE' }).catch(() => null);
			terminals = terminals.filter(t => t !== id);
			if (activeId === id) activeId = terminals[0] ?? null;
		} finally {
			busy = false;
		}
	}

	function expand() {
		collapsed = false;
		if (terminals.length === 0 && !busy && !loading) void newTerminal();
	}

	function toggleCollapsed() {
		if (collapsed) expand();
		else collapsed = true;
	}

	onMount(() => {
		void loadTerminals();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="dock-root"
	style="flex: 0 0 {collapsed ? '32px' : '40vh'}; overflow: hidden; background: #1a1a1f; border-top: 1px solid #2a2a33; display: flex; flex-direction: column;"
	onclick={() => { if (collapsed) expand(); }}
>
	<header style="display: flex; align-items: center; height: 32px; flex-shrink: 0; padding: 0 8px; gap: 8px; cursor: pointer; user-select: none; font-size: 13px; color: #aaa; border-bottom: {collapsed ? 'none' : '1px solid #2a2a33'};">
		<button
			type="button"
			style="background: none; border: none; color: #888; padding: 3px 4px; cursor: pointer;"
			onclick={(e) => { e.stopPropagation(); toggleCollapsed(); }}
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate({collapsed ? 180 : 0}deg);">
				<polyline points="6 9 12 15 18 9"/>
			</svg>
		</button>
		<span style="font-family: ui-monospace, monospace; font-size: 0.72rem;">
			Terminal{collapsed ? ' — click to open' : ''}
		</span>
		<span style="flex: 1;"></span>
		{#if hint && !collapsed}
			<span style="color: #666; font-size: 0.7rem;">{hint}</span>
		{/if}
		<button
			type="button"
			style="background: none; border: none; color: #888; padding: 3px 4px; cursor: pointer;"
			onclick={(e) => { e.stopPropagation(); void newTerminal(); }}
			disabled={busy}
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" y1="5" x2="12" y2="19"/>
				<line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
		</button>
	</header>

	{#if !collapsed}
		<div style="flex: 1; min-height: 0; display: flex; position: relative; background: #0d0d10;">
			{#if loading}
				<div style="margin: auto; color: #888; font-size: 0.82rem;">Loading terminals…</div>
			{:else if terminals.length === 0}
				<button type="button" style="margin: auto; background: none; border: none; color: #888; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 6px;" onclick={() => void newTerminal()} disabled={busy}>
					+ {busy ? 'Starting…' : 'Start a terminal'}
				</button>
			{:else}
				{#each terminals as tid (tid)}
					<div style="position: absolute; inset: 0; display: flex; {tid !== activeId ? 'visibility: hidden; pointer-events: none;' : ''}">
						<Terminal threadId={threadId} terminalId={tid} />
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.dock {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		min-width: 0;
	}

	header {
		display: flex;
		align-items: center;
		padding: 0.3rem 0.5rem 0.3rem 0.35rem;
		gap: 0.5rem;
		height: 32px;
		flex-shrink: 0;
		background: var(--bg-raised, #1a1a1f);
		border-bottom: 1px solid var(--border, #2a2a33);
		font-size: 0.75rem;
		cursor: pointer;
		user-select: none;
		transition: background var(--duration-fast);
	}

	.dock.collapsed header {
		border-bottom: none;
	}

	.dock.collapsed header:hover {
		background: var(--bg-hover, #24242c);
	}

	.dock.collapsed header:hover .empty-label {
		color: var(--text-primary, #e5e5e5);
	}

	.dock.collapsed header:hover .toggle {
		color: var(--accent);
	}

	.toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px 4px;
		color: var(--text-tertiary, #888);
		border-radius: 3px;
		transition: color var(--duration-fast);
		flex-shrink: 0;
	}

	.toggle:hover {
		color: var(--accent);
		background: var(--bg-hover, rgba(255, 255, 255, 0.05));
	}

	.tabs {
		display: flex;
		align-items: stretch;
		gap: 2px;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}

	.tabs::-webkit-scrollbar { height: 0; }

	.empty-label {
		font-size: 0.72rem;
		color: var(--text-tertiary, #888);
		padding: 0.2rem 0.4rem;
		font-family: var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.04em;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.25rem 0.35rem 0.25rem 0.6rem;
		border-radius: 4px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.72rem;
		color: var(--text-tertiary, #888);
		background: transparent;
		transition: background var(--duration-fast), color var(--duration-fast);
		flex-shrink: 0;
	}

	.tab:hover {
		background: var(--bg-hover, rgba(255, 255, 255, 0.05));
		color: var(--text-secondary, #ccc);
	}

	.tab.active {
		background: var(--bg-base, #0d0d10);
		color: var(--text-primary, #e5e5e5);
	}

	.tab-label {
		white-space: nowrap;
	}

	.tab-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		color: var(--text-tertiary, #888);
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}

	.tab-close:hover {
		background: var(--bg-hover, rgba(255, 255, 255, 0.1));
		color: var(--text-primary, #e5e5e5);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.hint {
		color: var(--text-tertiary, #888);
		font-size: 0.7rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 40ch;
	}

	.error {
		color: var(--status-paused, #f59e0b);
		font-size: 0.7rem;
	}

	.add {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px 4px;
		color: var(--text-tertiary, #888);
		border-radius: 3px;
		transition: color var(--duration-fast);
	}

	.add:hover:not(:disabled) {
		color: var(--accent);
		background: var(--bg-hover, rgba(255, 255, 255, 0.05));
	}

	.add:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		position: relative;
		background: #0d0d10;
	}

	.placeholder,
	.spawn-cta {
		margin: auto;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.82rem;
		color: var(--text-tertiary, #888);
		padding: 0.5rem 1rem;
		border-radius: 4px;
	}

	.spawn-cta:hover:not(:disabled) {
		color: var(--accent);
		background: var(--bg-hover, rgba(255, 255, 255, 0.05));
	}

	.term-slot {
		position: absolute;
		inset: 0;
		display: flex;
	}

	.term-slot.hidden {
		/* Keep mounted so xterm state (scrollback, cursor) persists across tab
		   switches — just hide it. */
		visibility: hidden;
		pointer-events: none;
	}
</style>
