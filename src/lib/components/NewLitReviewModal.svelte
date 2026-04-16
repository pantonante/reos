<script lang="ts">
	import { goto } from '$app/navigation';
	import { threads, ui } from '$lib/stores.svelte';

	let title = $state('');
	let submitting = $state(false);
	let errorText = $state<string | null>(null);

	function close() {
		ui.newLitReviewOpen = false;
		title = '';
		errorText = null;
		submitting = false;
	}

	async function handleSubmit() {
		if (!title.trim() || submitting) return;
		submitting = true;
		errorText = null;
		const now = new Date().toISOString();
		const thread = {
			id: `t${Date.now()}`,
			title: title.trim(),
			question: '',
			status: 'active' as const,
			papers: [],
			synthesis: '',
			parentThreadId: null,
			tags: [],
			links: [],
			createdAt: now,
			updatedAt: now,
			threadType: 'literature-review' as const,
		};
		try {
			const res = await fetch('/api/threads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(thread),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorText = body?.error ?? 'Failed to create literature review thread.';
				submitting = false;
				return;
			}
			const stored = await res.json();
			await threads.reload();
			close();
			goto(`/threads/${stored.id}`);
		} catch (err) {
			errorText = (err as Error).message ?? 'Failed to create literature review thread.';
			submitting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !submitting) close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={() => { if (!submitting) close(); }}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>New Literature Review</h2>
		<p class="subtitle">A Claude Code terminal will open — type <code>/literature-review</code> there to start the workflow.</p>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
			<div class="field">
				<label class="field-label mono" for="litrev-title">Title</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="litrev-title"
					type="text"
					placeholder="e.g. State of the Art in Sparse Attention"
					bind:value={title}
					autofocus
					disabled={submitting}
				/>
			</div>

			{#if errorText}
				<div class="error">{errorText}</div>
			{/if}

			<div class="actions">
				<button type="button" class="btn-secondary" onclick={close} disabled={submitting}>Cancel</button>
				<button type="submit" class="btn-primary" disabled={!title.trim() || submitting}>
					{submitting ? 'Creating…' : 'Create'}
				</button>
			</div>
		</form>
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
		align-items: flex-start;
		justify-content: center;
		padding-top: 18vh;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.modal {
		width: 520px;
		max-width: 90vw;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--sp-8);
		animation: slideUp var(--duration-normal) var(--ease-out);
	}

	h2 {
		font-size: 1.3rem;
		margin-bottom: var(--sp-1);
	}

	.subtitle {
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin-bottom: var(--sp-6);
		line-height: 1.45;
	}

	.subtitle code {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		padding: 1px 5px;
		background: var(--bg-base);
		border: 1px solid var(--border);
		border-radius: 4px;
	}

	.field {
		margin-bottom: var(--sp-5);
	}

	.field-label {
		display: block;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	input, textarea {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		resize: vertical;
	}

	textarea {
		line-height: 1.5;
	}

	.error {
		margin-top: calc(var(--sp-2) * -1);
		margin-bottom: var(--sp-4);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--status-paused, #f59e0b) 14%, transparent);
		color: var(--text-primary);
		font-size: 0.82rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
		margin-top: var(--sp-6);
	}

	.btn-secondary,
	.btn-primary {
		padding: var(--sp-2) var(--sp-5);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.btn-secondary {
		color: var(--text-secondary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--bg-hover);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.btn-primary:disabled,
	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
