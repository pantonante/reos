<script lang="ts">
	let {
		tool,
		input,
		result = null,
		isError = false,
		streaming = false,
	}: {
		tool: string;
		/** Already-parsed input object, OR a partial JSON string while streaming. */
		input: unknown;
		result?: string | null;
		isError?: boolean;
		streaming?: boolean;
	} = $props();

	let open = $state(false);

	const TOOL_LABELS: Record<string, { verb: string; glyph: string }> = {
		search_papers: { verb: 'searched the library', glyph: '⌕' },
		get_paper: { verb: 'opened a paper', glyph: '✦' },
		list_threads: { verb: 'listed threads', glyph: '☰' },
		get_thread: { verb: 'read a thread', glyph: '✦' },
		list_annotations: { verb: 'read annotations', glyph: '✎' },
		list_notes: { verb: 'read notes', glyph: '✎' },
		web_search: { verb: 'searched the web', glyph: '◯' },
		web_fetch: { verb: 'fetched a page', glyph: '◯' },
	};

	const meta = $derived(TOOL_LABELS[tool] ?? { verb: tool, glyph: '·' });

	const inputObj = $derived.by(() => {
		if (input == null) return null;
		if (typeof input === 'object') return input as Record<string, unknown>;
		try {
			return JSON.parse(input as string) as Record<string, unknown>;
		} catch {
			return null;
		}
	});

	const summary = $derived.by(() => {
		const obj = inputObj;
		if (!obj) return '';
		if (typeof obj.query === 'string') return `"${obj.query}"`;
		if (typeof obj.url === 'string') return obj.url;
		if (typeof obj.id === 'string') return obj.id;
		if (typeof obj.paperId === 'string') return obj.paperId;
		return '';
	});
</script>

<figure class="cite" class:error={isError} class:streaming>
	<button
		type="button"
		class="cite-header"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="glyph" aria-hidden="true">{meta.glyph}</span>
		<span class="verb">{meta.verb}</span>
		{#if summary}
			<span class="summary">{summary}</span>
		{/if}
		{#if streaming}
			<span class="streaming-bar" aria-label="working"></span>
		{/if}
	</button>
	{#if open && !streaming}
		<figcaption class="cite-body">
			{#if inputObj}
				<div class="row">
					<div class="row-label">Input</div>
					<pre class="code">{JSON.stringify(inputObj, null, 2)}</pre>
				</div>
			{/if}
			{#if result}
				<div class="row">
					<div class="row-label">Result</div>
					<pre class="code">{result}</pre>
				</div>
			{/if}
		</figcaption>
	{/if}
</figure>

<style>
	.cite {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--border-subtle);
		border-bottom: 1px solid var(--border-subtle);
		background: linear-gradient(
			180deg,
			rgba(212, 160, 83, 0.03) 0%,
			rgba(212, 160, 83, 0) 100%
		);
		font-family: var(--font-display);
	}

	.cite.error {
		border-color: var(--status-unread);
	}

	.cite-header {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-2) 0;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: var(--font-display);
		font-size: 0.92rem;
		color: var(--text-secondary);
		font-feature-settings: 'onum' on;
		transition: color var(--duration-fast) var(--ease-out);
		position: relative;
	}

	.cite-header:hover {
		color: var(--text-primary);
	}

	.glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.4em;
		font-size: 1rem;
		color: var(--accent);
		flex-shrink: 0;
	}

	.cite.streaming .glyph {
		animation: glyph-spin 2.6s linear infinite;
	}

	.verb {
		font-style: italic;
		flex-shrink: 0;
	}

	.summary {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-style: normal;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-tertiary);
	}

	/* A thin progress bar at the bottom of the header while the tool runs.
	   Subtler than a spinner — and on-brand for an editorial layout. */
	.streaming-bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 1px;
		background: var(--accent);
		transform-origin: left;
		animation: bar-sweep 1.6s ease-in-out infinite;
	}

	.cite-body {
		padding: var(--sp-2) 0 var(--sp-3) 1.4em;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		animation: drop 320ms var(--ease-out);
	}

	.row-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.72rem;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-1);
	}

	.code {
		margin: 0;
		padding: var(--sp-2) var(--sp-3);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.55;
		color: var(--text-secondary);
		max-height: 240px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}

	@keyframes glyph-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes bar-sweep {
		0% {
			transform: scaleX(0);
			opacity: 0.6;
		}
		50% {
			transform: scaleX(1);
			opacity: 1;
		}
		100% {
			transform: scaleX(0);
			opacity: 0.6;
			transform-origin: right;
		}
	}

	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
