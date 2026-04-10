<script lang="ts">
	let {
		paperTitle = null,
		onPick,
	}: {
		paperTitle?: string | null;
		onPick: (text: string) => void;
	} = $props();

	const generalPrompts = [
		'What did I read this week?',
		'Find papers about diffusion transformers',
		'Summarize my active threads',
	];

	const paperPrompts = [
		'Summarize the main contributions',
		'Explain the core method in plain terms',
		'What are the limitations?',
	];

	const prompts = $derived(paperTitle ? paperPrompts : generalPrompts);
</script>

<div class="empty">
	<div class="hero">
		<div class="ornament" aria-hidden="true">
			<svg width="32" height="32" viewBox="0 0 32 32" fill="none">
				<path d="M16 4 L18 14 L28 16 L18 18 L16 28 L14 18 L4 16 L14 14 Z" fill="currentColor" />
			</svg>
		</div>
		{#if paperTitle}
			<h1 class="lead">
				What would you like to know about
				<em>{paperTitle}</em>?
			</h1>
		{:else}
			<h1 class="lead">A research partner<br />for your library.</h1>
		{/if}
		<p class="sub">
			Ask anything. I can search papers, read threads, browse the web,
			and walk through arguments alongside you.
		</p>
	</div>

	<div class="prompts" aria-label="Suggested prompts">
		<div class="prompts-rule" aria-hidden="true">
			<span class="prompts-label">try asking</span>
		</div>
		<ul class="prompts-list">
			{#each prompts as p, i}
				<li>
					<button type="button" class="prompt" onclick={() => onPick(p)}>
						<span class="num" aria-hidden="true">{['i', 'ii', 'iii', 'iv'][i]}</span>
						<span class="text">{p}</span>
						<span class="arrow" aria-hidden="true">→</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-12);
		padding: var(--sp-12) var(--sp-6);
		max-width: 640px;
		margin: 0 auto;
		width: 100%;
	}

	.hero {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
	}

	.ornament {
		color: var(--accent);
		opacity: 0.85;
		animation:
			drift 6s ease-in-out infinite,
			rise-in 700ms var(--ease-out) both;
		margin-bottom: var(--sp-2);
	}

	.lead {
		font-family: var(--font-display);
		font-size: 2.4rem;
		line-height: 1.18;
		font-weight: 300;
		letter-spacing: -0.018em;
		color: var(--text-primary);
		margin: 0;
		font-feature-settings: 'liga' on, 'dlig' on, 'onum' on;
		max-width: 18ch;
		animation: rise-in 800ms 100ms var(--ease-out) both;
	}

	.lead em {
		color: var(--accent);
		font-style: italic;
	}

	.sub {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.02rem;
		line-height: 1.55;
		color: var(--text-tertiary);
		max-width: 42ch;
		margin: 0;
		animation: rise-in 900ms 200ms var(--ease-out) both;
	}

	.prompts {
		width: 100%;
		max-width: 480px;
		animation: rise-in 1000ms 300ms var(--ease-out) both;
	}

	.prompts-rule {
		position: relative;
		display: flex;
		justify-content: center;
		margin-bottom: var(--sp-4);
	}

	.prompts-rule::before,
	.prompts-rule::after {
		content: '';
		position: absolute;
		top: 50%;
		width: 80px;
		height: 1px;
		background: var(--border);
	}

	.prompts-rule::before {
		left: 50%;
		transform: translateX(-100%) translateX(-60px);
	}

	.prompts-rule::after {
		left: 50%;
		transform: translateX(60px);
	}

	.prompts-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.78rem;
		color: var(--text-tertiary);
		text-transform: lowercase;
		letter-spacing: 0.04em;
		padding: 0 var(--sp-3);
		background: var(--bg-base);
	}

	.prompts-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.prompt {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: var(--font-display);
		font-size: 0.98rem;
		color: var(--text-secondary);
		font-feature-settings: 'liga' on, 'dlig' on, 'onum' on;
		border-bottom: 1px solid var(--border-subtle);
		transition: all var(--duration-fast) var(--ease-out);
	}

	.prompt:hover {
		background: var(--bg-raised);
		color: var(--text-primary);
		padding-left: var(--sp-5);
	}

	.num {
		font-style: italic;
		color: var(--accent);
		font-size: 0.85rem;
		min-width: 1.6em;
		flex-shrink: 0;
	}

	.text {
		flex: 1;
	}

	.arrow {
		opacity: 0;
		color: var(--accent);
		transition: all var(--duration-fast) var(--ease-out);
		transform: translateX(-4px);
	}

	.prompt:hover .arrow {
		opacity: 1;
		transform: translateX(0);
	}

	@keyframes drift {
		0%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
		50% {
			transform: translateY(-3px) rotate(3deg);
		}
	}

	@keyframes rise-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.empty {
			gap: var(--sp-8);
			padding: var(--sp-6);
		}

		.lead {
			font-size: 1.8rem;
			max-width: 14ch;
		}

		.sub {
			font-size: 0.95rem;
		}
	}
</style>
