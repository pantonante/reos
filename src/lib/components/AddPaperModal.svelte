<script lang="ts">
	import { ui, papers } from '$lib/stores.svelte';
	import { goto } from '$app/navigation';
	import { extractArxivId, fetchArxivPaper } from '$lib/arxiv';

	type Mode = 'arxiv' | 'pdf';

	let mode = $state<Mode>('arxiv');
	let input = $state('');
	let loading = $state(false);
	let error = $state('');
	let duplicate = $state<string | null>(null);

	// PDF upload state
	let pdfFile = $state<File | null>(null);
	let dragging = $state(false);
	let extracting = $state(false);
	let extracted = $state(false);

	// Editable metadata fields (used after extraction)
	let metaTitle = $state('');
	let metaAuthors = $state('');
	let metaYear = $state('');
	let metaAbstract = $state('');

	function reset() {
		input = '';
		loading = false;
		error = '';
		duplicate = null;
		pdfFile = null;
		dragging = false;
		extracting = false;
		extracted = false;
		metaTitle = '';
		metaAuthors = '';
		metaYear = '';
		metaAbstract = '';
	}

	function close() {
		ui.addPaperOpen = false;
		reset();
	}

	// -- Arxiv flow --
	async function handleArxivSubmit() {
		error = '';
		duplicate = null;
		const arxivId = extractArxivId(input);

		if (!arxivId) {
			error = 'Could not parse Arxiv ID. Try 2604.07209, arxiv:2604.07209, or a full arxiv.org / alphaxiv.org URL.';
			return;
		}

		const existing = papers.items.find(p => p.arxivId === arxivId);
		if (existing) {
			duplicate = existing.id;
			return;
		}

		loading = true;
		try {
			const newPaper = await fetchArxivPaper(arxivId);
			papers.add(newPaper);
			close();
			goto(`/paper/${newPaper.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch from Arxiv.';
		} finally {
			loading = false;
		}
	}

	function goToDuplicate() {
		if (duplicate) {
			close();
			goto(`/paper/${duplicate}`);
		}
	}

	// -- PDF upload flow --
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
			if (!res.ok) {
				throw new Error('Extraction failed');
			}
			const data = await res.json();
			metaTitle = data.title || '';
			metaAuthors = (data.authors || []).join(', ');
			metaYear = data.year || '';
			metaAbstract = data.abstract || '';
			extracted = true;
		} catch (e) {
			error = 'Failed to extract metadata. You can fill in the fields manually.';
			extracted = true; // Still show fields so user can fill manually
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
			const authorsArray = metaAuthors
				.split(',')
				.map(a => a.trim())
				.filter(Boolean);

			const newPaper = {
				id: paperId,
				arxivId: '',
				title: metaTitle || pdfFile.name.replace(/\.pdf$/i, ''),
				authors: authorsArray,
				abstract: metaAbstract,
				publishedDate: metaYear ? `${metaYear}-01-01` : '',
				categories: [],
				tags: [],
				readingStatus: 'unread' as const,
				rating: null,
				pdfPath: `/papers/${paperId}.pdf`,
				arxivUrl: '',
				addedAt: new Date().toISOString(),
				citations: [],
				links: [],
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
			if (!uploadRes.ok) {
				throw new Error('Failed to upload PDF');
			}

			// Save paper to store/db
			papers.add(newPaper);
			close();
			goto(`/paper/${paperId}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add paper.';
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={close}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>Add Paper</h2>

		<!-- Mode tabs -->
		<div class="mode-tabs">
			<button
				class="mode-tab"
				class:active={mode === 'arxiv'}
				onclick={() => { mode = 'arxiv'; error = ''; }}
			>Arxiv ID</button>
			<button
				class="mode-tab"
				class:active={mode === 'pdf'}
				onclick={() => { mode = 'pdf'; error = ''; }}
			>Upload PDF</button>
		</div>

		{#if mode === 'arxiv'}
			<!-- Arxiv flow -->
			<p class="subtitle">Paste an Arxiv ID or URL</p>
			<form onsubmit={e => { e.preventDefault(); handleArxivSubmit(); }}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					class="arxiv-input"
					placeholder="e.g. 2604.07209, arxiv:2604.07209, or arxiv.org/abs/..."
					bind:value={input}
					autofocus
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				{#if duplicate}
					<div class="duplicate-notice">
						<p>This paper is already in your library.</p>
						<button type="button" class="link-btn" onclick={goToDuplicate}>Go to paper →</button>
					</div>
				{/if}

				<div class="actions">
					<button type="button" class="btn-secondary" onclick={close}>Cancel</button>
					<button type="submit" class="btn-primary" disabled={loading || !input.trim()}>
						{loading ? 'Fetching…' : 'Add'}
					</button>
				</div>
			</form>
		{:else}
			<!-- PDF upload flow -->
			{#if !extracted && !extracting}
				<p class="subtitle">Drop a PDF or click to select</p>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="drop-zone"
					class:dragging
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					onclick={() => document.getElementById('pdf-file-input')?.click()}
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
					id="pdf-file-input"
					type="file"
					accept=".pdf,application/pdf"
					style="display:none"
					onchange={handleFileSelect}
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="actions">
					<button type="button" class="btn-secondary" onclick={close}>Cancel</button>
				</div>
			{:else if extracting}
				<div class="extracting">
					<div class="spinner"></div>
					<p>Extracting metadata from PDF…</p>
					<p class="extract-hint">This may take a moment</p>
				</div>
			{:else}
				<!-- Extracted metadata - editable -->
				<p class="subtitle">Review and edit extracted metadata</p>
				<form onsubmit={e => { e.preventDefault(); handlePdfSubmit(); }}>
					<div class="field">
						<label for="meta-title">Title</label>
						<input id="meta-title" type="text" bind:value={metaTitle} placeholder="Paper title" />
					</div>
					<div class="field">
						<label for="meta-authors">Authors</label>
						<input id="meta-authors" type="text" bind:value={metaAuthors} placeholder="Author 1, Author 2, …" />
					</div>
					<div class="field-row">
						<div class="field">
							<label for="meta-year">Year</label>
							<input id="meta-year" type="text" bind:value={metaYear} placeholder="2024" />
						</div>
						<div class="field file-name">
							<label>File</label>
							<span class="mono">{pdfFile?.name}</span>
						</div>
					</div>
					<div class="field">
						<label for="meta-abstract">Abstract</label>
						<textarea id="meta-abstract" bind:value={metaAbstract} placeholder="Paper abstract" rows="4"></textarea>
					</div>

					{#if error}
						<p class="error">{error}</p>
					{/if}

					<div class="actions">
						<button type="button" class="btn-secondary" onclick={() => { extracted = false; pdfFile = null; error = ''; }}>Back</button>
						<button type="button" class="btn-secondary" onclick={close}>Cancel</button>
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

	.mode-tabs {
		display: flex;
		gap: var(--sp-1);
		margin-bottom: var(--sp-5);
		border-bottom: 1px solid var(--border);
		padding-bottom: 0;
	}

	.mode-tab {
		padding: var(--sp-2) var(--sp-4);
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color var(--duration-fast), border-color var(--duration-fast);
	}

	.mode-tab:hover {
		color: var(--text-primary);
	}

	.mode-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.subtitle {
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin-bottom: var(--sp-4);
	}

	.arxiv-input {
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		font-family: var(--font-mono);
		font-size: 0.95rem;
		border-radius: var(--radius-md);
	}

	.error {
		color: var(--status-unread);
		font-size: 0.85rem;
		margin-top: var(--sp-3);
	}

	.duplicate-notice {
		margin-top: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--accent-muted);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
	}

	.duplicate-notice p {
		color: var(--accent);
		margin-bottom: var(--sp-2);
	}

	.link-btn {
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.link-btn:hover {
		text-decoration: underline;
	}

	/* Drop zone */
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

	/* Extracting state */
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
	.field {
		margin-bottom: var(--sp-4);
		flex: 1;
	}

	.field label {
		display: block;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin-bottom: var(--sp-1);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.field input,
	.field textarea {
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

	.field input:focus,
	.field textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.field-row {
		display: flex;
		gap: var(--sp-4);
	}

	.file-name {
		min-width: 0;
	}

	.file-name .mono {
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
		margin-top: var(--sp-6);
	}

	.btn-secondary,
	.btn-primary {
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

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
