<div class="empty-state">
	<div class="empty-content">
		<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		</svg>
		<h2>Chat with Claude</h2>
		<p>Select an existing chat or create a new one to get started.</p>
	</div>
</div>

<style>
	.empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
	}

	.empty-content {
		text-align: center;
		color: var(--text-tertiary);
	}

	.empty-content svg {
		margin-bottom: var(--sp-4);
		opacity: 0.4;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--text-secondary);
		margin: 0 0 var(--sp-2);
	}

	p {
		font-size: 0.9rem;
		margin: 0;
	}
</style>
