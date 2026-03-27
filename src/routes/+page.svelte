<script lang="ts">
	import { papers } from '$lib/stores.svelte';
	import PaperCard from '$lib/components/PaperCard.svelte';

	const recentlyAdded = $derived(
		[...papers.items]
			.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
			.slice(0, 5)
	);

	const currentlyReading = $derived(
		papers.items.filter(p => p.readingStatus === 'reading')
	);

	const unread = $derived(
		papers.items.filter(p => p.readingStatus === 'unread')
	);
</script>

<div class="inbox">
	<header class="page-header">
		<h1>Inbox</h1>
		<p class="page-subtitle text-secondary">
			{unread.length} unread · {currentlyReading.length} in progress
		</p>
	</header>

	{#if currentlyReading.length > 0}
		<section class="section" style="animation-delay: 60ms">
			<h2 class="section-title">Currently Reading</h2>
			<div class="card-grid">
				{#each currentlyReading as paper, i}
					<div style="animation-delay: {80 + i * 40}ms">
						<PaperCard {paper} />
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if unread.length > 0}
		<section class="section" style="animation-delay: 120ms">
			<h2 class="section-title">Unread</h2>
			<div class="card-grid">
				{#each unread as paper, i}
					<div style="animation-delay: {140 + i * 40}ms">
						<PaperCard {paper} />
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="section" style="animation-delay: 180ms">
		<h2 class="section-title">Recently Added</h2>
		<div class="card-grid">
			{#each recentlyAdded as paper, i}
				<div style="animation-delay: {200 + i * 40}ms">
					<PaperCard {paper} />
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.inbox {
		max-width: 960px;
	}

	.page-header {
		margin-bottom: var(--sp-10);
	}

	.page-header h1 {
		font-size: 2.2rem;
		font-weight: 300;
		letter-spacing: -0.03em;
		margin-bottom: var(--sp-2);
	}

	.page-subtitle {
		font-size: 0.9rem;
	}

	.section {
		margin-bottom: var(--sp-10);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.section-title {
		font-size: 0.78rem;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-2);
		border-bottom: 1px solid var(--border-subtle);
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--sp-4);
	}
</style>
