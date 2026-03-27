<script lang="ts">
	import { goto } from '$app/navigation';
	import { threads } from '$lib/stores.svelte';

	let { onclose }: { onclose: () => void } = $props();

	let title = $state('');
	let question = $state('');

	function handleSubmit() {
		if (!title.trim() || !question.trim()) return;

		const newThread = {
			id: `t${Date.now()}`,
			title: title.trim(),
			question: question.trim(),
			status: 'active' as const,
			papers: [],
			synthesis: '',
			parentThreadId: null,
			tags: [],
			links: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		threads.add(newThread);
		onclose();
		goto(`/threads/${newThread.id}`);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onclose}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>New Thread</h2>
		<p class="subtitle">Start a new research investigation</p>

		<form onsubmit={e => { e.preventDefault(); handleSubmit(); }}>
			<div class="field">
				<label class="field-label mono" for="thread-title">Title</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="thread-title"
					type="text"
					placeholder="e.g. Efficient LLM Inference"
					bind:value={title}
					autofocus
				/>
			</div>

			<div class="field">
				<label class="field-label mono" for="thread-question">Driving question</label>
				<textarea
					id="thread-question"
					placeholder="What question is this thread trying to answer?"
					bind:value={question}
					rows="3"
				></textarea>
			</div>

			<div class="actions">
				<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
				<button type="submit" class="btn-primary" disabled={!title.trim() || !question.trim()}>
					Create
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
		width: 500px;
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

	.btn-secondary:hover {
		background: var(--bg-hover);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
