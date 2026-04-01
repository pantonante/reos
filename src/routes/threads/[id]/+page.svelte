<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { threads, papers, annotations, notes, chats, ui } from '$lib/stores.svelte';
	import AddPaperToThreadModal from '$lib/components/AddPaperToThreadModal.svelte';
	import type { ThreadStatus, ReadingStatus } from '$lib/types';

	// Register this thread as an open tab
	$effect(() => {
		const id = page.params.id;
		if (id) untrack(() => ui.openThread(id));
	});

	let viewMode = $state<'narrative' | 'status' | 'matrix' | 'timeline' | 'graph'>('narrative');
	let showAddPaper = $state(false);
	let editingTitle = $state(false);
	let titleInput = $state('');
	let editingQuestion = $state(false);
	let questionInput = $state('');
	let editingSynthesis = $state(false);
	let synthesisInput = $state('');
	let newLinkLabel = $state('');
	let newLinkUrl = $state('');
	let addingLink = $state(false);
	let newTag = $state('');
	let addingTag = $state(false);

	// Resizable sidebar
	let sidebarWidth = $state(280);
	let isResizing = $state(false);
	let mobileContextOpen = $state(false);
	let panelFullscreen = $state(false);
	const MIN_SIDEBAR = 220;
	const MAX_SIDEBAR = 500;

	function onResizeStart(e: PointerEvent) {
		e.preventDefault();
		isResizing = true;
		const startX = e.clientX;
		const startWidth = sidebarWidth;

		function onMove(ev: PointerEvent) {
			const delta = startX - ev.clientX;
			sidebarWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startWidth + delta));
		}

		function onUp() {
			isResizing = false;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		}

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	// Drag-and-drop status change state
	let draggedPaperId = $state<string | null>(null);
	let dropTargetStatus = $state<ReadingStatus | null>(null);

	const paperStatusColumns: { status: ReadingStatus; label: string; color: string }[] = [
		{ status: 'unread', label: 'Unread', color: 'var(--status-unread)' },
		{ status: 'reading', label: 'Reading', color: 'var(--status-paused)' },
		{ status: 'read', label: 'Read', color: 'var(--status-active)' },
	];

	function threadPapersByReadingStatus(status: ReadingStatus) {
		return threadPapers.filter(tp => tp.paper?.readingStatus === status);
	}

	function handlePaperDragStart(e: DragEvent, paperId: string) {
		draggedPaperId = paperId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', paperId);
		}
	}

	function handlePaperDragEnd() {
		draggedPaperId = null;
		dropTargetStatus = null;
	}

	function handlePaperDragOver(e: DragEvent, status: ReadingStatus) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		dropTargetStatus = status;
	}

	function handlePaperDragLeave(e: DragEvent, colEl: HTMLElement) {
		if (!colEl.contains(e.relatedTarget as Node)) {
			dropTargetStatus = null;
		}
	}

	function handlePaperDrop(e: DragEvent, status: ReadingStatus) {
		e.preventDefault();
		dropTargetStatus = null;
		if (!draggedPaperId) return;
		const paper = papers.get(draggedPaperId);
		if (paper && paper.readingStatus !== status) {
			papers.update(paper.id, { readingStatus: status });
		}
		draggedPaperId = null;
	}

	const thread = $derived(threads.get(page.params.id));

	const threadPapers = $derived(
		[...(thread?.papers ?? [])]
			.sort((a, b) => a.order - b.order)
			.map(tp => ({
				...tp,
				paper: papers.get(tp.paperId),
			}))
			.filter(tp => tp.paper)
	);

	const threadAnnotations = $derived(
		annotations.items.filter(a => a.threadId === page.params.id)
	);

	const statusOptions: { value: ThreadStatus; label: string; color: string }[] = [
		{ value: 'active', label: 'Active', color: 'var(--status-active)' },
		{ value: 'paused', label: 'Paused', color: 'var(--status-paused)' },
		{ value: 'concluded', label: 'Concluded', color: 'var(--status-concluded)' },
	];

	function setStatus(status: ThreadStatus) {
		if (thread) threads.update(thread.id, { status, updatedAt: new Date().toISOString() });
	}

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
	}

	function formatFullDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function startEditTitle() {
		titleInput = thread?.title ?? '';
		editingTitle = true;
	}

	function saveTitle() {
		if (thread && titleInput.trim()) {
			threads.update(thread.id, { title: titleInput.trim(), updatedAt: new Date().toISOString() });
		}
		editingTitle = false;
	}

	function handleTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveTitle();
		if (e.key === 'Escape') editingTitle = false;
	}

	function startEditQuestion() {
		questionInput = thread?.question ?? '';
		editingQuestion = true;
	}

	function saveQuestion() {
		if (thread) {
			threads.update(thread.id, { question: questionInput.trim(), updatedAt: new Date().toISOString() });
		}
		editingQuestion = false;
	}

	function handleQuestionKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveQuestion(); }
		if (e.key === 'Escape') editingQuestion = false;
	}

	function startEditSynthesis() {
		synthesisInput = thread?.synthesis ?? '';
		editingSynthesis = true;
	}

	function saveSynthesis() {
		if (thread) threads.update(thread.id, { synthesis: synthesisInput, updatedAt: new Date().toISOString() });
		editingSynthesis = false;
	}

	function addLink() {
		if (!thread || !newLinkLabel.trim() || !newLinkUrl.trim()) return;
		const newLinks = [...thread.links, { id: `l${Date.now()}`, label: newLinkLabel.trim(), url: newLinkUrl.trim() }];
		threads.update(thread.id, { links: newLinks, updatedAt: new Date().toISOString() });
		newLinkLabel = '';
		newLinkUrl = '';
		addingLink = false;
	}

	function removeLink(linkId: string) {
		if (!thread) return;
		threads.update(thread.id, { links: thread.links.filter(l => l.id !== linkId), updatedAt: new Date().toISOString() });
	}

	function addTag() {
		if (!thread || !newTag.trim()) return;
		const tags = [...new Set([...thread.tags, newTag.trim().toLowerCase()])];
		threads.update(thread.id, { tags, updatedAt: new Date().toISOString() });
		newTag = '';
		addingTag = false;
	}

	function removeTag(tag: string) {
		if (!thread) return;
		threads.update(thread.id, { tags: thread.tags.filter(t => t !== tag), updatedAt: new Date().toISOString() });
	}

	let confirmingDelete = $state(false);

	async function deleteThread() {
		if (!thread) return;
		const threadId = thread.id;

		// Close the tab
		ui.closeThread(threadId);

		// Find papers exclusive to this thread to remove from local stores
		const exclusivePaperIds = thread.papers
			.filter(tp => !threads.items.some(t => t.id !== threadId && t.papers.some(p => p.paperId === tp.paperId)))
			.map(tp => tp.paperId);

		// Remove from store (triggers API call which handles DB + file cleanup)
		await threads.remove(threadId);

		// Clean up exclusive papers from local stores
		for (const paperId of exclusivePaperIds) {
			ui.closePaper(paperId);
			annotations.items = annotations.items.filter(a => a.paperId !== paperId);
			notes.items = notes.items.filter(n => n.paperId !== paperId);
			chats.items = chats.items.filter(c => c.paperId !== paperId);
			papers.items = papers.items.filter(p => p.id !== paperId);
		}

		goto('/threads');
	}

	// Timeline
	const timelineData = $derived.by(() => {
		if (!threadPapers.length) return [];
		const dates = threadPapers.map(tp => new Date(tp.paper!.publishedDate).getTime());
		const min = Math.min(...dates);
		const max = Math.max(...dates);
		const range = max - min || 1;
		return threadPapers.map(tp => ({
			...tp,
			position: ((new Date(tp.paper!.publishedDate).getTime() - min) / range) * 100,
		}));
	});
</script>

{#if !thread}
	<div class="not-found">
		<h2>Thread not found</h2>
		<a href="/threads">← Back to threads</a>
	</div>
{:else}
	<div class="thread-layout" class:resizing={isResizing} style="--sidebar-w: {sidebarWidth}px">
		<!-- Main content -->
		<div class="thread-main">
			<header class="thread-header">
				<div class="header-top-row">
					<a href="/threads" class="back-link text-tertiary">← Threads</a>
					{#if confirmingDelete}
						<div class="delete-confirm">
							<span class="delete-confirm-text">Delete thread and its exclusive papers?</span>
							<button class="delete-confirm-btn" onclick={deleteThread}>Delete</button>
							<button class="delete-cancel-btn" onclick={() => confirmingDelete = false}>Cancel</button>
						</div>
					{:else}
						<button class="delete-btn" onclick={() => confirmingDelete = true} title="Delete thread">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
						</button>
					{/if}
				</div>
				{#if editingTitle}
					<input
						class="title-input"
						bind:value={titleInput}
						onkeydown={handleTitleKeydown}
						onblur={saveTitle}
						autofocus
					/>
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<h1 onclick={startEditTitle}>{thread.title}</h1>
				{/if}
				{#if editingQuestion}
					<textarea
						class="question-input"
						bind:value={questionInput}
						onkeydown={handleQuestionKeydown}
						onblur={saveQuestion}
						rows="2"
						autofocus
					></textarea>
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<p class="thread-question" onclick={startEditQuestion}>
						{thread.question || 'Add a driving question...'}
					</p>
				{/if}
			</header>

			<div class="view-bar">
				<div class="view-tabs">
					{#each ['narrative', 'status', 'matrix', 'timeline', 'graph'] as mode}
						<button
							class="view-tab"
							class:active={viewMode === mode}
							onclick={() => viewMode = mode as typeof viewMode}
						>
							{mode.charAt(0).toUpperCase() + mode.slice(1)}
						</button>
					{/each}
				</div>
				<button class="add-paper-btn" onclick={() => showAddPaper = true}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
					Add paper
				</button>
			</div>

			{#if viewMode === 'narrative'}
				<div class="narrative">
					{#each threadPapers as tp, i}
						<div class="narrative-item" style="animation-delay: {i * 50 + 60}ms">
							<div class="narrative-line">
								<span class="narrative-number mono">{String(i + 1).padStart(2, '0')}</span>
								<div class="narrative-connector"></div>
							</div>
							<div class="narrative-status-dot-container">
								{#if tp.paper?.readingStatus === 'unread' || tp.paper?.readingStatus === 'reading'}
									<span class="narrative-status-dot" style="background: var({tp.paper.readingStatus === 'unread' ? '--status-unread' : '--status-active'})"></span>
								{/if}
							</div>
							<div class="narrative-content">
								<a href="/paper/{tp.paperId}" class="narrative-paper-link">
									<h3>{tp.paper?.title}</h3>
									<span class="narrative-authors text-secondary">
										{tp.paper?.authors.slice(0, 3).join(', ')}{(tp.paper?.authors.length ?? 0) > 3 ? ' et al.' : ''} · {formatDate(tp.paper?.publishedDate ?? '')}
									</span>
								</a>
								{#if tp.contextNote}
									<p class="context-note">{tp.contextNote}</p>
								{/if}
								{#each threadAnnotations.filter(a => a.paperId === tp.paperId) as ann}
									<div class="annotation-inline">
										<span class="ann-type mono">{ann.type}</span>
										<span class="ann-text">{ann.content || ann.selectedText}</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}

					{#if threadPapers.length === 0}
						<div class="empty-narrative text-tertiary">
							No papers yet. Use "Add paper" to start building this thread.
						</div>
					{/if}
				</div>

				<!-- Synthesis section -->
				<div class="synthesis-section" style="animation-delay: {threadPapers.length * 50 + 120}ms">
					<div class="synthesis-header">
						<h3 class="synthesis-label mono">Synthesis</h3>
						{#if !editingSynthesis}
							<button class="edit-btn" onclick={startEditSynthesis}>
								{thread.synthesis ? 'Edit' : 'Write'}
							</button>
						{/if}
					</div>
					{#if editingSynthesis}
						<textarea
							class="synthesis-textarea"
							bind:value={synthesisInput}
							rows="5"
							placeholder="Your running summary or conclusion…"
						></textarea>
						<div class="synthesis-actions">
							<button class="btn-ghost" onclick={() => editingSynthesis = false}>Cancel</button>
							<button class="btn-small" onclick={saveSynthesis}>Save</button>
						</div>
					{:else if thread.synthesis}
						<p class="synthesis-text">{thread.synthesis}</p>
					{:else}
						<p class="synthesis-empty text-tertiary">No synthesis yet.</p>
					{/if}
				</div>

			{:else if viewMode === 'status'}
			<div class="paper-status-rows">
				{#each paperStatusColumns as col, ci}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="pk-row"
						class:drop-target={dropTargetStatus === col.status && draggedPaperId !== null}
						style="animation-delay: {ci * 60}ms"
						ondragover={(e) => handlePaperDragOver(e, col.status)}
						ondragleave={(e) => handlePaperDragLeave(e, e.currentTarget)}
						ondrop={(e) => handlePaperDrop(e, col.status)}
					>
						<div class="pk-row-header">
							<span class="pk-row-dot" style="background: {col.color}"></span>
							<span class="pk-row-label">{col.label}</span>
							<span class="pk-row-count mono">{threadPapersByReadingStatus(col.status).length}</span>
						</div>
						<div class="pk-row-cards">
							{#each threadPapersByReadingStatus(col.status) as tp, ti}
								<div
									class="pk-card"
									class:dragging={draggedPaperId === tp.paperId}
									style="animation-delay: {ci * 60 + ti * 30 + 80}ms"
									draggable="true"
									ondragstart={(e) => handlePaperDragStart(e, tp.paperId)}
									ondragend={handlePaperDragEnd}
								>
									<a href="/paper/{tp.paperId}" class="pk-card-link">
										<h4 class="pk-card-title">{tp.paper?.title}</h4>
										<span class="pk-card-meta text-tertiary">
											{tp.paper?.authors.slice(0, 3).join(', ')}{(tp.paper?.authors.length ?? 0) > 3 ? ' et al.' : ''} · {formatDate(tp.paper?.publishedDate ?? '')}
											{#if tp.paper?.rating}
												<span class="pk-card-rating mono">{'●'.repeat(tp.paper.rating)}{'○'.repeat(5 - tp.paper.rating)}</span>
											{/if}
										</span>
									</a>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

		{:else if viewMode === 'matrix'}
				<div class="matrix-view">
					<div class="matrix-scroll">
						<table class="matrix-table">
							<thead>
								<tr>
									<th>Paper</th>
									<th>Year</th>
									<th>Status</th>
									<th>Rating</th>
									<th>Context Note</th>
								</tr>
							</thead>
							<tbody>
								{#each threadPapers as tp}
									<tr>
										<td><a href="/paper/{tp.paperId}" class="matrix-title">{tp.paper?.title}</a></td>
										<td class="mono">{tp.paper?.publishedDate.slice(0, 4)}</td>
										<td class="mono">{tp.paper?.readingStatus}</td>
										<td class="mono rating">{tp.paper?.rating ? '●'.repeat(tp.paper.rating) + '○'.repeat(5 - tp.paper.rating) : '—'}</td>
										<td class="context-cell">{tp.contextNote}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

			{:else if viewMode === 'timeline'}
				<div class="timeline-view">
					<div class="timeline-track">
						{#each timelineData as tp, i}
							<div class="timeline-node" style="left: {tp.position}%; animation-delay: {i * 80}ms">
								<a href="/paper/{tp.paperId}" class="timeline-dot" title={tp.paper?.title}></a>
								<div class="timeline-label" class:offset-up={i % 2 === 0}>
									<span class="tl-date mono">{formatDate(tp.paper?.publishedDate ?? '')}</span>
									<span class="tl-title">{tp.paper?.title}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

			{:else if viewMode === 'graph'}
				<div class="thread-graph-placeholder">
					<p class="text-secondary">Citation graph for papers in this thread.</p>
					<div class="mini-graph">
						{#each threadPapers as tp, i}
							<div class="graph-node" style="left: {20 + (i * 30) % 80}%; top: {20 + ((i * 37) % 60)}%; animation-delay: {i * 100}ms">
								<span class="node-dot"></span>
								<span class="node-label">{tp.paper?.title.split(' ').slice(0, 3).join(' ')}…</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Mobile sidebar toggle -->
		<button
			class="mobile-sidebar-toggle"
			class:active={mobileContextOpen}
			onclick={() => mobileContextOpen = !mobileContextOpen}
			aria-label="Toggle thread sidebar"
		>
			{#if mobileContextOpen}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			{:else}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
				</svg>
			{/if}
		</button>

		<!-- Resize handle -->
		<div class="resize-handle" onpointerdown={onResizeStart} role="separator" aria-label="Resize sidebar"></div>

		<!-- Right sidebar -->
		<aside class="thread-sidebar" class:mobile-open={mobileContextOpen} class:panel-fullscreen={panelFullscreen}>
			<div class="sb-header">
				<button
					class="panel-expand-btn"
					onclick={() => panelFullscreen = !panelFullscreen}
					aria-label={panelFullscreen ? 'Exit fullscreen' : 'Expand fullscreen'}
				>
					{#if panelFullscreen}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
						</svg>
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
						</svg>
					{/if}
				</button>
			</div>
			<!-- Status -->
			<div class="sb-section">
				<h4 class="sb-label mono">Status</h4>
				<div class="status-pills">
					{#each statusOptions as opt}
						<button
							class="status-pill"
							class:active={thread.status === opt.value}
							style="--dot-color: {opt.color}"
							onclick={() => setStatus(opt.value)}
						>
							<span class="pill-dot"></span>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Papers -->
			<div class="sb-section">
				<h4 class="sb-label mono">Papers</h4>
				<span class="sb-value">{thread.papers.length} papers</span>
			</div>

			<!-- Tags -->
			<div class="sb-section">
				<h4 class="sb-label mono">Tags</h4>
				<div class="sb-tags">
					{#each thread.tags as tag}
						<button class="sb-tag mono" onclick={() => removeTag(tag)}>{tag} ×</button>
					{/each}
					{#if addingTag}
						<form class="tag-inline-form" onsubmit={e => { e.preventDefault(); addTag(); }}>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								class="tag-inline-input mono"
								placeholder="tag…"
								bind:value={newTag}
								autofocus
								onblur={() => { if (!newTag.trim()) addingTag = false; }}
							/>
						</form>
					{:else}
						<button class="sb-tag add-tag" onclick={() => addingTag = true}>+</button>
					{/if}
				</div>
			</div>

			<!-- Links -->
			<div class="sb-section">
				<div class="sb-label-row">
					<h4 class="sb-label mono">Links</h4>
					<button class="sb-add-btn" onclick={() => addingLink = true}>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
					</button>
				</div>
				<div class="sb-links">
					{#each thread.links as link}
						<div class="sb-link-item">
							<a href={link.url} target="_blank" rel="noopener" class="sb-link-anchor">
								<svg class="link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
									<polyline points="15 3 21 3 21 9"/>
									<line x1="10" y1="14" x2="21" y2="3"/>
								</svg>
								{link.label}
							</a>
							<button class="sb-link-remove" onclick={() => removeLink(link.id)}>×</button>
						</div>
					{/each}
					{#if thread.links.length === 0 && !addingLink}
						<p class="sb-empty text-tertiary">No links yet.</p>
					{/if}
					{#if addingLink}
						<form class="add-link-form" onsubmit={e => { e.preventDefault(); addLink(); }}>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								class="link-input"
								placeholder="Label"
								bind:value={newLinkLabel}
								autofocus
							/>
							<input
								type="url"
								class="link-input"
								placeholder="https://…"
								bind:value={newLinkUrl}
							/>
							<div class="link-form-actions">
								<button type="button" class="btn-ghost" onclick={() => { addingLink = false; newLinkLabel = ''; newLinkUrl = ''; }}>Cancel</button>
								<button type="submit" class="btn-small" disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}>Add</button>
							</div>
						</form>
					{/if}
				</div>
			</div>

			<!-- Dates -->
			<div class="sb-section">
				<h4 class="sb-label mono">Created</h4>
				<span class="sb-value mono">{formatFullDate(thread.createdAt)}</span>
			</div>
			<div class="sb-section">
				<h4 class="sb-label mono">Updated</h4>
				<span class="sb-value mono">{formatFullDate(thread.updatedAt)}</span>
			</div>

			<!-- Parent thread -->
			{#if thread.parentThreadId}
				{@const parent = threads.get(thread.parentThreadId)}
				{#if parent}
					<div class="sb-section">
						<h4 class="sb-label mono">Forked from</h4>
						<a href="/threads/{parent.id}" class="sb-parent-link">{parent.title}</a>
					</div>
				{/if}
			{/if}
		</aside>
	</div>

	{#if showAddPaper && thread}
		<AddPaperToThreadModal {thread} onclose={() => showAddPaper = false} />
	{/if}
{/if}

<style>
	/* Layout */
	.thread-layout {
		display: grid;
		grid-template-columns: 1fr 0px var(--sidebar-w, 280px);
		gap: 0;
		margin: calc(-1 * var(--sp-8));
		height: 100vh;
		position: relative;
	}

	.thread-layout.resizing {
		transition: none;
		user-select: none;
	}

	/* Resize handle */
	.resize-handle {
		width: 6px;
		cursor: col-resize;
		background: transparent;
		position: relative;
		z-index: 5;
		margin: 0 -3px;
		transition: background var(--duration-fast);
	}

	.resize-handle::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 4px;
		height: 32px;
		border-radius: 2px;
		background: var(--border);
		opacity: 0;
		transition: opacity var(--duration-fast);
	}

	.resize-handle:hover,
	.thread-layout.resizing .resize-handle {
		background: var(--accent);
		opacity: 0.3;
	}

	.resize-handle:hover::after,
	.thread-layout.resizing .resize-handle::after {
		opacity: 1;
	}

	/* Mobile sidebar toggle — hidden on desktop */
	.mobile-sidebar-toggle {
		display: none;
	}

	.thread-main {
		overflow-y: auto;
		padding: var(--sp-8);
		padding-right: var(--sp-10);
	}

	.not-found {
		text-align: center;
		padding: var(--sp-16) 0;
	}

	/* Header */
	.thread-header {
		margin-bottom: var(--sp-8);
	}

	.header-top-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-4);
	}

	.delete-btn {
		color: var(--text-tertiary);
		padding: var(--sp-2);
		border-radius: var(--radius-sm);
		transition: color var(--duration-fast), background var(--duration-fast);
	}

	.delete-btn:hover {
		color: var(--danger, #e53e3e);
		background: color-mix(in srgb, var(--danger, #e53e3e) 10%, transparent);
	}

	.delete-confirm {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.delete-confirm-text {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.delete-confirm-btn {
		font-size: 0.78rem;
		padding: var(--sp-1) var(--sp-3);
		background: var(--danger, #e53e3e);
		color: white;
		border-radius: var(--radius-sm);
		font-weight: 500;
	}

	.delete-cancel-btn {
		font-size: 0.78rem;
		padding: var(--sp-1) var(--sp-3);
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
	}

	.delete-cancel-btn:hover {
		background: var(--bg-raised);
	}

	.back-link {
		font-size: 0.82rem;
		display: inline-block;
	}

	.back-link:hover {
		color: var(--text-primary);
	}

	.thread-header h1,
	.title-input {
		font-size: 2rem;
		font-weight: 300;
		letter-spacing: -0.03em;
		line-height: 1.2;
		margin-bottom: var(--sp-3);
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 1px 3px;
		box-sizing: border-box;
	}

	.thread-header h1 {
		cursor: text;
	}

	.thread-header h1:hover {
		background: var(--bg-secondary);
	}

	.title-input {
		color: var(--text-primary);
		font-family: var(--font-display);
		background: var(--bg-secondary);
		border-color: var(--border);
		width: 100%;
		outline: none;
	}

	.title-input:focus {
		border-color: var(--text-tertiary);
	}

	.thread-question,
	.question-input {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-style: italic;
		color: var(--text-secondary);
		line-height: 1.5;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 1px 3px;
		box-sizing: border-box;
	}

	.thread-question {
		cursor: text;
	}

	.thread-question:hover {
		background: var(--bg-secondary);
	}

	.question-input {
		font-family: var(--font-display);
		background: var(--bg-secondary);
		border-color: var(--border);
		width: 100%;
		resize: vertical;
		outline: none;
	}

	.question-input:focus {
		border-color: var(--text-tertiary);
	}

	/* View bar */
	.view-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--border);
		margin-bottom: var(--sp-8);
	}

	.add-paper-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.82rem;
		color: var(--text-tertiary);
		border-radius: var(--radius-sm);
		transition: all var(--duration-fast);
	}

	.add-paper-btn:hover {
		color: var(--accent);
		background: var(--accent-muted);
	}

	.view-tabs {
		display: flex;
		gap: 0;
	}

	.view-tab {
		padding: var(--sp-3) var(--sp-5);
		font-size: 0.85rem;
		color: var(--text-tertiary);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: all var(--duration-fast);
	}

	.view-tab:hover { color: var(--text-secondary); }

	.view-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	/* Narrative */
	.narrative {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.narrative-item {
		display: flex;
		gap: var(--sp-2);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.narrative-line {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 28px;
		flex-shrink: 0;
		margin-right: var(--sp-3);
	}

	.narrative-number {
		font-size: 0.7rem;
		color: var(--accent);
		margin-bottom: var(--sp-2);
	}

	.narrative-connector {
		flex: 1;
		width: 1px;
		background: var(--border);
		min-height: var(--sp-6);
	}

	.narrative-content {
		flex: 1;
		padding-bottom: var(--sp-8);
	}

	.narrative-paper-link {
		display: block;
		text-decoration: none;
		color: inherit;
		margin-bottom: var(--sp-3);
	}

	.narrative-paper-link:hover h3 { color: var(--accent); }

	.narrative-status-dot-container {
		width: 12px;
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 7px;
	}

	.narrative-status-dot {
		display: block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.narrative-paper-link h3 {
		font-size: 1.1rem;
		margin-bottom: var(--sp-1);
		transition: color var(--duration-fast);
	}

	.narrative-authors { font-size: 0.82rem; }

	.context-note {
		font-size: 0.9rem;
		color: var(--text-secondary);
		line-height: 1.55;
		padding: var(--sp-3) var(--sp-4);
		background: var(--bg-raised);
		border-left: 2px solid var(--accent);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		margin-bottom: var(--sp-3);
	}

	.annotation-inline {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
		font-size: 0.82rem;
		padding: var(--sp-2) 0;
		color: var(--text-secondary);
	}

	.ann-type {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		flex-shrink: 0;
		padding-top: 2px;
	}

	.empty-narrative {
		text-align: center;
		padding: var(--sp-12) 0;
		font-size: 0.9rem;
	}

	/* Synthesis */
	.synthesis-section {
		margin-top: var(--sp-6);
		padding: var(--sp-5);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.synthesis-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--sp-3);
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

	.synthesis-text {
		font-size: 0.92rem;
		line-height: 1.6;
		color: var(--text-secondary);
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

	/* Paper Status Rows */
	.paper-status-rows {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.pk-row {
		animation: slideUp var(--duration-slow) var(--ease-out) both;
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		transition: background var(--duration-fast), outline var(--duration-fast);
		outline: 2px dashed transparent;
		outline-offset: -2px;
		min-height: 64px;
	}

	.pk-row.drop-target {
		background: color-mix(in srgb, var(--accent) 6%, transparent);
		outline-color: var(--accent);
	}

	.pk-row-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding-bottom: var(--sp-3);
		margin-bottom: var(--sp-3);
		border-bottom: 1px solid var(--border-subtle);
	}

	.pk-row-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.pk-row-label {
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.pk-row-count {
		margin-left: auto;
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.pk-row-cards {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.pk-card {
		display: flex;
		align-items: center;
		padding: var(--sp-3) var(--sp-4);
		border-bottom: 1px solid var(--border-subtle);
		cursor: grab;
		transition: background var(--duration-fast), opacity var(--duration-fast);
		animation: slideUp var(--duration-slow) var(--ease-out) both;
	}

	.pk-card:last-child { border-bottom: none; }

	.pk-card:active { cursor: grabbing; }

	.pk-card:hover { background: var(--bg-raised); }

	.pk-card.dragging { opacity: 0.3; }

	.pk-card-link {
		display: block;
		text-decoration: none;
		color: inherit;
		flex: 1;
		min-width: 0;
	}

	.pk-card-title {
		font-size: 0.92rem;
		font-weight: 500;
		margin-bottom: 2px;
	}

	.pk-card-meta {
		font-size: 0.78rem;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.pk-card-rating {
		font-size: 0.6rem;
		color: var(--accent);
		letter-spacing: 1px;
	}

	/* Matrix */
	.matrix-scroll { overflow-x: auto; }

	.matrix-table {
		width: 100%;
		border-collapse: collapse;
	}

	.matrix-table th {
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--border);
		font-weight: 500;
	}

	.matrix-table td {
		padding: var(--sp-3);
		border-bottom: 1px solid var(--border-subtle);
		font-size: 0.85rem;
		vertical-align: top;
	}

	.matrix-title { font-family: var(--font-display); font-weight: 500; }

	.rating { color: var(--accent); letter-spacing: 1px; font-size: 0.65rem; }

	.context-cell { color: var(--text-secondary); max-width: 300px; }

	/* Timeline */
	.timeline-view { padding: var(--sp-16) 0; }

	.timeline-track {
		position: relative;
		height: 320px;
		border-bottom: 1px solid var(--border);
	}

	.timeline-node {
		position: absolute;
		bottom: 0;
		transform: translateX(-50%);
		animation: fadeIn var(--duration-slow) var(--ease-out) both;
	}

	.timeline-dot {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent);
		margin: 0 auto var(--sp-2);
		transition: transform var(--duration-fast);
	}

	.timeline-dot:hover { transform: scale(1.5); }

	.timeline-label {
		position: absolute;
		bottom: var(--sp-5);
		left: 50%;
		transform: translateX(-50%);
		text-align: center;
		white-space: nowrap;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.timeline-label.offset-up { bottom: var(--sp-16); }

	.tl-date { font-size: 0.65rem; color: var(--text-tertiary); }

	.tl-title {
		font-size: 0.78rem;
		color: var(--text-secondary);
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Graph */
	.thread-graph-placeholder { padding: var(--sp-8); text-align: center; }

	.mini-graph {
		position: relative;
		height: 300px;
		margin-top: var(--sp-6);
	}

	.graph-node {
		position: absolute;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		animation: fadeIn var(--duration-slow) var(--ease-out) both;
	}

	.node-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}

	.node-label {
		font-size: 0.75rem;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	/* ─── Right Sidebar ─── */
	.thread-sidebar {
		border-left: 1px solid var(--border);
		background: var(--bg-raised);
		padding: var(--sp-6) var(--sp-5);
		overflow-y: auto;
		height: 100vh;
	}

	.sb-header {
		display: flex;
		justify-content: flex-end;
		margin-bottom: var(--sp-2);
	}

	.panel-expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-2);
		color: var(--text-tertiary);
		border-radius: 4px;
		transition: color var(--duration-fast);
	}

	.panel-expand-btn:hover {
		color: var(--accent);
	}

	/* Fullscreen sidebar on desktop */
	.thread-sidebar.panel-fullscreen {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border-left: none;
		z-index: 30;
		padding: var(--sp-8);
	}

	.thread-sidebar.panel-fullscreen > :not(.sb-header) {
		max-width: 960px;
		margin-left: auto;
		margin-right: auto;
	}

	.sb-section {
		margin-bottom: var(--sp-6);
	}

	.sb-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	.sb-label-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--sp-2);
	}

	.sb-label-row .sb-label { margin-bottom: 0; }

	.sb-add-btn {
		color: var(--text-tertiary);
		padding: 2px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		transition: color var(--duration-fast);
	}

	.sb-add-btn:hover { color: var(--accent); }

	.sb-value {
		font-size: 0.82rem;
		color: var(--text-secondary);
	}

	/* Status pills */
	.status-pills {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.status-pill {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		font-size: 0.82rem;
		color: var(--text-tertiary);
		transition: all var(--duration-fast);
		text-align: left;
	}

	.status-pill:hover { background: var(--bg-hover); }

	.status-pill.active {
		background: var(--bg-surface);
		color: var(--text-primary);
	}

	.pill-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--dot-color);
		flex-shrink: 0;
	}

	/* Tags */
	.sb-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}

	.sb-tag {
		font-size: 0.72rem;
		color: var(--text-tertiary);
		background: var(--bg-base);
		padding: 2px 8px;
		border-radius: 3px;
		transition: all var(--duration-fast);
	}

	.sb-tag:hover {
		background: var(--status-unread);
		color: white;
	}

	.add-tag {
		color: var(--accent);
		background: var(--accent-muted);
	}

	.add-tag:hover {
		background: var(--accent);
		color: var(--accent-text);
	}

	.tag-inline-form { display: inline; }

	.tag-inline-input {
		width: 72px;
		font-size: 0.72rem;
		padding: 2px 6px;
		border-radius: 3px;
	}

	/* Links */
	.sb-links {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.sb-link-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.sb-link-anchor {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: 0.82rem;
		color: var(--text-secondary);
		transition: color var(--duration-fast);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sb-link-anchor:hover { color: var(--accent); }

	.link-icon {
		flex-shrink: 0;
		opacity: 0.5;
	}

	.sb-link-remove {
		flex-shrink: 0;
		font-size: 0.82rem;
		color: var(--text-tertiary);
		opacity: 0;
		transition: opacity var(--duration-fast);
		padding: 0 4px;
	}

	.sb-link-item:hover .sb-link-remove { opacity: 1; }

	.sb-link-remove:hover { color: var(--status-unread); }

	.sb-empty { font-size: 0.82rem; }

	.add-link-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3);
		background: var(--bg-base);
		border-radius: var(--radius-sm);
	}

	.link-input {
		width: 100%;
		font-size: 0.82rem;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
	}

	.link-form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
	}

	.sb-parent-link {
		font-family: var(--font-display);
		font-size: 0.88rem;
	}

	/* Shared small buttons */
	.btn-ghost {
		padding: var(--sp-1) var(--sp-3);
		font-size: 0.78rem;
		color: var(--text-tertiary);
		border-radius: var(--radius-sm);
	}

	.btn-ghost:hover { background: var(--bg-hover); }

	.btn-small {
		padding: var(--sp-1) var(--sp-3);
		font-size: 0.78rem;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius-sm);
	}

	.btn-small:hover:not(:disabled) { background: var(--accent-hover); }

	.btn-small:disabled { opacity: 0.5; cursor: not-allowed; }

	/* ── Tablet (≤1024px) ── */
	@media (max-width: 768px) {
		.thread-layout {
			grid-template-columns: 1fr;
			height: auto;
		}

		.resize-handle {
			display: none;
		}

		.thread-main {
			padding: var(--sp-6);
		}

		/* Fullscreen overlay sidebar on iPad */
		.thread-sidebar {
			position: fixed;
			top: 0;
			right: 0;
			bottom: 0;
			left: 0;
			width: 100%;
			border-left: none;
			height: 100%;
			padding: var(--sp-6);
			z-index: 20;
			overflow-y: auto;
			transform: translateX(100%);
			transition: transform var(--duration-normal) var(--ease-out);
		}

		.thread-sidebar.mobile-open {
			transform: translateX(0);
		}

		/* Floating toggle button */
		.mobile-sidebar-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
			position: fixed;
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

		.mobile-sidebar-toggle.active {
			background: var(--bg-surface);
			color: var(--text-primary);
			z-index: 21;
		}

		.mobile-sidebar-toggle:hover {
			transform: scale(1.05);
		}
	}
</style>
