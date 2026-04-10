<script lang="ts">
	let {
		text,
		live = false,
	}: {
		text: string;
		live?: boolean;
	} = $props();

	let open = $state(false);
</script>

<aside class="reasoning" class:live>
	<button
		type="button"
		class="reasoning-summary"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="mark" aria-hidden="true">§</span>
		<span class="label">{live ? 'thinking' : 'thought'}</span>
		{#if live}
			<span class="ellipsis"><i></i><i></i><i></i></span>
		{/if}
	</button>
	{#if open}
		<div class="reasoning-body">
			<div class="reasoning-text">{text}</div>
		</div>
	{/if}
</aside>

<style>
	.reasoning {
		font-family: var(--font-display);
	}

	.reasoning-summary {
		display: inline-flex;
		align-items: baseline;
		gap: var(--sp-2);
		background: none;
		border: none;
		padding: 0;
		color: var(--text-tertiary);
		font-style: italic;
		font-size: 0.92rem;
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-out);
		font-feature-settings: 'onum' on;
	}

	.reasoning-summary:hover {
		color: var(--text-secondary);
	}

	.reasoning.live .reasoning-summary {
		color: var(--accent);
	}

	.mark {
		font-size: 1.05rem;
		font-style: normal;
		opacity: 0.65;
	}

	.reasoning.live .mark {
		opacity: 1;
		animation: marker-pulse 2.4s ease-in-out infinite;
	}

	.label {
		letter-spacing: 0.01em;
	}

	.ellipsis {
		display: inline-flex;
		gap: 2px;
		margin-left: 4px;
	}

	.ellipsis i {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: currentColor;
		animation: ellipsis-pulse 1.4s ease-in-out infinite;
	}

	.ellipsis i:nth-child(2) {
		animation-delay: 0.18s;
	}

	.ellipsis i:nth-child(3) {
		animation-delay: 0.36s;
	}

	.reasoning-body {
		margin-top: var(--sp-2);
		padding-left: var(--sp-4);
		border-left: 1px solid var(--border);
		animation: fade 280ms var(--ease-out);
	}

	.reasoning-text {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.86rem;
		line-height: 1.65;
		color: var(--text-secondary);
		white-space: pre-wrap;
		max-height: 320px;
		overflow-y: auto;
		padding: var(--sp-1) 0;
	}

	@keyframes marker-pulse {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}

	@keyframes ellipsis-pulse {
		0%,
		60%,
		100% {
			opacity: 0.3;
			transform: translateY(0);
		}
		30% {
			opacity: 1;
			transform: translateY(-1px);
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
