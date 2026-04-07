<script lang="ts">
	import { ui, papers } from '$lib/stores.svelte';

	type LogEntry = {
		paperId: string;
		title: string;
		status: 'done' | 'error';
		error?: string;
	};

	let total = $state(0);
	let current = $state(0);
	let phase = $state<'connecting' | 'running' | 'complete' | 'cancelled'>('connecting');
	let currentPaper = $state('');
	let currentStatus = $state('');
	let log = $state<LogEntry[]>([]);
	let succeeded = $state(0);
	let failed = $state(0);
	let controller: AbortController | null = null;
	let logEl: HTMLDivElement | undefined;

	function start() {
		controller = new AbortController();
		phase = 'connecting';
		total = 0;
		current = 0;
		log = [];
		succeeded = 0;
		failed = 0;

		fetch('/api/papers/batch-summary', {
			method: 'POST',
			signal: controller.signal,
		})
			.then(async (res) => {
				if (!res.ok || !res.body) {
					phase = 'complete';
					return;
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						try {
							const event = JSON.parse(line.slice(6));
							handleEvent(event);
						} catch {
							// Skip malformed events
						}
					}
				}
			})
			.catch((err) => {
				if (err.name === 'AbortError') {
					phase = 'cancelled';
				}
			});
	}

	function handleEvent(event: any) {
		switch (event.type) {
			case 'start':
				total = event.total;
				phase = total === 0 ? 'complete' : 'running';
				break;
			case 'progress':
				current = event.current;
				currentPaper = event.title;
				if (event.status === 'downloading') {
					currentStatus = 'Downloading PDF…';
				} else if (event.status === 'generating') {
					currentStatus = 'Generating summary…';
				} else if (event.status === 'done') {
					succeeded++;
					log = [...log, { paperId: event.paperId, title: event.title, status: 'done' }];
					scrollLog();
				} else if (event.status === 'error') {
					failed++;
					log = [
						...log,
						{ paperId: event.paperId, title: event.title, status: 'error', error: event.error },
					];
					scrollLog();
				}
				break;
			case 'complete':
				phase = 'complete';
				succeeded = event.succeeded;
				failed = event.failed;
				// Reload papers to pick up new summaries
				papers.reload();
				break;
		}
	}

	function scrollLog() {
		requestAnimationFrame(() => {
			if (logEl) logEl.scrollTop = logEl.scrollHeight;
		});
	}

	function cancel() {
		controller?.abort();
		phase = 'cancelled';
	}

	function close() {
		if (phase === 'running') {
			cancel();
		}
		ui.batchSummaryOpen = false;
	}

	$effect(() => {
		if (ui.batchSummaryOpen) {
			start();
		}
	});

	const progress = $derived(total > 0 ? (current / total) * 100 : 0);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onkeydown={(e) => e.key === 'Escape' && close()}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3>Generate Summaries</h3>
			<button class="close-btn" onclick={close} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			{#if phase === 'connecting'}
				<p class="status-text">Finding papers without summaries…</p>
			{:else if total === 0 && phase === 'complete'}
				<p class="status-text">All papers already have summaries.</p>
			{:else}
				<div class="progress-section">
					<div class="progress-header">
						<span class="progress-label">
							{#if phase === 'running'}
								{current} / {total}
							{:else if phase === 'complete'}
								Done — {succeeded} succeeded, {failed} failed
							{:else if phase === 'cancelled'}
								Cancelled — {succeeded} succeeded, {failed} failed
							{/if}
						</span>
						<span class="progress-pct">{Math.round(progress)}%</span>
					</div>
					<div class="progress-bar">
						<div class="progress-fill" style="width: {progress}%"></div>
					</div>
				</div>

				{#if phase === 'running' && currentPaper}
					<div class="current-paper">
						<span class="current-label">{currentStatus}</span>
						<span class="current-title">{currentPaper}</span>
					</div>
				{/if}

				{#if log.length > 0}
					<div class="log" bind:this={logEl}>
						{#each log as entry}
							<div class="log-entry" class:error={entry.status === 'error'}>
								<span class="log-icon">{entry.status === 'done' ? '✓' : '✗'}</span>
								<span class="log-title">{entry.title}</span>
								{#if entry.error}
									<span class="log-error">{entry.error}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		<div class="modal-footer">
			{#if phase === 'running'}
				<button class="btn btn-secondary" onclick={cancel}>Cancel</button>
			{:else}
				<button class="btn btn-primary" onclick={close}>Close</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.modal {
		width: 520px;
		max-width: 90vw;
		max-height: 80vh;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		animation: slideUp var(--duration-normal) var(--ease-out);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-5);
		border-bottom: 1px solid var(--border);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.close-btn {
		font-size: 1.4rem;
		color: var(--text-tertiary);
		line-height: 1;
		padding: 0 var(--sp-1);
	}

	.close-btn:hover {
		color: var(--text-primary);
	}

	.modal-body {
		padding: var(--sp-5);
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.status-text {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.progress-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.82rem;
		color: var(--text-secondary);
	}

	.progress-bar {
		height: 6px;
		background: var(--bg-base);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 3px;
		transition: width 0.3s var(--ease-out);
	}

	.current-paper {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-3);
		background: var(--bg-base);
		border-radius: var(--radius-sm);
	}

	.current-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
	}

	.current-title {
		font-size: 0.85rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.log {
		flex: 1;
		overflow-y: auto;
		max-height: 240px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.log-entry {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.82rem;
		border-radius: var(--radius-sm);
	}

	.log-icon {
		flex-shrink: 0;
		font-family: var(--font-mono);
		color: var(--accent);
	}

	.log-entry.error .log-icon {
		color: var(--status-unread);
	}

	.log-title {
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.log-error {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--status-unread);
		margin-left: auto;
	}

	.modal-footer {
		padding: var(--sp-4) var(--sp-5);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
	}

	.btn {
		padding: var(--sp-2) var(--sp-5);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--bg-base);
	}

	.btn-secondary {
		background: var(--bg-base);
		color: var(--text-secondary);
		border: 1px solid var(--border);
	}

	.btn-secondary:hover {
		background: var(--bg-hover);
	}
</style>
