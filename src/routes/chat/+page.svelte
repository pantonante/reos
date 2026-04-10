<div class="landing">
	<div class="grain" aria-hidden="true"></div>
	<div class="content">
		<div class="ornament" aria-hidden="true">
			<svg width="36" height="36" viewBox="0 0 32 32" fill="none">
				<path
					d="M16 4 L18 14 L28 16 L18 18 L16 28 L14 18 L4 16 L14 14 Z"
					fill="currentColor"
				/>
			</svg>
		</div>
		<h1>Begin a thread<br /><em>of inquiry.</em></h1>
		<p class="sub">
			Pick a chat from the left, or start a new one. Each is grounded in your
			papers, your threads, and the open web.
		</p>
		<div class="hint">
			<span class="arrow" aria-hidden="true">←</span>
			<span>start from the chat list</span>
		</div>
	</div>
</div>

<style>
	.landing {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		position: relative;
		isolation: isolate;
		overflow: hidden;
	}

	.grain {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		opacity: 0.035;
		mix-blend-mode: screen;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	.content {
		position: relative;
		z-index: 1;
		text-align: center;
		max-width: 460px;
		padding: var(--sp-8) var(--sp-6);
	}

	.ornament {
		color: var(--accent);
		opacity: 0.85;
		display: inline-block;
		margin-bottom: var(--sp-4);
		animation:
			drift 6s ease-in-out infinite,
			rise 700ms var(--ease-out) both;
	}

	h1 {
		font-family: var(--font-display);
		font-size: 2.6rem;
		font-weight: 300;
		line-height: 1.15;
		letter-spacing: -0.02em;
		color: var(--text-primary);
		margin: 0 0 var(--sp-4);
		font-feature-settings: 'liga' on, 'dlig' on, 'onum' on;
		animation: rise 800ms 100ms var(--ease-out) both;
	}

	h1 em {
		color: var(--accent);
		font-style: italic;
	}

	.sub {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.05rem;
		line-height: 1.55;
		color: var(--text-tertiary);
		max-width: 38ch;
		margin: 0 auto var(--sp-8);
		animation: rise 900ms 200ms var(--ease-out) both;
	}

	.hint {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-4);
		border-top: 1px solid var(--border);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.8rem;
		color: var(--text-tertiary);
		font-feature-settings: 'liga' on;
		animation: rise 1000ms 300ms var(--ease-out) both;
	}

	.arrow {
		color: var(--accent);
		font-size: 1rem;
		font-style: normal;
		animation: nudge 2.4s ease-in-out infinite;
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

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes nudge {
		0%,
		100% {
			transform: translateX(0);
		}
		50% {
			transform: translateX(-3px);
		}
	}

	@media (max-width: 768px) {
		h1 {
			font-size: 2rem;
		}

		.sub {
			font-size: 0.95rem;
		}
	}
</style>
