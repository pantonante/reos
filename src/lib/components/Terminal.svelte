<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import '@xterm/xterm/css/xterm.css';

	let { threadId, terminalId, onReady }: { threadId: string; terminalId: string; onReady?: () => void } = $props();

	let host = $state<HTMLDivElement | null>(null);
	let statusText = $state('connecting…');
	let wsState = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');

	// Hold instances on a ref so we can tear them down cleanly on unmount.
	let term: any = null;
	let fitAddon: any = null;
	let socket: WebSocket | null = null;
	let resizeObserver: ResizeObserver | null = null;

	async function setup() {
		if (!host) return;
		const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
			import('@xterm/xterm'),
			import('@xterm/addon-fit'),
		]);
		term = new XTerm({
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", monospace',
			fontSize: 13,
			theme: {
				background: '#0d0d10',
				foreground: '#e5e5e5',
				cursor: '#e5e5e5',
			},
			cursorBlink: true,
			convertEol: true,
			scrollback: 5000,
		});
		fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(host);
		try { fitAddon.fit(); } catch { /* ignore */ }

		resizeObserver = new ResizeObserver(() => {
			try {
				fitAddon?.fit();
				if (socket && socket.readyState === WebSocket.OPEN && term) {
					socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
				}
			} catch { /* ignore */ }
		});
		resizeObserver.observe(host);

		connectSocket();
	}

	function connectSocket() {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${proto}//${location.host}/ws/terminal/${encodeURIComponent(threadId)}/${encodeURIComponent(terminalId)}`;
		socket = new WebSocket(url);
		wsState = 'connecting';
		statusText = 'connecting…';

		socket.onopen = () => {
			wsState = 'open';
			statusText = 'connected';
			if (term && socket) {
				socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
			}
			onReady?.();
		};
		socket.onmessage = (e) => {
			term?.write(typeof e.data === 'string' ? e.data : '');
		};
		socket.onclose = () => {
			wsState = 'closed';
			statusText = 'disconnected';
		};
		socket.onerror = () => {
			wsState = 'error';
			statusText = 'error';
		};

		term?.onData((data: string) => {
			if (socket?.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: 'input', data }));
			}
		});
	}

	function reconnect() {
		try { socket?.close(); } catch { /* ignore */ }
		connectSocket();
	}

	onMount(() => {
		setup();
	});

	onDestroy(() => {
		try { socket?.close(); } catch { /* ignore */ }
		try { resizeObserver?.disconnect(); } catch { /* ignore */ }
		try { term?.dispose(); } catch { /* ignore */ }
	});
</script>

<div class="terminal-shell">
	<div class="status-bar">
		<span class="dot" class:open={wsState === 'open'} class:closed={wsState === 'closed'} class:error={wsState === 'error'}></span>
		<span class="status-label">claude · {statusText}</span>
		{#if wsState !== 'open'}
			<button type="button" class="reconnect" onclick={reconnect}>reconnect</button>
		{/if}
	</div>
	<div class="term-host" bind:this={host}></div>
</div>

<style>
	.terminal-shell {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		background: #0d0d10;
		border-radius: var(--radius-md, 8px);
		overflow: hidden;
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.75rem;
		background: #15151a;
		border-bottom: 1px solid #2a2a33;
		font-size: 0.72rem;
		color: #c0c0c8;
		font-family: ui-monospace, monospace;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #777;
		transition: background 0.2s;
	}
	.dot.open { background: #4ade80; }
	.dot.closed { background: #888; }
	.dot.error { background: #ef4444; }

	.status-label {
		flex: 1;
	}

	.reconnect {
		background: transparent;
		border: 1px solid #2a2a33;
		color: #c0c0c8;
		font-size: 0.7rem;
		padding: 0.1rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
	}
	.reconnect:hover {
		background: #1f1f27;
	}

	.term-host {
		flex: 1;
		min-height: 0;
		padding: 0.5rem;
	}

	.term-host :global(.xterm) {
		height: 100%;
	}
</style>
