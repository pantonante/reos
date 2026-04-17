<script lang="ts">
	import { marked } from 'marked';
	import SynthesisReferences from './SynthesisReferences.svelte';
	import type { Thread, AnnotatedReference } from '$lib/types';

	let {
		thread,
		editingSynthesis,
		synthesisInput = $bindable(''),
		onStartEdit,
		onSave,
		onCancelEdit,
		onupload,
	}: {
		thread: Thread;
		editingSynthesis: boolean;
		synthesisInput: string;
		onStartEdit: () => void;
		onSave: () => void;
		onCancelEdit: () => void;
		onupload: (ref: AnnotatedReference) => void;
	} = $props();

	// Match the first References/Bibliography heading
	const REF_HEADING_RE = /^#{1,6}\s+.*?(?:references?|bibliograph(?:y|ic|ical|ies)?).*$/im;

	function renderMarkdown(md: string): string {
		return marked.parse(md, { async: false }) as string;
	}

	const bodyMarkdown = $derived.by(() => {
		if (!thread.synthesis) return '';
		const match = thread.synthesis.match(REF_HEADING_RE);
		if (!match || match.index === undefined) return thread.synthesis;
		// Return everything before the References heading
		return thread.synthesis.slice(0, match.index).trimEnd();
	});

	const hasReferencesSection = $derived.by(() => {
		if (!thread.synthesis) return false;
		return REF_HEADING_RE.test(thread.synthesis);
	});
</script>

<div class="synthesis-view">
	<div class="synthesis-header">
		<h3 class="synthesis-label mono">Synthesis</h3>
		{#if !editingSynthesis}
			<button class="edit-btn" onclick={onStartEdit}>
				{thread.synthesis ? 'Edit' : 'Write'}
			</button>
		{/if}
	</div>

	{#if editingSynthesis}
		<textarea
			class="synthesis-textarea"
			bind:value={synthesisInput}
			rows="20"
			placeholder="Your running summary or conclusion…"
		></textarea>
		<div class="synthesis-actions">
			<button class="btn-ghost" onclick={onCancelEdit}>Cancel</button>
			<button class="btn-small" onclick={onSave}>Save</button>
		</div>
	{:else if thread.synthesis}
		<div class="synthesis-markdown">
			{#if hasReferencesSection}
				{@html renderMarkdown(bodyMarkdown)}
			{:else}
				{@html renderMarkdown(thread.synthesis)}
			{/if}
		</div>

		<SynthesisReferences threadId={thread.id} {onupload} />
	{:else}
		<p class="synthesis-empty text-tertiary">No synthesis yet. Open the terminal and ask Claude for a literature review.</p>
	{/if}
</div>

<style>
	.synthesis-view {
		padding: var(--sp-2) 0 var(--sp-8);
		animation: fadeIn var(--duration-slow) var(--ease-out) both;
	}

	.synthesis-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--sp-4);
	}

	.synthesis-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}

	.edit-btn {
		font-size: 0.78rem;
		color: var(--text-tertiary);
		transition: color var(--duration-fast);
	}

	.edit-btn:hover { color: var(--accent); }

	.synthesis-markdown {
		font-size: 0.95rem;
		line-height: 1.65;
		color: var(--text-primary);
	}

	.synthesis-markdown :global(h1),
	.synthesis-markdown :global(h2),
	.synthesis-markdown :global(h3),
	.synthesis-markdown :global(h4) {
		font-family: var(--font-display);
		font-weight: 500;
		letter-spacing: -0.02em;
		margin-top: var(--sp-6);
		margin-bottom: var(--sp-3);
		color: var(--text-primary);
	}

	.synthesis-markdown :global(h1) { font-size: 1.6rem; }
	.synthesis-markdown :global(h2) { font-size: 1.3rem; }
	.synthesis-markdown :global(h3) { font-size: 1.08rem; }
	.synthesis-markdown :global(h4) { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }

	.synthesis-markdown :global(p) {
		margin-bottom: var(--sp-4);
		color: var(--text-secondary);
	}

	.synthesis-markdown :global(ul),
	.synthesis-markdown :global(ol) {
		margin: 0 0 var(--sp-4) var(--sp-5);
		color: var(--text-secondary);
	}

	.synthesis-markdown :global(li) {
		margin-bottom: var(--sp-2);
		line-height: 1.6;
	}

	.synthesis-markdown :global(a) {
		color: var(--accent);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--accent) 35%, transparent);
		text-underline-offset: 2px;
	}

	.synthesis-markdown :global(a:hover) {
		text-decoration-color: var(--accent);
	}

	.synthesis-markdown :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--bg-raised);
		padding: 1px 6px;
		border-radius: 3px;
		border: 1px solid var(--border);
	}

	.synthesis-markdown :global(pre) {
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-3) var(--sp-4);
		overflow-x: auto;
		margin-bottom: var(--sp-4);
	}

	.synthesis-markdown :global(pre code) {
		background: none;
		border: none;
		padding: 0;
	}

	.synthesis-markdown :global(blockquote) {
		border-left: 3px solid var(--accent);
		padding-left: var(--sp-4);
		margin: 0 0 var(--sp-4) 0;
		color: var(--text-secondary);
		font-style: italic;
	}

	.synthesis-markdown :global(hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: var(--sp-6) 0;
	}

	.synthesis-markdown :global(table) {
		border-collapse: collapse;
		margin-bottom: var(--sp-4);
		font-size: 0.88rem;
	}

	.synthesis-markdown :global(th),
	.synthesis-markdown :global(td) {
		border: 1px solid var(--border);
		padding: var(--sp-2) var(--sp-3);
		text-align: left;
	}

	.synthesis-markdown :global(th) {
		background: var(--bg-raised);
		font-weight: 500;
	}

	.synthesis-empty { font-size: 0.88rem; }

	.synthesis-textarea {
		width: 100%;
		padding: var(--sp-3);
		border-radius: var(--radius-sm);
		font-size: 0.92rem;
		line-height: 1.6;
		resize: vertical;
		min-height: 80px;
	}

	.synthesis-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}

	.btn-ghost {
		font-size: 0.82rem;
		color: var(--text-secondary);
		padding: var(--sp-1) var(--sp-3);
		border-radius: var(--radius-sm);
	}

	.btn-ghost:hover {
		background: var(--bg-hover);
	}

	.btn-small {
		font-size: 0.82rem;
		padding: var(--sp-1) var(--sp-4);
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 500;
	}

	.btn-small:hover {
		background: var(--accent-hover);
	}
</style>
