<script lang="ts">
	import { papers, threads } from '$lib/stores.svelte';
	import { extractArxivId, fetchArxivPaper } from '$lib/arxiv';
	import type { Thread } from '$lib/types';

	let { thread, onclose }: { thread: Thread; onclose: () => void } = $props();

	let arxivInput = $state('');
	let contextNote = $state('');
	let loading = $state(false);
	let error = $state('');

	// PDF upload state
	let pdfFile = $state<File | null>(null);
	let dragging = $state(false);
	let dragDepth = 0;
	let extracting = $state(false);
	let extracted = $state(false);
	let metaTitle = $state('');
	let metaAuthors = $state('');
	let metaYear = $state('');
	let metaAbstract = $state('');

	function isEmpty() {
		return !arxivInput.trim()
			&& !contextNote.trim()
			&& !pdfFile
			&& !extracted
			&& !extracting;
	}

	function handleBackdropClick() {
		if (isEmpty()) onclose();
	}

	const existingPaperIds = $derived(new Set(thread.papers.map(tp => tp.paperId)));

	function addToThread(paperId: string) {
		const newPapers = [
			...thread.papers,
			{ paperId, contextNote: contextNote.trim(), order: thread.papers.length },
		];
		threads.update(thread.id, { papers: newPapers, updatedAt: new Date().toISOString() });
	}

	async function handleArxivSubmit() {
		error = '';
		const arxivId = extractArxivId(arxivInput);

		if (!arxivId) {
			error = 'Could not parse Arxiv ID. Try 2604.07209, arxiv:2604.07209, or a full arxiv.org / alphaxiv.org URL.';
			return;
		}

		// Check if already in library
		const existing = papers.items.find(p => p.arxivId === arxivId);
		if (existing) {
			if (existingPaperIds.has(existing.id)) {
				error = 'This paper is already in this thread.';
				return;
			}
			addToThread(existing.id);
			onclose();
			return;
		}

		loading = true;
		try {
			const newPaper = await fetchArxivPaper(arxivId);
			papers.add(newPaper);
			addToThread(newPaper.id);
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch from Arxiv.';
		} finally {
			loading = false;
		}
	}

	// PDF upload handlers
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		if (!dragging) dragging = true;
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragDepth++;
		dragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		dragDepth = 0;
		if (extracting || extracted) return;
		const file = e.dataTransfer?.files[0];
		if (file?.type === 'application/pdf') {
			pdfFile = file;
			error = '';
			extractMetadata(file);
		} else if (file) {
			error = 'Please drop a PDF file.';
		}
	}

	async function extractMetadata(file: File) {
		extracting = true;
		error = '';
		try {
			const formData = new FormData();
			formData.append('pdf', file);
			const res = await fetch('/api/papers/extract-pdf', {
				method: 'POST',
				body: formData,
			});
			if (!res.ok) throw new Error('Extraction failed');
			const data = await res.json();
			metaTitle = data.title || '';
			metaAuthors = (data.authors || []).join(', ');
			metaYear = data.year || '';
			metaAbstract = data.abstract || '';
			extracted = true;
		} catch {
			error = 'Failed to extract metadata. You can fill in the fields manually.';
			extracted = true;
		} finally {
			extracting = false;
		}
	}

	async function handlePdfSubmit() {
		if (!pdfFile) return;
		error = '';
		loading = true;

		try {
			const paperId = `p${Date.now()}`;
			const authorsArray = metaAuthors.split(',').map(a => a.trim()).filter(Boolean);

			const newPaper = {
				id: paperId,
				arxivId: '',
				title: metaTitle || pdfFile.name.replace(/\.pdf$/i, ''),
				authors: authorsArray,
				abstract: metaAbstract,
				publishedDate: metaYear ? `${metaYear}-01-01` : '',
				categories: [] as string[],
				tags: [] as string[],
				readingStatus: 'unread' as const,
				rating: null,
				pdfPath: `/papers/${paperId}.pdf`,
				arxivUrl: '',
				addedAt: new Date().toISOString(),
				citations: [] as string[],
				links: [] as string[],
				summary: null,
				summaryDate: null,
			};

			// Upload PDF file
			const formData = new FormData();
			formData.append('pdf', pdfFile);
			formData.append('paperId', paperId);
			const uploadRes = await fetch('/api/papers/upload-pdf', {
				method: 'POST',
				body: formData,
			});
			if (!uploadRes.ok) throw new Error('Failed to upload PDF');

			// Save paper to library and add to thread
			papers.add(newPaper);
			addToThread(paperId);
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add paper.';
		} finally {
			loading = false;
		}
	}

	function resetPdf() {
		pdfFile = null;
		extracted = false;
		extracting = false;
		metaTitle = '';
		metaAuthors = '';
		metaYear = '';
		metaAbstract = '';
		error = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal"
		onclick={(e) => e.stopPropagation()}
		ondragenter={handleDragEnter}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		<h2>Add Paper</h2>

		{#if extracting}
			<div class="extracting">
				<div class="spinner"></div>
				<p>Extracting metadata from PDF…</p>
				<p class="extract-hint">This may take a moment</p>
			</div>

		{:else if extracted}
			<!-- Extracted metadata - editable -->
			<p class="pdf-subtitle">Review and edit extracted metadata</p>
			<form onsubmit={e => { e.preventDefault(); handlePdfSubmit(); }}>
				<div class="meta-field">
					<label for="meta-title">Title</label>
					<input id="meta-title" type="text" bind:value={metaTitle} placeholder="Paper title" />
				</div>
				<div class="meta-field">
					<label for="meta-authors">Authors</label>
					<input id="meta-authors" type="text" bind:value={metaAuthors} placeholder="Author 1, Author 2, …" />
				</div>
				<div class="meta-row">
					<div class="meta-field">
						<label for="meta-year">Year</label>
						<input id="meta-year" type="text" bind:value={metaYear} placeholder="2024" />
					</div>
					<div class="meta-field file-name">
						<label>File</label>
						<span class="mono file-label">{pdfFile?.name}</span>
					</div>
				</div>
				<div class="meta-field">
					<label for="meta-abstract">Abstract</label>
					<textarea id="meta-abstract" bind:value={metaAbstract} placeholder="Paper abstract" rows="3"></textarea>
				</div>

				<div class="context-field">
					<label class="field-label mono" for="ctx-pdf">Context note (optional)</label>
					<textarea
						id="ctx-pdf"
						placeholder="Why is this paper relevant to this thread?"
						bind:value={contextNote}
						rows="2"
					></textarea>
				</div>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="actions">
					<button type="button" class="btn-secondary" onclick={resetPdf}>Back</button>
					<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
					<button type="submit" class="btn-primary" disabled={loading}>
						{loading ? 'Adding…' : 'Add Paper'}
					</button>
				</div>
			</form>

		{:else}
			<!-- Paste link or drop PDF -->
			<form onsubmit={e => { e.preventDefault(); handleArxivSubmit(); }}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					class="arxiv-input"
					placeholder="Paste an Arxiv ID or URL"
					bind:value={arxivInput}
					autofocus
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="context-field">
					<label class="field-label mono" for="ctx-combined">Context note (optional)</label>
					<textarea
						id="ctx-combined"
						placeholder="Why is this paper relevant to this thread?"
						bind:value={contextNote}
						rows="2"
					></textarea>
				</div>

				<p class="drop-hint-line">or drop a PDF anywhere on this dialog</p>

				<div class="actions">
					<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
					<button
						type="submit"
						class="btn-primary"
						disabled={loading || !arxivInput.trim()}
					>
						{loading ? 'Fetching…' : 'Add'}
					</button>
				</div>
			</form>
		{/if}

		{#if dragging && !extracting && !extracted}
			<div class="drop-overlay">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14 2 14 8 20 8"/>
					<line x1="12" y1="18" x2="12" y2="12"/>
					<polyline points="9 15 12 12 15 15"/>
				</svg>
				<span>Drop PDF to upload</span>
			</div>
		{/if}
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
		padding-top: 12vh;
		animation: fadeIn var(--duration-fast) var(--ease-out);
	}

	.modal {
		position: relative;
		width: 520px;
		max-width: 90vw;
		max-height: 80vh;
		overflow-y: auto;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--sp-8);
		animation: slideUp var(--duration-normal) var(--ease-out);
	}

	h2 {
		font-size: 1.3rem;
		margin-bottom: var(--sp-4);
	}

	.drop-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		background: var(--accent-muted);
		border: 2px dashed var(--accent);
		border-radius: var(--radius-lg);
		color: var(--accent);
		font-size: 0.95rem;
		font-weight: 500;
		pointer-events: none;
		z-index: 1;
	}

	.drop-hint-line {
		text-align: center;
		font-size: 0.75rem;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-4);
	}

	/* Arxiv input */
	.arxiv-input {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		font-family: var(--font-mono);
		font-size: 0.92rem;
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
	}

	.error {
		color: var(--status-unread);
		font-size: 0.82rem;
		margin-bottom: var(--sp-4);
	}

	/* Context note */
	.context-field {
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

	textarea {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		resize: vertical;
		line-height: 1.5;
	}

	/* PDF upload styles */
	.pdf-subtitle {
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin-bottom: var(--sp-4);
	}

	.extracting {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-10) 0;
		color: var(--text-secondary);
	}

	.extracting p {
		font-size: 0.9rem;
	}

	.extract-hint {
		font-size: 0.8rem !important;
		opacity: 0.6;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Metadata fields */
	.meta-field {
		margin-bottom: var(--sp-3);
		flex: 1;
	}

	.meta-field label {
		display: block;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin-bottom: var(--sp-1);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.meta-field input,
	.meta-field textarea {
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.9rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-base);
		color: var(--text-primary);
		font-family: inherit;
		resize: vertical;
	}

	.meta-field input:focus,
	.meta-field textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.meta-row {
		display: flex;
		gap: var(--sp-4);
	}

	.file-name {
		min-width: 0;
	}

	.file-label {
		font-size: 0.85rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
		padding: var(--sp-2) 0;
	}

	/* Actions */
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
	}

	.btn-secondary,
	.btn-primary {
		padding: var(--sp-2) var(--sp-5);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.btn-secondary { color: var(--text-secondary); }
	.btn-secondary:hover { background: var(--bg-hover); }

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
