<script lang="ts">
	import { page } from '$app/state';
	import { ui, papers, threads, annotations, notes } from '$lib/stores.svelte';
	import type { ReadingStatus, AnnotationType } from '$lib/types';
	import PdfViewer from '$lib/components/PdfViewer.svelte';
	import { marked } from 'marked';

	const paper = $derived(papers.get(page.params.id));

	// Mobile context panel state
	let mobileContextOpen = $state(false);

	function toggleFullscreen() {
		ui.pdfFullscreen = !ui.pdfFullscreen;
		if (ui.pdfFullscreen) mobileContextOpen = false;
	}

	// Register this paper as open in the tab bar
	$effect(() => {
		const id = page.params.id;
		if (id) ui.openPaper(id);
	});

	const paperThreads = $derived(
		threads.items.filter(t => t.papers.some(tp => tp.paperId === page.params.id))
	);

	const paperAnnotations = $derived(
		annotations.items.filter(a => a.paperId === page.params.id)
	);

	const citedPapers = $derived(
		paper?.citations.map(id => papers.get(id)).filter(Boolean) ?? []
	);

	const paperNotes = $derived(
		notes.items.filter(n => n.paperId === page.params.id)
	);

	let activeTab = $state<'summary' | 'info' | 'annotations' | 'notes' | 'threads'>('summary');
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);

	const summaryHtml = $derived(paper?.summary ? marked(paper.summary) : '');

	async function generateSummary(regenerate = false) {
		if (!paper || summaryLoading) return;
		summaryLoading = true;
		summaryError = null;
		try {
			const res = await fetch('/api/papers/summary', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: paper.id, regenerate }),
			});
			const data = await res.json();
			if (!res.ok) {
				summaryError = data.error || 'Failed to generate summary';
			} else {
				papers.update(paper.id, { summary: data.summary, summaryDate: data.summaryDate });
			}
		} catch (err: any) {
			summaryError = err.message || 'Network error';
		} finally {
			summaryLoading = false;
		}
	}
	let noteInput = $state('');
	let editingTags = $state(false);
	let tagInput = $state('');

	// Annotation creation state
	let annotationModal = $state<{ selectedText: string; page: number } | null>(null);
	let annotationComment = $state('');
	let annotationType = $state<AnnotationType>('highlight');
	let annotationColor = $state('#d4a05340');

	const colorOptions = [
		{ value: '#d4a05340', label: 'Yellow' },
		{ value: '#6abf8a40', label: 'Green' },
		{ value: '#5a9ad440', label: 'Blue' },
		{ value: '#d45a8a40', label: 'Pink' },
	];

	const statusOptions: { value: ReadingStatus; label: string }[] = [
		{ value: 'unread', label: 'Unread' },
		{ value: 'reading', label: 'Reading' },
		{ value: 'read', label: 'Read' },
		{ value: 'archived', label: 'Archived' },
	];

	function setStatus(status: ReadingStatus) {
		if (paper) papers.update(paper.id, { readingStatus: status });
	}

	function setRating(rating: number) {
		if (paper) papers.update(paper.id, { rating: paper.rating === rating ? null : rating });
	}

	function addTag() {
		if (paper && tagInput.trim()) {
			const newTags = [...paper.tags, tagInput.trim().toLowerCase()];
			papers.update(paper.id, { tags: [...new Set(newTags)] });
			tagInput = '';
		}
	}

	function removeTag(tag: string) {
		if (paper) {
			papers.update(paper.id, { tags: paper.tags.filter(t => t !== tag) });
		}
	}

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
	}

	const annotationTypeIcons: Record<string, string> = {
		highlight: '◆',
		note: '✎',
		question: '?',
		'cross-reference': '⇄',
	};

	function openAnnotationModal(selectedText: string, pageNum: number) {
		annotationModal = { selectedText, page: pageNum };
		annotationComment = '';
		annotationType = 'highlight';
		annotationColor = '#d4a05340';
		// Switch to annotations tab to show context
		activeTab = 'annotations';
	}

	function saveAnnotation() {
		if (!paper || !annotationModal) return;
		const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
		annotations.add({
			id,
			paperId: paper.id,
			threadId: null,
			type: annotationType,
			content: annotationComment,
			selectedText: annotationModal.selectedText,
			page: annotationModal.page,
			color: annotationColor,
			createdAt: new Date().toISOString(),
		});
		annotationModal = null;
	}

	function cancelAnnotation() {
		annotationModal = null;
	}

	function deleteAnnotation(id: string) {
		annotations.remove(id);
	}

	function scrollToAnnotation(ann: any) {
		activeTab = 'annotations';
	}

	// Editing existing annotation
	let editingAnnotationId = $state<string | null>(null);
	let editContent = $state('');

	function startEditAnnotation(ann: any) {
		editingAnnotationId = ann.id;
		editContent = ann.content;
	}

	function saveEditAnnotation() {
		if (!editingAnnotationId) return;
		annotations.update(editingAnnotationId, { content: editContent });
		editingAnnotationId = null;
	}

	function cancelEditAnnotation() {
		editingAnnotationId = null;
	}

	function addNote() {
		if (!paper || !noteInput.trim()) return;
		const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
		notes.add({
			id,
			paperId: paper.id,
			content: noteInput.trim(),
			createdAt: new Date().toISOString(),
		});
		noteInput = '';
	}

	function deleteNote(id: string) {
		notes.remove(id);
	}

	function formatNoteTime(date: string) {
		return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}
</script>

{#if !paper}
	<div class="not-found">
		<h2>Paper not found</h2>
		<a href="/library">← Back to library</a>
	</div>
{:else}
	<div class="paper-detail" class:fullscreen={ui.pdfFullscreen}>
		<div class="reader-layout" class:fullscreen={ui.pdfFullscreen}>
			<!-- PDF panel (left) -->
			<div class="pdf-panel">
				<div class="pdf-header-bar">
					<span class="mono">{paper.arxivId}</span>
					<div class="pdf-header-actions">
						<a href="https://arxiv.org/pdf/{paper.arxivId}" target="_blank" rel="noopener" class="pdf-action mono">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
							<span class="action-label">Open PDF</span>
						</a>
						<a href={paper.arxivUrl} target="_blank" rel="noopener" class="pdf-action mono">arxiv ↗</a>
					</div>
				</div>
				{#each ui.openPaperIds as openId (openId)}
					{@const openPaper = papers.get(openId)}
					{#if openPaper}
						<div class="pdf-slot" class:active={openId === page.params.id}>
							<PdfViewer
								arxivId={openPaper.arxivId}
								annotations={annotations.items.filter(a => a.paperId === openId)}
								onCreateAnnotation={openAnnotationModal}
								onClickAnnotation={scrollToAnnotation}
								onToggleFullscreen={toggleFullscreen}
								isFullscreen={ui.pdfFullscreen}
							/>
						</div>
					{/if}
				{/each}
			</div>

			<!-- Mobile context toggle (floating button) -->
			<button
				class="mobile-context-toggle"
				class:active={mobileContextOpen}
				onclick={() => mobileContextOpen = !mobileContextOpen}
				aria-label="Toggle paper details"
			>
				{#if mobileContextOpen}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
					</svg>
				{/if}
			</button>

			<!-- Context panel (right) -->
			<div class="context-panel" class:mobile-open={mobileContextOpen}>
				<div class="panel-tabs">
					{#each ['summary', 'info', 'annotations', 'notes', 'threads'] as tab}
						<button
							class="panel-tab"
							class:active={activeTab === tab}
							onclick={() => activeTab = tab as typeof activeTab}
						>
							{tab.charAt(0).toUpperCase() + tab.slice(1)}
							{#if tab === 'annotations' && paperAnnotations.length > 0}
								<span class="tab-count">{paperAnnotations.length}</span>
							{:else if tab === 'notes' && paperNotes.length > 0}
								<span class="tab-count">{paperNotes.length}</span>
							{/if}
						</button>
					{/each}
				</div>

				<div class="panel-content">
					{#if activeTab === 'summary'}
						<div class="summary-tab">
							{#if paper.summary}
								<div class="summary-content markdown-body">
									{@html summaryHtml}
								</div>
								<div class="summary-footer">
									{#if paper.summaryDate}
										<span class="summary-date text-tertiary">Generated {new Date(paper.summaryDate).toLocaleDateString()}</span>
									{/if}
									<button class="btn-regenerate" onclick={() => generateSummary(true)} disabled={summaryLoading}>
										{summaryLoading ? 'Regenerating...' : 'Regenerate'}
									</button>
								</div>
							{:else if summaryLoading}
								<div class="summary-loading">
									<div class="spinner"></div>
									<p class="text-tertiary">Generating summary with Claude...</p>
									<p class="text-tertiary" style="font-size: 0.75rem; margin-top: var(--sp-2);">This may take a minute</p>
								</div>
							{:else if summaryError}
								<div class="summary-error">
									<p class="text-tertiary">{summaryError}</p>
									<button class="btn-save" onclick={generateSummary} style="margin-top: var(--sp-3)">Retry</button>
								</div>
							{:else}
								<div class="summary-empty">
									<p class="text-tertiary">No summary yet.</p>
									<button class="btn-save" onclick={generateSummary} style="margin-top: var(--sp-3)">Generate Summary</button>
								</div>
							{/if}
						</div>

					{:else if activeTab === 'info'}
						<div class="info-tab">
							<!-- Status -->
							<div class="field">
								<label class="field-label mono">Status</label>
								<div class="status-pills">
									{#each statusOptions as opt}
										<button
											class="pill"
											class:active={paper.readingStatus === opt.value}
											onclick={() => setStatus(opt.value)}
										>{opt.label}</button>
									{/each}
								</div>
							</div>

							<!-- Rating -->
							<div class="field">
								<label class="field-label mono">Rating</label>
								<div class="rating-dots">
									{#each [1, 2, 3, 4, 5] as n}
										<button
											class="rating-dot"
											class:filled={paper.rating !== null && n <= paper.rating}
											onclick={() => setRating(n)}
										>●</button>
									{/each}
								</div>
							</div>

							<!-- Metadata -->
							<div class="field">
								<label class="field-label mono">Published</label>
								<span class="field-value">{formatDate(paper.publishedDate)}</span>
							</div>

							<div class="field">
								<label class="field-label mono">Authors</label>
								<span class="field-value">{paper.authors.join(', ')}</span>
							</div>

							<div class="field">
								<label class="field-label mono">Categories</label>
								<div class="tag-list">
									{#each paper.categories as cat}
										<span class="tag mono">{cat}</span>
									{/each}
								</div>
							</div>

							<div class="field">
								<label class="field-label mono">Tags</label>
								<div class="tag-list editable">
									{#each paper.tags as tag}
										<button class="tag mono removable" onclick={() => removeTag(tag)}>{tag} ×</button>
									{/each}
									{#if editingTags}
										<form class="tag-form" onsubmit={e => { e.preventDefault(); addTag(); }}>
											<!-- svelte-ignore a11y_autofocus -->
											<input
												type="text"
												class="tag-input"
												placeholder="tag…"
												bind:value={tagInput}
												autofocus
												onblur={() => { if (!tagInput) editingTags = false; }}
											/>
										</form>
									{:else}
										<button class="tag add-tag" onclick={() => editingTags = true}>+</button>
									{/if}
								</div>
							</div>

							<div class="field">
								<label class="field-label mono">Arxiv</label>
								<a href={paper.arxivUrl} target="_blank" rel="noopener" class="field-link mono">{paper.arxivId} ↗</a>
							</div>

							<!-- Internal citations -->
							{#if citedPapers.length > 0}
								<div class="field">
									<label class="field-label mono">Cites (in library)</label>
									<div class="citation-list">
										{#each citedPapers as cited}
											<a href="/paper/{cited?.id}" class="citation-link">
												{cited?.title}
											</a>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Abstract -->
							<div class="field">
								<label class="field-label mono">Abstract</label>
								<p class="abstract-text">{paper.abstract}</p>
							</div>
						</div>

					{:else if activeTab === 'annotations'}
						<div class="annotations-tab">
							<!-- Annotation creation modal (inline) -->
							{#if annotationModal}
								<div class="annotation-create-card">
									<div class="create-header">
										<span class="mono create-label">New annotation</span>
										<span class="mono ann-page">p.{annotationModal.page}</span>
									</div>
									<p class="create-selected-text">"{annotationModal.selectedText}"</p>

									<div class="create-type-row">
										{#each (['highlight', 'note', 'question'] as const) as t}
											<button
												class="type-chip"
												class:active={annotationType === t}
												onclick={() => annotationType = t}
											>
												<span class="ann-icon">{annotationTypeIcons[t]}</span>
												{t}
											</button>
										{/each}
									</div>

									<div class="create-color-row">
										{#each colorOptions as c}
											<button
												class="color-chip"
												class:active={annotationColor === c.value}
												style="background: {c.value}; border: 2px solid {annotationColor === c.value ? 'var(--accent)' : 'transparent'}"
												onclick={() => annotationColor = c.value}
												title={c.label}
											></button>
										{/each}
									</div>

									<textarea
										class="create-comment"
										placeholder="Add a comment (optional)..."
										bind:value={annotationComment}
										rows="3"
									></textarea>

									<div class="create-actions">
										<button class="btn-cancel" onclick={cancelAnnotation}>Cancel</button>
										<button class="btn-save" onclick={saveAnnotation}>Save</button>
									</div>
								</div>
							{/if}

							{#if paperAnnotations.length === 0 && !annotationModal}
								<p class="empty-state text-tertiary">No annotations yet. Select text in the PDF to annotate.</p>
							{:else}
								{#each paperAnnotations as ann}
									<div class="annotation-card" class:editing={editingAnnotationId === ann.id}>
										<div class="ann-header">
											<span class="ann-icon" style="color: {ann.color || 'var(--accent)'}">
												{annotationTypeIcons[ann.type]}
											</span>
											<span class="ann-type-label mono">{ann.type}</span>
											<span class="ann-page mono">p.{ann.page}</span>
											<div class="ann-actions">
												<button class="ann-action-btn" onclick={() => startEditAnnotation(ann)} title="Edit">✎</button>
												<button class="ann-action-btn delete" onclick={() => deleteAnnotation(ann.id)} title="Delete">×</button>
											</div>
										</div>
										{#if ann.selectedText}
											<p class="ann-selected">"{ann.selectedText}"</p>
										{/if}
										{#if editingAnnotationId === ann.id}
											<textarea
												class="edit-comment"
												bind:value={editContent}
												rows="3"
												placeholder="Add a comment..."
											></textarea>
											<div class="edit-actions">
												<button class="btn-cancel" onclick={cancelEditAnnotation}>Cancel</button>
												<button class="btn-save" onclick={saveEditAnnotation}>Save</button>
											</div>
										{:else if ann.content}
											<p class="ann-content">{ann.content}</p>
										{/if}
									</div>
								{/each}
							{/if}
						</div>

					{:else if activeTab === 'notes'}
						<div class="notes-tab">
							<div class="notes-list">
								{#each paperNotes as note}
									<div class="note-bubble">
										<p class="note-text">{note.content}</p>
										<div class="note-meta">
											<span class="note-time mono">{formatNoteTime(note.createdAt)}</span>
											<button class="note-delete" onclick={() => deleteNote(note.id)} title="Delete">×</button>
										</div>
									</div>
								{/each}
								{#if paperNotes.length === 0}
									<p class="empty-state text-tertiary">No notes yet. Type one below.</p>
								{/if}
							</div>
							<form class="note-input-bar" onsubmit={e => { e.preventDefault(); addNote(); }}>
								<input
									type="text"
									class="note-input"
									placeholder="Write a note..."
									bind:value={noteInput}
								/>
								<button type="submit" class="note-send" disabled={!noteInput.trim()}>↵</button>
							</form>
						</div>

					{:else if activeTab === 'threads'}
						<div class="threads-tab">
							{#if paperThreads.length === 0}
								<p class="empty-state text-tertiary">Not part of any thread.</p>
							{:else}
								{#each paperThreads as thread}
									<a href="/threads/{thread.id}" class="thread-link-card">
										<h4>{thread.title}</h4>
										<p class="thread-link-q text-secondary">{thread.question}</p>
										<span class="thread-link-status mono">{thread.status}</span>
									</a>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.paper-detail {
		height: 100%;
	}

	.not-found {
		text-align: center;
		padding: var(--sp-16);
	}

	.reader-layout {
		display: grid;
		grid-template-columns: 1fr 380px;
		height: 100%;
		transition: grid-template-columns var(--duration-normal) var(--ease-out);
	}

	.reader-layout.fullscreen {
		grid-template-columns: 1fr;
	}

	/* Mobile context toggle — hidden on desktop */
	.mobile-context-toggle {
		display: none;
	}

	/* PDF panel */
	.pdf-panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-base);
		position: relative;
	}

	.pdf-slot {
		display: none;
		flex: 1;
		min-height: 0;
		width: 100%;
	}

	.pdf-slot.active {
		display: block;
	}

	.pdf-header-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--sp-2) var(--sp-4);
		background: var(--bg-raised);
		border-bottom: 1px solid var(--border);
		font-size: 0.75rem;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.pdf-header-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
	}

	.pdf-action {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		font-size: 0.72rem;
		color: var(--text-tertiary);
		transition: color var(--duration-fast);
	}

	.pdf-action:hover {
		color: var(--accent);
	}

	/* Context panel */
	.context-panel {
		border-left: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-raised);
	}

	.panel-tabs {
		display: flex;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.panel-tab {
		flex: 1;
		padding: var(--sp-3);
		font-size: 0.8rem;
		color: var(--text-tertiary);
		border-bottom: 2px solid transparent;
		transition: all var(--duration-fast);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
	}

	.panel-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.tab-count {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		background: var(--bg-surface);
		padding: 0 4px;
		border-radius: 3px;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
	}

	.panel-content > :global(*) {
		flex-shrink: 0;
	}

	.panel-content > :global(.notes-tab) {
		flex: 1;
		min-height: 0;
	}

	/* Info tab */
	.field {
		margin-bottom: var(--sp-5);
	}

	.field-label {
		display: block;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	.field-value {
		font-size: 0.88rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.field-link {
		font-size: 0.82rem;
	}

	.status-pills {
		display: flex;
		gap: 2px;
		flex-wrap: wrap;
	}

	.pill {
		padding: var(--sp-1) var(--sp-3);
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		color: var(--text-tertiary);
		background: var(--bg-base);
		transition: all var(--duration-fast);
	}

	.pill.active {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.rating-dots {
		display: flex;
		gap: var(--sp-1);
	}

	.rating-dot {
		font-size: 0.85rem;
		color: var(--text-tertiary);
		transition: color var(--duration-fast);
		padding: 0 2px;
	}

	.rating-dot.filled {
		color: var(--accent);
	}

	.rating-dot:hover {
		color: var(--accent-hover);
	}

	.tag-list {
		display: flex;
		gap: var(--sp-1);
		flex-wrap: wrap;
	}

	.tag {
		font-size: 0.72rem;
		color: var(--text-tertiary);
		background: var(--bg-base);
		padding: 2px 8px;
		border-radius: 3px;
	}

	.removable:hover {
		background: var(--status-unread);
		color: white;
	}

	.add-tag {
		cursor: pointer;
		color: var(--accent);
		background: var(--accent-muted);
	}

	.tag-form {
		display: inline;
	}

	.tag-input {
		width: 80px;
		font-size: 0.72rem;
		font-family: var(--font-mono);
		padding: 2px 6px;
		border-radius: 3px;
	}

	.citation-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.citation-link {
		font-size: 0.85rem;
		font-family: var(--font-display);
		display: block;
		padding: var(--sp-2) 0;
	}

	.abstract-text {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	/* Annotations tab */
	.empty-state {
		text-align: center;
		padding: var(--sp-8) 0;
		font-size: 0.9rem;
	}

	.annotation-card {
		padding: var(--sp-4);
		background: var(--bg-base);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-3);
		transition: background var(--duration-fast);
	}

	.annotation-card:hover {
		background: var(--bg-hover);
	}

	.ann-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-2);
	}

	.ann-icon {
		font-size: 0.85rem;
		color: var(--accent);
	}

	.ann-type-label {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
	}

	.ann-page {
		margin-left: auto;
		font-size: 0.65rem;
		color: var(--text-tertiary);
	}

	.ann-actions {
		display: flex;
		gap: 2px;
		opacity: 0;
		transition: opacity var(--duration-fast);
	}

	.annotation-card:hover .ann-actions {
		opacity: 1;
	}

	.ann-action-btn {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		color: var(--text-tertiary);
		transition: all var(--duration-fast);
	}

	.ann-action-btn:hover {
		background: var(--bg-surface);
		color: var(--text-primary);
	}

	.ann-action-btn.delete:hover {
		color: var(--status-unread);
	}

	.ann-selected {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.88rem;
		color: var(--text-secondary);
		margin-bottom: var(--sp-2);
		line-height: 1.5;
	}

	.ann-content {
		font-size: 0.85rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	/* Annotation create card */
	.annotation-create-card {
		padding: var(--sp-4);
		background: var(--bg-base);
		border: 1px solid var(--accent-muted);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
		animation: slideUp var(--duration-normal) var(--ease-out);
	}

	.create-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-3);
	}

	.create-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--accent);
	}

	.create-selected-text {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.85rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin-bottom: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		background: var(--bg-overlay);
		border-radius: var(--radius-sm);
		max-height: 80px;
		overflow-y: auto;
	}

	.create-type-row {
		display: flex;
		gap: 4px;
		margin-bottom: var(--sp-3);
	}

	.type-chip {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-1) var(--sp-3);
		font-size: 0.75rem;
		font-family: var(--font-mono);
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		background: var(--bg-overlay);
		transition: all var(--duration-fast);
	}

	.type-chip.active {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.create-color-row {
		display: flex;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}

	.color-chip {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		cursor: pointer;
		transition: transform var(--duration-fast);
	}

	.color-chip:hover {
		transform: scale(1.15);
	}

	.create-comment,
	.edit-comment {
		width: 100%;
		font-size: 0.85rem;
		font-family: var(--font-body);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		resize: vertical;
		margin-bottom: var(--sp-3);
		background: var(--bg-overlay);
		border: 1px solid var(--border);
		color: var(--text-primary);
	}

	.create-comment:focus,
	.edit-comment:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.create-actions,
	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
	}

	.btn-cancel {
		padding: var(--sp-1) var(--sp-3);
		font-size: 0.78rem;
		color: var(--text-tertiary);
		border-radius: var(--radius-sm);
		transition: all var(--duration-fast);
	}

	.btn-cancel:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.btn-save {
		padding: var(--sp-1) var(--sp-4);
		font-size: 0.78rem;
		color: var(--accent-text);
		background: var(--accent);
		border-radius: var(--radius-sm);
		font-weight: 500;
		transition: all var(--duration-fast);
	}

	.btn-save:hover {
		background: var(--accent-hover);
	}

	/* Threads tab */
	.thread-link-card {
		display: block;
		padding: var(--sp-4);
		background: var(--bg-base);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-3);
		text-decoration: none;
		color: inherit;
		transition: background var(--duration-fast);
	}

	.thread-link-card:hover {
		background: var(--bg-hover);
	}

	.thread-link-card h4 {
		font-size: 0.92rem;
		margin-bottom: var(--sp-1);
	}

	.thread-link-q {
		font-size: 0.8rem;
		margin-bottom: var(--sp-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.thread-link-status {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
	}

	/* Notes tab */
	.notes-tab {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.notes-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-bottom: var(--sp-3);
	}

	.note-bubble {
		background: var(--bg-base);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
		transition: background var(--duration-fast);
	}

	.note-bubble:hover {
		background: var(--bg-hover);
	}

	.note-bubble:hover .note-delete {
		opacity: 1;
	}

	.note-text {
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--text-primary);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.note-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--sp-1);
	}

	.note-time {
		font-size: 0.65rem;
		color: var(--text-tertiary);
	}

	.note-delete {
		opacity: 0;
		font-size: 0.8rem;
		color: var(--text-tertiary);
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: all var(--duration-fast);
	}

	.note-delete:hover {
		color: var(--status-unread);
		background: var(--bg-surface);
	}

	.note-input-bar {
		display: flex;
		gap: var(--sp-2);
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	.note-input {
		flex: 1;
		font-size: 0.85rem;
		font-family: var(--font-body);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		border: 1px solid var(--border);
		color: var(--text-primary);
	}

	.note-input:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.note-send {
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.85rem;
		color: var(--accent-text);
		background: var(--accent);
		border-radius: var(--radius-sm);
		font-weight: 500;
		transition: all var(--duration-fast);
	}

	.note-send:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.note-send:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Summary tab */
	.summary-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.summary-loading,
	.summary-empty,
	.summary-error {
		text-align: center;
		padding: var(--sp-8) 0;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		margin: 0 auto var(--sp-3);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.summary-footer {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.summary-date {
		font-size: 0.72rem;
		font-family: var(--font-mono);
	}

	.btn-regenerate {
		align-self: flex-start;
		padding: var(--sp-1) var(--sp-3);
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--text-tertiary);
		background: var(--bg-base);
		border-radius: var(--radius-sm);
		transition: all var(--duration-fast);
	}

	.btn-regenerate:hover:not(:disabled) {
		color: var(--accent);
		background: var(--accent-muted);
	}

	.btn-regenerate:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Markdown body styles */
	.markdown-body {
		font-size: 0.88rem;
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.markdown-body :global(h1) {
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 var(--sp-4);
		padding-bottom: var(--sp-2);
		border-bottom: 1px solid var(--border);
	}

	.markdown-body :global(h2) {
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: var(--sp-5) 0 var(--sp-2);
	}

	.markdown-body :global(h2:first-child) {
		margin-top: 0;
	}

	.markdown-body :global(p) {
		margin: 0 0 var(--sp-3);
	}

	.markdown-body :global(ul),
	.markdown-body :global(ol) {
		margin: 0 0 var(--sp-3);
		padding-left: var(--sp-5);
	}

	.markdown-body :global(li) {
		margin-bottom: var(--sp-1);
	}

	.markdown-body :global(strong) {
		color: var(--text-primary);
		font-weight: 600;
	}

	.markdown-body :global(code) {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		background: var(--bg-base);
		padding: 1px 4px;
		border-radius: 3px;
	}

	.markdown-body :global(blockquote) {
		border-left: 3px solid var(--accent-muted);
		margin: 0 0 var(--sp-3);
		padding: var(--sp-2) var(--sp-4);
		color: var(--text-tertiary);
	}

	/* ── Tablet (≤1024px) ── */
	@media (max-width: 1024px) {
		.reader-layout {
			grid-template-columns: 1fr;
			position: relative;
		}

		.pdf-panel {
			min-height: 0;
		}

		/* Context panel as right-side slide-in overlay on tablet */
		.context-panel {
			position: absolute;
			top: 0;
			right: 0;
			bottom: 0;
			width: 360px;
			max-width: 85vw;
			border-left: 1px solid var(--border);
			box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
			transform: translateX(100%);
			transition: transform var(--duration-normal) var(--ease-out);
			z-index: 20;
		}

		.context-panel.mobile-open {
			transform: translateX(0);
		}

		/* Floating toggle button */
		.mobile-context-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			bottom: var(--sp-4);
			right: var(--sp-4);
			width: 48px;
			height: 48px;
			border-radius: 50%;
			background: var(--accent);
			color: var(--accent-text);
			box-shadow: var(--shadow-lg);
			z-index: 19;
			transition: all var(--duration-fast);
		}

		.mobile-context-toggle.active {
			background: var(--bg-surface);
			color: var(--text-primary);
			right: calc(360px + var(--sp-4));
		}

		.mobile-context-toggle:hover {
			transform: scale(1.05);
		}

		/* Panel tabs: scrollable on tablet */
		.panel-tabs {
			overflow-x: auto;
			scrollbar-width: none;
			-webkit-overflow-scrolling: touch;
		}

		.panel-tabs::-webkit-scrollbar {
			display: none;
		}

		.panel-tab {
			white-space: nowrap;
			flex-shrink: 0;
			min-height: 44px;
		}

		.pdf-header-bar .action-label {
			display: none;
		}
	}

	/* ── Fullscreen override ── */
	.reader-layout.fullscreen .context-panel,
	.reader-layout.fullscreen .mobile-context-toggle {
		display: none;
	}

	.reader-layout.fullscreen .pdf-header-bar {
		display: none;
	}

	/* ── Phone (≤480px) ── */
	@media (max-width: 480px) {
		.context-panel {
			width: 100vw;
			max-width: 100vw;
		}

		.mobile-context-toggle.active {
			right: var(--sp-4);
			bottom: var(--sp-4);
			z-index: 21;
		}

		.panel-content {
			padding: var(--sp-3);
		}

		.pdf-header-actions {
			gap: var(--sp-2);
		}
	}
</style>
