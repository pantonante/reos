<script lang="ts">
	let {
		title,
		message,
		onconfirm,
		oncancel,
	}: {
		title: string;
		message: string;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={oncancel}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>{title}</h2>
		<p class="message">{message}</p>
		<div class="actions">
			<button class="btn-secondary" onclick={oncancel}>Cancel</button>
			<button class="btn-danger" onclick={onconfirm}>Delete</button>
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
		align-items: flex-start;
		justify-content: center;
		padding-top: 18vh;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.modal {
		width: 420px;
		max-width: 90vw;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--sp-8);
		animation: slideUp var(--duration-normal) var(--ease-out);
	}

	h2 {
		font-size: 1.2rem;
		margin-bottom: var(--sp-3);
	}

	.message {
		color: var(--text-secondary);
		font-size: 0.9rem;
		line-height: 1.5;
		margin-bottom: var(--sp-6);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
	}

	.btn-secondary,
	.btn-danger {
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

	.btn-danger {
		background: var(--red);
		color: white;
	}

	.btn-danger:hover {
		filter: brightness(1.1);
	}
</style>
