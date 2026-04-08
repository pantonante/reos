<script lang="ts">
	import { papers, threads } from '$lib/stores.svelte';
	import { extractArxivId, fetchArxivPaper } from '$lib/arxiv';
	import type { Thread } from '$lib/types';

	let { thread, onclose }: { thread: Thread; onclose: () => void } = $props();

	let mode = $state<'arxiv' | 'library' | 'pdf'>('arxiv');
	let arxivInput = $state('');
	let contextNote = $state('');
	let loading = $state(false);
	let error = $state('');
	let selectedPaperId = $state<string | null>(null);
	let searchQuery = $state('');

	// PDF upload state
	let pdfFile = $state<File | null>(null);
	let dragging = $state(false);
	let extracting = $state(false);
	let extracted = $state(false);
	let metaTitle = $state('');
	let metaAuthors = $state('');
	let metaYear = $state('');
	let metaAbstract = $state('');

	const existingPaperIds = $derived(new Set(thread.papers.map(tp => tp.paperId)));

	const availablePapers = $derived(
		papers.items.filter(p => {
			if (existingPaperIds.has(p.id)) return false;
			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase();
			return p.title.toLowerCase().includes(q) ||
				p.authors.some(a => a.toLowerCase().includes(q)) ||
				p.arxivId.includes(q);
		})
	);

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
			error = 'Could not parse Arxiv ID. Try 2401.12345 or a full arxiv.org/alphaxiv.org URL.';
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

	function handleLibraryAdd() {
		if (!selectedPaperId) return;
		addToThread(selectedPaperId);
		onclose();
	}

	// PDF upload handlers
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files[0];
		if (file?.type === 'application/pdf') {
			pdfFile = file;
			error = '';
			extractMetadata(file);
		} else {
			error = 'Please drop a PDF file.';
		}
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			pdfFile = file;
			error = '';
			extractMetadata(file);
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
<div class="modal-backdrop" onclick={onclose}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>Add Paper</h2>

		<div class="mode-tabs">
			<button class="mode-tab" class:active={mode === 'arxiv'} onclick={() => { mode = 'arxiv'; error = ''; }}>
				From Arxiv
			</button>
			<button class="mode-tab" class:active={mode === 'library'} onclick={() => { mode = 'library'; error = ''; }}>
				From Library
				{#if availablePapers.length > 0}
					<span class="tab-count mono">{availablePapers.length}</span>
				{/if}
			</button>
			<button class="mode-tab" class:active={mode === 'pdf'} onclick={() => { mode = 'pdf'; error = ''; }}>
				Upload PDF
			</button>
		</div>

		{#if mode === 'arxiv'}
			<form onsubmit={e => { e.preventDefault(); handleArxivSubmit(); }}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					class="arxiv-input"
					placeholder="Arxiv URL or ID, e.g. 2401.12345"
					bind:value={arxivInput}
					autofocus
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="context-field">
					<label class="field-label mono" for="ctx-arxiv">Context note (optional)</label>
					<textarea
						id="ctx-arxiv"
						placeholder="Why is this paper relevant to this thread?"
						bind:value={contextNote}
						rows="2"
					></textarea>
				</div>

				<div class="actions">
					<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
					<button type="submit" class="btn-primary" disabled={loading || !arxivInput.trim()}>
						{loading ? 'Fetching…' : 'Add'}
					</button>
				</div>
			</form>

		{:else if mode === 'library'}
			<input
				type="text"
				class="search-input"
				placeholder="Search your library…"
				bind:value={searchQuery}
			/>

			<div class="paper-list">
				{#each availablePapers as paper (paper.id)}
					<button
						class="paper-option"
						class:selected={selectedPaperId === paper.id}
						onclick={() => selectedPaperId = paper.id}
					>
						<span class="paper-option-title">{paper.title}</span>
						<span class="paper-option-meta mono">
							{paper.authors[0]}{paper.authors.length > 1 ? ' et al.' : ''}{paper.arxivId ? ` · ${paper.arxivId}` : ''}
						</span>
					</button>
				{:else}
					<p class="empty text-tertiary">
						{searchQuery ? 'No matching papers.' : availablePapers.length === 0 && papers.items.length === 0 ? 'Library is empty. Use "From Arxiv" to add papers.' : 'All library papers are already in this thread.'}
					</p>
				{/each}
			</div>

			{#if selectedPaperId}
				<div class="context-field">
					<label class="field-label mono" for="ctx-lib">Context note (optional)</label>
					<textarea
						id="ctx-lib"
						placeholder="Why is this paper relevant to this thread?"
						bind:value={contextNote}
						rows="2"
					></textarea>
				</div>
			{/if}

			<div class="actions">
				<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
				<button
					type="button"
					class="btn-primary"
					disabled={!selectedPaperId}
					onclick={handleLibraryAdd}
				>Add</button>
			</div>

		{:else}
			<!-- PDF upload flow -->
			{#if !extracted && !extracting}
				<p class="pdf-subtitle">Drop a PDF or click to select</p>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="drop-zone"
					class:dragging
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					onclick={() => document.getElementById('pdf-file-input-thread')?.click()}
				>
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
						<line x1="12" y1="18" x2="12" y2="12"/>
						<polyline points="9 15 12 12 15 15"/>
					</svg>
					<span>Drop PDF here</span>
					<span class="drop-hint">or click to browse</span>
				</div>
				<input
					id="pdf-file-input-thread"
					type="file"
					accept=".pdf,application/pdf"
					style="display:none"
					onchange={handleFileSelect}
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="actions">
					<button type="button" class="btn-secondary" onclick={onclose}>Cancel</button>
				</div>

			{:else if extracting}
				<div class="extracting">
					<div class="spinner"></div>
					<p>Extracting metadata from PDF…</p>
					<p class="extract-hint">This may take a moment</p>
				</div>

			{:else}
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
			{/if}
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

	/* Mode tabs */
	.mode-tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
		margin-bottom: var(--sp-5);
	}

	.mode-tab {
		padding: var(--sp-2) var(--sp-4);
		font-size: 0.85rem;
		color: var(--text-tertiary);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: all var(--duration-fast);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.mode-tab:hover { color: var(--text-secondary); }

	.mode-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.tab-count {
		font-size: 0.65rem;
		background: var(--bg-surface);
		padding: 0 5px;
		border-radius: 3px;
		color: var(--text-tertiary);
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

	/* Library search */
	.search-input {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
	}

	.paper-list {
		max-height: 220px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: var(--sp-5);
	}

	.paper-option {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-sm);
		text-align: left;
		transition: background var(--duration-fast);
	}

	.paper-option:hover { background: var(--bg-hover); }

	.paper-option.selected {
		background: var(--accent-muted);
		outline: 1px solid var(--accent);
	}

	.paper-option-title {
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-weight: 500;
		line-height: 1.3;
	}

	.paper-option-meta {
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.empty {
		text-align: center;
		padding: var(--sp-6) 0;
		font-size: 0.88rem;
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

	.drop-zone {
		border: 2px dashed var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-10) var(--sp-6);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		cursor: pointer;
		transition: border-color var(--duration-fast), background var(--duration-fast);
		color: var(--text-secondary);
		margin-bottom: var(--sp-4);
	}

	.drop-zone:hover,
	.drop-zone.dragging {
		border-color: var(--accent);
		background: var(--accent-muted);
		color: var(--accent);
	}

	.drop-zone span {
		font-size: 0.9rem;
	}

	.drop-hint {
		font-size: 0.8rem !important;
		opacity: 0.6;
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
