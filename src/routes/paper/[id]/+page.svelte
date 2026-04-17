<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { ui, papers, threads, annotations, notes, chats } from '$lib/stores.svelte';
	import type { ReadingStatus, AnnotationType, ChatMessage } from '$lib/types';
	import PdfViewer from '$lib/components/PdfViewer.svelte';
	import MessageStream, { type LiveTool } from '$lib/components/chat/MessageStream.svelte';
	import ChatComposer from '$lib/components/chat/ChatComposer.svelte';
	import ConfirmDeleteModal from '$lib/components/ConfirmDeleteModal.svelte';
	import { chatLabel } from '$lib/chat-display';
	import { marked } from 'marked';
	import markedKatex from 'marked-katex-extension';

	marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

	const paper = $derived(papers.get(page.params.id!));

	// Resizable sidebar
	let sidebarWidth = $state(380);
	let isResizing = $state(false);
	let panelFullscreen = $state(false);
	const MIN_SIDEBAR = 280;
	const MAX_SIDEBAR = 600;

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

	function toggleFullscreen() {
		ui.pdfFullscreen = !ui.pdfFullscreen;
		if (ui.pdfFullscreen) ui.contextPanelOpen = false;
	}

	// Register this paper as open in the tab bar
	$effect(() => {
		const id = page.params.id;
		if (id) untrack(() => ui.openPaper(id));
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

	let mainView = $state<'pdf' | 'summary' | 'chat'>('pdf');
	let contextTab = $state<'info' | 'notes'>('info');
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);
	let cachedSummaryCheckedForId = $state<string | null>(null);

	// Chat state for paper context
	let chatMessages = $state<ChatMessage[]>([]);
	let chatStreaming = $state(false);
	let chatStreamingContent = $state('');
	let chatLiveThinkingBlocks = $state<string[]>([]);
	let chatLiveThinkingCurrent = $state('');
	let chatLiveTools = $state<LiveTool[]>([]);
	let chatAttachedPaperIds = $state(new Set<string>());
	let chatAbortController: AbortController | null = null;
	let paperChatId = $state<string | null>(null);
	let chatPickerOpen = $state(false);
	let chatPickerRef = $state<HTMLElement | null>(null);

	// All chats for this paper
	const paperChats = $derived(
		chats.items.filter(c => c.paperId === page.params.id)
			.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
	);

	async function createPaperChat() {
		const now = new Date().toISOString();
		const chatNum = paperChats.length + 1;
		const chat = {
			id: `c${Date.now()}`,
			title: chatNum === 1 ? 'Chat' : `Chat ${chatNum}`,
			claudeSessionId: null,
			chatEngine: 'sdk' as const,
			paperId: page.params.id ?? null,
			createdAt: now,
			updatedAt: now,
		};
		await chats.add(chat);
		await selectPaperChat(chat.id);
		chatPickerOpen = false;
	}

	async function selectPaperChat(chatId: string) {
		paperChatId = chatId;
		chatMessages = [];
		chatStreaming = false;
		chatStreamingContent = '';
		chatLiveThinkingBlocks = [];
		chatLiveThinkingCurrent = '';
		chatLiveTools = [];
		chatAttachedPaperIds = new Set();
		chatPickerOpen = false;
		try {
			const res = await fetch(`/api/chats/${chatId}/messages`);
			if (res.ok) {
				const loaded: ChatMessage[] = await res.json();
				chatMessages = loaded;
				// If history already contains a document block for this paper,
				// don't re-attach the PDF on the next message.
				const docTitles = new Set<string>();
				for (const m of loaded) {
					for (const p of m.parts ?? []) {
						if (p.type === 'document' && p.title) docTitles.add(p.title);
					}
				}
				if (paper && docTitles.has(paper.title)) {
					chatAttachedPaperIds.add(page.params.id!);
				}
			}
		} catch { /* offline */ }
	}

	async function deletePaperChat(chatId: string) {
		await chats.remove(chatId);
		if (paperChatId === chatId) {
			const remaining = paperChats.filter(c => c.id !== chatId);
			if (remaining.length > 0) {
				await selectPaperChat(remaining[0].id);
			} else {
				paperChatId = null;
				chatMessages = [];
			}
		}
	}

	// Reset chat state when paper changes
	let lastPaperId = $state<string | undefined>(undefined);
	$effect(() => {
		const id = page.params.id;
		if (id !== lastPaperId) {
			lastPaperId = id;
			mainView = 'pdf';
			contextTab = 'info';
			paperChatId = null;
			chatMessages = [];
			chatStreaming = false;
			chatStreamingContent = '';
			chatLiveThinkingBlocks = [];
			chatLiveThinkingCurrent = '';
			chatLiveTools = [];
			chatAttachedPaperIds = new Set();
		}
	});

	$effect(() => {
		if (mainView !== 'chat') return;
		if (paperChatId || paperChats.length === 0) return;
		selectPaperChat(paperChats[0].id);
	});

	// Close chat picker on outside click
	function onChatPickerClick(e: MouseEvent) {
		if (chatPickerRef && !chatPickerRef.contains(e.target as Node)) {
			chatPickerOpen = false;
		}
	}

	$effect(() => {
		if (chatPickerOpen) {
			document.addEventListener('click', onChatPickerClick, true);
			return () => document.removeEventListener('click', onChatPickerClick, true);
		}
	});

	async function sendChatMessage(text: string, mentionedPaperIds: string[] = []) {
		// Auto-create a chat if none is selected
		if (!paperChatId) {
			await createPaperChat();
		}
		const chatId = paperChatId!;
		const currentPaperId = page.params.id;

		// Auto-rename the chat from its placeholder title ("Chat", "Chat 2", …)
		// to the first user message — same behavior as the standalone chat page,
		// so paper-scoped chats also get meaningful titles after the first turn.
		const chatRecord = chats.get(chatId);
		if (chatRecord && /^Chat( \d+)?$/.test(chatRecord.title)) {
			const title = text.length > 50 ? text.slice(0, 50) + '…' : text;
			chats.update(chatId, { title, updatedAt: new Date().toISOString() });
		}

		// Decide which paperIds to attach as PDFs in this turn.
		const toAttach: string[] = [];
		if (currentPaperId && !chatAttachedPaperIds.has(currentPaperId)) {
			toAttach.push(currentPaperId);
		}
		for (const pid of mentionedPaperIds) {
			if (!chatAttachedPaperIds.has(pid) && !toAttach.includes(pid)) {
				toAttach.push(pid);
			}
		}
		for (const pid of toAttach) chatAttachedPaperIds.add(pid);
		chatAttachedPaperIds = new Set(chatAttachedPaperIds);

		// Optimistically add the user message
		const userMsg: ChatMessage = {
			id: `m${Date.now()}`,
			chatId,
			role: 'user',
			content: text,
			parts: [{ type: 'text', text }],
			createdAt: new Date().toISOString(),
		};
		chatMessages = [...chatMessages, userMsg];

		// Reset live state
		chatStreaming = true;
		chatStreamingContent = '';
		chatLiveThinkingBlocks = [];
		chatLiveThinkingCurrent = '';
		chatLiveTools = [];

		chatAbortController = new AbortController();
		try {
			const res = await fetch(`/api/chats/${chatId}/stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: text, paperIds: toAttach }),
				signal: chatAbortController.signal,
			});

			if (!res.ok || !res.body) {
				chatStreaming = false;
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					try {
						handleChatEvent(JSON.parse(line.slice(6)));
					} catch { /* skip malformed */ }
				}
			}
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				chatStreamingContent += `\n\n_Error: ${(err as Error).message}_`;
			}
		} finally {
			chatStreaming = false;
			chatAbortController = null;
			// Reload from the server to pick up the persisted assistant turns
			// (with full parts: thinking, tool_use, tool_result).
			try {
				const res = await fetch(`/api/chats/${chatId}/messages`);
				if (res.ok) chatMessages = await res.json();
			} catch { /* offline */ }
			chatStreamingContent = '';
			chatLiveThinkingBlocks = [];
			chatLiveThinkingCurrent = '';
			chatLiveTools = [];
		}
	}

	function handleChatEvent(event: { type: string; [k: string]: unknown }) {
		switch (event.type) {
			case 'text':
				chatStreamingContent += event.text as string;
				break;
			case 'thinking_delta':
				chatLiveThinkingCurrent += event.text as string;
				break;
			case 'thinking_done':
				if (chatLiveThinkingCurrent) {
					chatLiveThinkingBlocks = [...chatLiveThinkingBlocks, chatLiveThinkingCurrent];
					chatLiveThinkingCurrent = '';
				}
				break;
			case 'tool_start':
				chatLiveTools = [
					...chatLiveTools,
					{
						id: event.id as string,
						name: event.tool as string,
						input: '',
						isLocal: true,
					},
				];
				break;
			case 'tool_input_delta':
				if (chatLiveTools.length > 0) {
					const last = chatLiveTools[chatLiveTools.length - 1];
					chatLiveTools = [
						...chatLiveTools.slice(0, -1),
						{ ...last, input: last.input + (event.text as string) },
					];
				}
				break;
			case 'tool_stop':
				if (chatLiveTools.length > 0) {
					const last = chatLiveTools[chatLiveTools.length - 1];
					chatLiveTools = [...chatLiveTools.slice(0, -1), { ...last, done: true }];
				}
				break;
			case 'tool_result': {
				const toolUseId = event.toolUseId as string;
				chatLiveTools = chatLiveTools.map((t) =>
					t.id === toolUseId
						? {
								...t,
								result: event.output as string,
								isError: (event.isError as boolean) ?? false,
								done: true,
						  }
						: t
				);
				break;
			}
			case 'error':
				chatStreamingContent += `\n\n_Error: ${event.error}_`;
				break;
		}
	}

	function stopChatStreaming() {
		chatAbortController?.abort();
	}

	const summaryHtml = $derived(paper?.summary ? marked(paper.summary) : '');

	async function loadCachedSummary(paperId: string) {
		try {
			const res = await fetch(`/api/papers/summary?id=${encodeURIComponent(paperId)}`);
			if (!res.ok) return;
			const data = await res.json();
			papers.update(paperId, { summary: data.summary, summaryDate: data.summaryDate });
		} catch {
			// Best-effort cache sync; absence is handled by the summary empty state.
		}
	}

	async function generateSummary(regenerate = false) {
		if (!paper || summaryLoading) return;
		summaryLoading = true;
		summaryError = null;
		summaryScrolledToEnd = false;
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
				if (regenerate) {
					papers.update(paper.id, { readingStatus: 'reading' });
				} else if (paper.readingStatus === 'unread') {
					papers.update(paper.id, { readingStatus: 'reading' });
				}
			}
		} catch (err: any) {
			summaryError = err.message || 'Network error';
		} finally {
			summaryLoading = false;
		}
	}

	$effect(() => {
		const currentPaper = paper;
		if (!currentPaper) return;
		const currentPaperId = currentPaper.id;
		if (currentPaper.summary) {
			cachedSummaryCheckedForId = currentPaperId;
			return;
		}
		if (cachedSummaryCheckedForId === currentPaperId) return;
		cachedSummaryCheckedForId = currentPaperId;
		loadCachedSummary(currentPaperId);
	});
	let summaryScrolledToEnd = false;
	function handleSummaryScroll(e: Event) {
		if (summaryScrolledToEnd || !paper || paper.readingStatus === 'read' || paper.readingStatus === 'archived') return;
		const el = e.target as HTMLElement;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
			summaryScrolledToEnd = true;
			papers.update(paper.id, { readingStatus: 'read' });
		}
	}

	let noteInput = $state('');
	let editingTags = $state(false);
	let addingLink = $state(false);
	let linkInput = $state('');

	function getDomain(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	function addLink() {
		if (!paper || !linkInput.trim()) return;
		let url = linkInput.trim();
		if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
		const links = [...(paper.links || []), url];
		papers.update(paper.id, { links });
		linkInput = '';
		addingLink = false;
	}

	function removeLink(url: string) {
		if (!paper) return;
		papers.update(paper.id, { links: paper.links.filter(l => l !== url) });
	}
	let tagInput = $state('');

	// Move-to-thread dropdown
	let moveThreadOpen = $state(false);
	let threadSearch = $state('');
	let moveThreadRef = $state<HTMLElement | null>(null);
	let moving = $state(false);
	const currentThread = $derived(paperThreads[0] ?? null);
	const otherThreads = $derived(
		threads.items.filter(t => t.id !== currentThread?.id)
	);
	const filteredThreads = $derived(
		threadSearch
			? otherThreads.filter(t => t.title.toLowerCase().includes(threadSearch.toLowerCase()))
			: otherThreads
	);

	async function movePaperToThread(toThreadId: string) {
		if (!paper || moving) return;
		const fromThreadId = currentThread?.id ?? paper.threadId ?? null;
		if (fromThreadId === toThreadId) {
			closeThreadDropdown();
			return;
		}
		moving = true;
		try {
			const res = await fetch('/api/papers/move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ paperId: paper.id, toThreadId }),
			});
			if (!res.ok) {
				const { error } = await res.json().catch(() => ({ error: 'Move failed' }));
				console.error('[move paper]', error);
				return;
			}
			// Update local stores to reflect the move without a full reload.
			papers.items = papers.items.map(p =>
				p.id === paper.id ? { ...p, threadId: toThreadId } : p,
			);
			const now = new Date().toISOString();
			threads.items = threads.items.map(t => {
				if (t.id === fromThreadId) {
					return {
						...t,
						papers: t.papers.filter(tp => tp.paperId !== paper.id),
						updatedAt: now,
					};
				}
				if (t.id === toThreadId) {
					const already = t.papers.some(tp => tp.paperId === paper.id);
					return {
						...t,
						papers: already
							? t.papers
							: [...t.papers, { paperId: paper.id, contextNote: '', order: t.papers.length }],
						updatedAt: now,
					};
				}
				return t;
			});
		} finally {
			moving = false;
			closeThreadDropdown();
		}
	}

	function closeThreadDropdown() {
		moveThreadOpen = false;
		threadSearch = '';
	}

	function onThreadDropdownClick(e: MouseEvent) {
		if (moveThreadRef && !moveThreadRef.contains(e.target as Node)) {
			closeThreadDropdown();
		}
	}

	$effect(() => {
		if (moveThreadOpen) {
			document.addEventListener('click', onThreadDropdownClick, true);
			return () => document.removeEventListener('click', onThreadDropdownClick, true);
		}
	});

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
		mainView = 'pdf';
		contextTab = 'notes';
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
		mainView = 'pdf';
		contextTab = 'notes';
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

	let confirmingDelete = $state(false);

	async function deletePaper() {
		if (!paper) return;
		const paperId = paper.id;

		// Close the tab
		ui.closePaper(paperId);

		// Clean up local stores
		annotations.items = annotations.items.filter(a => a.paperId !== paperId);
		notes.items = notes.items.filter(n => n.paperId !== paperId);
		chats.items = chats.items.filter(c => c.paperId !== paperId);

		// Remove paper from any threads in local state
		for (const t of threads.items) {
			if (t.papers.some(tp => tp.paperId === paperId)) {
				threads.update(t.id, {
					papers: t.papers.filter(tp => tp.paperId !== paperId),
					updatedAt: new Date().toISOString(),
				});
			}
		}

		// Remove from store (triggers API which handles DB + file cleanup)
		await papers.remove(paperId);

		goto('/library');
	}
</script>

{#if !paper}
	<div class="not-found">
		<h2>Paper not found</h2>
		<a href="/library">← Back to library</a>
	</div>
{:else}
	<div class="paper-detail" class:fullscreen={ui.pdfFullscreen}>
		{#if !ui.pdfFullscreen}
			<div class="paper-view-switcher">
				<div class="paper-view-tabs" role="tablist" aria-label="Paper view">
					<button class="paper-view-tab" class:active={mainView === 'pdf'} onclick={() => mainView = 'pdf'}>PDF</button>
					<button class="paper-view-tab" class:active={mainView === 'summary'} onclick={() => mainView = 'summary'}>Summary</button>
					<button class="paper-view-tab" class:active={mainView === 'chat'} onclick={() => mainView = 'chat'}>Chats</button>
				</div>
				<div class="paper-view-actions">
					<div class="pdf-header-actions">
						{#if page.data.isLocalhost}
						<button onclick={() => fetch(`/api/pdf-proxy/reveal?id=${paper.arxivId || paper.id}`)} class="pdf-action mono">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
							<span class="action-label">Reveal in Finder</span>
						</button>
						{/if}
						{#if paper.arxivUrl}
						<a href={paper.arxivUrl} target="_blank" rel="noopener" class="pdf-action mono">arxiv ↗</a>
						{/if}
						<button class="pdf-action delete-action" onclick={() => confirmingDelete = true} title="Delete paper">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
						</button>
					</div>
					<button
						class="context-toggle"
						class:active={ui.contextPanelOpen}
						onclick={() => ui.contextPanelOpen = !ui.contextPanelOpen}
						aria-label={ui.contextPanelOpen ? 'Hide details' : 'Show details'}
						title={ui.contextPanelOpen ? 'Hide details' : 'Show details'}
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>
						</svg>
					</button>
				</div>
			</div>
		{/if}

		<div class="reader-layout" class:fullscreen={ui.pdfFullscreen} class:resizing={isResizing} class:panel-collapsed={!ui.contextPanelOpen} style="--sidebar-w: {sidebarWidth}px">
			<!-- Main panel (left) -->
			<div class="pdf-panel">
				<div class="pdf-main" class:active={mainView === 'pdf'}>
					{#each ui.openPaperIds as openId (openId)}
						{@const openPaper = papers.get(openId)}
						{#if openPaper}
							<div class="pdf-slot" class:active={openId === page.params.id}>
								<PdfViewer
									arxivId={openPaper.arxivId}
									paperId={openPaper.id}
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

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="main-view-panel summary-main" class:active={mainView === 'summary'} onscroll={handleSummaryScroll}>
					<div class="summary-tab">
						{#if summaryLoading}
							<div class="summary-skeleton">
								<div class="skel-line skel-h1"></div>
								<div class="skel-line skel-meta"></div>
								<div class="skel-spacer"></div>
								<div class="skel-line skel-h2"></div>
								<div class="skel-line skel-text"></div>
								<div class="skel-line skel-text short"></div>
								<div class="skel-line skel-text"></div>
								<div class="skel-spacer"></div>
								<div class="skel-line skel-h2"></div>
								<div class="skel-line skel-text"></div>
								<div class="skel-line skel-text"></div>
								<div class="skel-line skel-text short"></div>
								<div class="skel-spacer"></div>
								<div class="skel-line skel-h2"></div>
								<div class="skel-line skel-text"></div>
								<div class="skel-line skel-text short"></div>
								<p class="text-tertiary" style="margin-top: var(--sp-4); font-size: 0.75rem; text-align: center;">Generating summary with Claude...</p>
							</div>
						{:else if paper.summary}
							<div class="summary-content markdown-body">
								{@html summaryHtml}
							</div>
							<div class="summary-footer">
								{#if paper.summaryDate}
									<span class="summary-date text-tertiary">Generated {new Date(paper.summaryDate).toLocaleDateString()}</span>
								{/if}
								<button class="btn-regenerate" onclick={() => generateSummary(true)} disabled={summaryLoading}>
									Regenerate
								</button>
							</div>
						{:else if summaryError}
							<div class="summary-error">
								<p class="text-tertiary">{summaryError}</p>
								<button class="btn-save" onclick={() => generateSummary()} style="margin-top: var(--sp-3)">Retry</button>
							</div>
						{:else}
							<div class="summary-empty">
								<p class="text-tertiary">No summary yet.</p>
								<button class="btn-save" onclick={() => generateSummary()} style="margin-top: var(--sp-3)">Generate Summary</button>
							</div>
						{/if}
					</div>
				</div>

				<div class="main-view-panel chat-main" class:active={mainView === 'chat'}>
					<div class="chat-tab">
						<div class="chat-header">
							<div class="chat-picker" bind:this={chatPickerRef}>
								<button class="chat-picker-btn" onclick={() => chatPickerOpen = !chatPickerOpen} title="Switch chat">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
									</svg>
									<span class="chat-picker-label">
										{#if paperChatId}
											{chatLabel(chats.get(paperChatId))}
										{:else}
											Select chat
										{/if}
									</span>
									<svg class="chat-picker-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="6 9 12 15 18 9"/>
									</svg>
								</button>
								{#if chatPickerOpen}
									<div class="chat-picker-dropdown">
										<button class="chat-picker-item new-chat" onclick={() => createPaperChat()}>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
												<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
											</svg>
											New chat
										</button>
										{#each paperChats as pc (pc.id)}
											<div class="chat-picker-item" class:active={pc.id === paperChatId}>
												<button class="chat-picker-select" onclick={() => selectPaperChat(pc.id)}>
													{chatLabel(pc)}
												</button>
												<button class="chat-picker-delete" onclick={(e: MouseEvent) => { e.stopPropagation(); deletePaperChat(pc.id); }} title="Delete">
													<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
														<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
													</svg>
												</button>
											</div>
										{/each}
										{#if paperChats.length === 0}
											<p class="chat-picker-empty">No chats yet</p>
										{/if}
									</div>
								{/if}
							</div>
						</div>
						{#if paperChatId}
							<MessageStream
								messages={chatMessages}
								isStreaming={chatStreaming}
								streamingText={chatStreamingContent}
								liveThinkingBlocks={chatLiveThinkingBlocks}
								liveThinkingCurrent={chatLiveThinkingCurrent}
								liveTools={chatLiveTools}
							/>
						{:else}
							<div class="chat-empty">
								<p>A new conversation begins<br />when you ask the first question.</p>
							</div>
						{/if}
						<ChatComposer
							isStreaming={chatStreaming}
							onsend={sendChatMessage}
							onstop={stopChatStreaming}
						/>
					</div>
				</div>
			</div>

				<!-- Resize handle -->
				<div class="resize-handle" onpointerdown={onResizeStart} role="separator" aria-label="Resize sidebar"></div>

				<!-- Context panel (right) -->
				<div class="context-panel" class:panel-open={ui.contextPanelOpen} class:panel-fullscreen={panelFullscreen}>
					<div class="panel-tabs">
						{#each ['info', 'notes'] as tab}
							<button
								class="panel-tab"
								class:active={contextTab === tab}
								onclick={() => contextTab = tab as typeof contextTab}
							>
								{tab.charAt(0).toUpperCase() + tab.slice(1)}
								{#if tab === 'notes' && (paperAnnotations.length + paperNotes.length) > 0}
									<span class="tab-count">{paperAnnotations.length + paperNotes.length}</span>
								{/if}
							</button>
						{/each}
						<button
							class="panel-expand-btn"
							onclick={() => panelFullscreen = !panelFullscreen}
							aria-label={panelFullscreen ? 'Exit fullscreen panel' : 'Expand panel fullscreen'}
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

					<div class="panel-content">
						{#if contextTab === 'info'}
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

							{#if paper.arxivId}
							<div class="field">
								<label class="field-label mono">Arxiv</label>
								<a href={paper.arxivUrl} target="_blank" rel="noopener" class="field-link mono">{paper.arxivId} ↗</a>
							</div>
							{/if}

							<!-- Links -->
							<div class="field">
								<label class="field-label mono">Links</label>
								<div class="tag-list editable">
									{#each (paper.links || []) as link}
										<a href={link} target="_blank" rel="noopener" class="tag mono removable link-tag" onclick={(e) => e.stopPropagation()}>
											{getDomain(link)} ↗
											<button class="link-remove" onclick={(e) => { e.preventDefault(); e.stopPropagation(); removeLink(link); }}>×</button>
										</a>
									{/each}
									{#if addingLink}
										<form class="tag-form" onsubmit={e => { e.preventDefault(); addLink(); }}>
											<!-- svelte-ignore a11y_autofocus -->
											<input
												type="text"
												class="tag-input"
												placeholder="https://…"
												bind:value={linkInput}
												autofocus
												onblur={() => { if (!linkInput) addingLink = false; }}
											/>
										</form>
									{:else}
										<button class="tag add-tag" onclick={() => addingLink = true}>+</button>
									{/if}
								</div>
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

							<!-- Thread -->
							<div class="field">
								<label class="field-label mono">Thread</label>
								<div class="thread-tags">
									{#if currentThread}
										<a href="/threads/{currentThread.id}" class="thread-tag">
											<span class="thread-tag-name">{currentThread.title}</span>
											<span class="thread-tag-status mono">{currentThread.status}</span>
										</a>
									{:else}
										<span class="field-value text-tertiary">No thread</span>
									{/if}
									{#if otherThreads.length > 0}
										<div class="add-thread-wrap" bind:this={moveThreadRef}>
											<button
												class="thread-tag add-thread-btn"
												title="Move to another thread"
												disabled={moving}
												onclick={() => { moveThreadOpen = !moveThreadOpen; threadSearch = ''; }}
											>
												{moving ? '…' : 'Move →'}
											</button>
											{#if moveThreadOpen}
												<div class="add-thread-dropdown">
													<input
														type="text"
														class="thread-search-input"
														placeholder="Move to thread…"
														bind:value={threadSearch}
														autofocus
													/>
													<div class="add-thread-list">
														{#each filteredThreads as t}
															<button class="add-thread-option" onclick={() => movePaperToThread(t.id)}>
																{t.title}
																<span class="thread-tag-status mono">{t.status}</span>
															</button>
														{/each}
														{#if filteredThreads.length === 0}
															<span class="add-thread-empty text-tertiary">No matches</span>
														{/if}
													</div>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<!-- Abstract -->
							<div class="field">
								<label class="field-label mono">Abstract</label>
								<p class="abstract-text">{paper.abstract}</p>
							</div>
						</div>

						{:else}
							<div class="notes-tab">
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

							{#if paperAnnotations.length > 0}
								<div class="notes-section-label mono text-tertiary">Annotations</div>
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

							<div class="notes-section-label mono text-tertiary">Notes</div>
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
								{#if paperNotes.length === 0 && paperAnnotations.length === 0 && !annotationModal}
									<p class="empty-state text-tertiary">No notes or annotations yet.</p>
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
						{/if}
					</div>
				</div>
			</div>
	</div>

	{#if confirmingDelete}
		<ConfirmDeleteModal
			title="Delete paper"
			message="This paper, its annotations, notes, and chats will be permanently deleted."
			onconfirm={deletePaper}
			oncancel={() => confirmingDelete = false}
		/>
	{/if}
{/if}

	<style>
		.paper-detail {
			height: 100%;
			display: flex;
			flex-direction: column;
			min-height: 0;
		}

		.paper-view-switcher {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--sp-3);
			padding: var(--sp-2) var(--sp-4);
			border-bottom: 1px solid var(--border);
			background: var(--bg-raised);
			flex-shrink: 0;
		}

		.paper-view-tabs {
			display: flex;
			align-items: center;
			gap: var(--sp-1);
			min-width: 0;
		}

		.paper-view-actions {
			display: flex;
			align-items: center;
			gap: var(--sp-3);
			min-width: 0;
			margin-left: auto;
		}

		.paper-view-tab {
			padding: var(--sp-1) var(--sp-3);
			font-size: 0.8rem;
			font-family: var(--font-mono);
			color: var(--text-tertiary);
			border-radius: var(--radius-sm);
			transition: background var(--duration-fast), color var(--duration-fast);
		}

		.paper-view-tab:hover {
			background: var(--bg-hover);
			color: var(--text-primary);
		}

		.paper-view-tab.active {
			background: var(--accent-muted);
			color: var(--accent);
		}

		.main-view-panel {
			display: none;
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			background: var(--bg-raised);
			padding: var(--sp-5);
		}

		.main-view-panel.active {
			display: block;
		}

		.summary-main .summary-tab {
			max-width: 980px;
			margin: 0 auto;
		}

		.main-view-panel.chat-main {
			padding: 0;
		}

		.not-found {
			text-align: center;
			padding: var(--sp-16);
		}

		.reader-layout {
			display: grid;
			grid-template-columns: 1fr 0px var(--sidebar-w, 380px);
			flex: 1;
			min-height: 0;
			transition: grid-template-columns var(--duration-normal) var(--ease-out);
		}

	.reader-layout.resizing {
		transition: none;
		user-select: none;
	}

	.reader-layout.fullscreen {
		grid-template-columns: 1fr;
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
	.reader-layout.resizing .resize-handle {
		background: var(--accent);
		opacity: 0.3;
	}

	.resize-handle:hover::after,
	.reader-layout.resizing .resize-handle::after {
		opacity: 1;
	}

	/* Panel collapsed state */
	.reader-layout.panel-collapsed {
		grid-template-columns: 1fr 0px 0px;
	}

	.reader-layout.panel-collapsed .resize-handle {
		display: none;
	}

	.reader-layout.panel-collapsed .context-panel {
		border-left: none;
		overflow: hidden;
	}

	.context-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-1) var(--sp-2);
		color: var(--text-tertiary);
		border-radius: var(--radius-sm);
		transition: background var(--duration-fast), color var(--duration-fast);
		flex-shrink: 0;
	}

	.context-toggle:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.context-toggle.active {
		background: var(--accent-muted);
		color: var(--accent);
	}

	/* PDF panel */
	.pdf-panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-base);
		position: relative;
	}

	.pdf-main {
		display: none;
		flex: 1;
		min-height: 0;
		flex-direction: column;
	}

	.pdf-main.active {
		display: flex;
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

	.pdf-header-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.pdf-action {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		font-size: 0.8rem;
		font-family: var(--font-mono);
		color: var(--text-tertiary);
		transition: background var(--duration-fast), color var(--duration-fast);
		background: none;
		border: none;
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-decoration: none;
	}

	.pdf-action:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.delete-action:hover {
		color: var(--danger, #e53e3e) !important;
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

	.panel-expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-3);
		color: var(--text-tertiary);
		flex-shrink: 0;
		transition: color var(--duration-fast);
	}

	.panel-expand-btn:hover {
		color: var(--accent);
	}

	/* Fullscreen context panel on desktop */
	.context-panel.panel-fullscreen {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		width: 100%;
		max-width: 100%;
		border-left: none;
		z-index: 30;
	}

	.context-panel.panel-fullscreen .panel-content {
		max-width: 960px;
		margin: 0 auto;
		width: 100%;
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

	.link-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		text-decoration: none;
		color: var(--accent);
		background: var(--accent-muted);
	}

	.link-tag:hover {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.link-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		margin: 0 -2px 0 0;
		width: 14px;
		height: 14px;
		font-size: 0.75rem;
		color: var(--text-tertiary);
		border-radius: 2px;
		line-height: 1;
	}

	.link-remove:hover {
		color: var(--status-unread);
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
	.thread-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.thread-tag {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-3);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		text-decoration: none;
		color: inherit;
		font-size: 0.82rem;
		transition: background var(--duration-fast);
	}

	.thread-tag:hover {
		background: var(--bg-hover);
	}

	.thread-tag-status {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-tertiary);
	}

	.add-thread-wrap {
		position: relative;
	}

	.add-thread-btn {
		color: var(--text-tertiary);
		cursor: pointer;
		font-size: 0.9rem;
		padding: var(--sp-1) var(--sp-2);
	}

	.add-thread-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: var(--sp-1);
		min-width: 220px;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 20;
		display: flex;
		flex-direction: column;
	}

	.thread-search-input {
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.8rem;
		border: none;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: inherit;
		outline: none;
	}

	.add-thread-list {
		max-height: 180px;
		overflow-y: auto;
	}

	.add-thread-empty {
		display: block;
		padding: var(--sp-3);
		font-size: 0.8rem;
		text-align: center;
	}

	.add-thread-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.82rem;
		text-align: left;
		color: inherit;
		background: none;
		border: none;
		cursor: pointer;
		transition: background var(--duration-fast);
	}

	.add-thread-option:hover {
		background: var(--bg-hover);
	}

	/* Notes tab */
	.chat-tab {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.chat-header {
		display: flex;
		align-items: center;
		padding: var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.chat-picker {
		position: relative;
		flex: 1;
	}

	.chat-picker-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-family: var(--font-body);
		transition: all var(--duration-fast);
		cursor: pointer;
		width: 100%;
	}

	.chat-picker-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.chat-picker-label {
		flex: 1;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chat-picker-chevron {
		flex-shrink: 0;
		opacity: 0.5;
	}

	.chat-picker-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: var(--sp-1);
		background: var(--bg-overlay);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		z-index: 20;
		max-height: 240px;
		overflow-y: auto;
		padding: var(--sp-1);
	}

	.chat-picker-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		border-radius: var(--radius-sm);
		font-size: 0.82rem;
		color: var(--text-secondary);
		transition: all var(--duration-fast);
	}

	.chat-picker-item:hover {
		background: var(--bg-hover);
	}

	.chat-picker-item.active {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.chat-picker-item.new-chat {
		padding: var(--sp-2) var(--sp-3);
		color: var(--accent);
		font-weight: 500;
		cursor: pointer;
		border-bottom: 1px solid var(--border);
		margin-bottom: var(--sp-1);
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
	}

	.chat-picker-select {
		flex: 1;
		text-align: left;
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.82rem;
		font-family: var(--font-body);
		color: inherit;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chat-picker-delete {
		flex-shrink: 0;
		display: none;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		margin-right: var(--sp-1);
	}

	.chat-picker-item:hover .chat-picker-delete {
		display: flex;
	}

	.chat-picker-delete:hover {
		color: var(--status-unread);
		background: var(--bg-surface);
	}

	.chat-picker-empty {
		text-align: center;
		color: var(--text-tertiary);
		font-size: 0.8rem;
		padding: var(--sp-3);
	}

	.chat-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1rem;
		padding: var(--sp-6);
		text-align: center;
	}

	.notes-tab {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow-y: auto;
	}

	.notes-section-label {
		font-size: 0.65rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: var(--sp-3) 0 var(--sp-2);
	}

	.notes-list {
		flex: 1;
		min-height: 0;
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

	.summary-empty,
	.summary-error {
		text-align: center;
		padding: var(--sp-8) 0;
	}

	/* Skeleton loading */
	.summary-skeleton {
		padding: var(--sp-2) 0;
	}

	.skel-line {
		height: 12px;
		border-radius: 4px;
		background: linear-gradient(90deg, var(--border) 25%, var(--bg-base) 50%, var(--border) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s ease-in-out infinite;
		margin-bottom: var(--sp-2);
	}

	.skel-h1 {
		height: 16px;
		width: 70%;
		margin-bottom: var(--sp-3);
	}

	.skel-meta {
		height: 10px;
		width: 45%;
		margin-bottom: var(--sp-2);
	}

	.skel-h2 {
		height: 11px;
		width: 35%;
		margin-bottom: var(--sp-3);
		margin-top: var(--sp-1);
	}

	.skel-text {
		width: 100%;
	}

	.skel-text.short {
		width: 65%;
	}

	.skel-spacer {
		height: var(--sp-4);
	}

	@keyframes shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
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

	.markdown-body :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0 0 var(--sp-4);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.markdown-body :global(thead) {
		border-bottom: 2px solid var(--border);
	}

	.markdown-body :global(th) {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		padding: var(--sp-2) var(--sp-3);
		white-space: nowrap;
	}

	.markdown-body :global(td) {
		padding: var(--sp-2) var(--sp-3);
		border-bottom: 1px solid var(--border-subtle);
		color: var(--text-secondary);
	}

	.markdown-body :global(tbody tr:hover) {
		background: var(--bg-base);
	}

	.markdown-body :global(td:first-child),
	.markdown-body :global(th:first-child) {
		padding-left: 0;
	}

	.markdown-body :global(td:last-child),
	.markdown-body :global(th:last-child) {
		padding-right: 0;
	}

	/* ── Tablet / iPad (≤768px) ── */
	@media (max-width: 768px) {
		.paper-view-switcher {
			overflow-x: auto;
			scrollbar-width: none;
			padding: var(--sp-2);
		}

		.paper-view-switcher::-webkit-scrollbar {
			display: none;
		}

		.paper-view-tab {
			white-space: nowrap;
		}

		.paper-view-actions {
			flex-shrink: 0;
			gap: var(--sp-2);
		}

		.main-view-panel {
			padding: var(--sp-4);
		}

		.main-view-panel.chat-main {
			padding: 0;
		}

		.reader-layout {
			grid-template-columns: 1fr;
			position: relative;
		}

		/* On mobile, ignore panel-collapsed grid override — use overlay instead */
		.reader-layout.panel-collapsed {
			grid-template-columns: 1fr;
		}

		.resize-handle {
			display: none;
		}

		.pdf-panel {
			min-height: 0;
		}

		/* Context panel as slide-in overlay on mobile */
		.context-panel {
			position: absolute;
			top: 0;
			right: 0;
			bottom: 0;
			left: 0;
			width: 100%;
			max-width: 100%;
			border-left: none;
			box-shadow: none;
			transform: translateX(100%);
			transition: transform var(--duration-normal) var(--ease-out);
			z-index: 20;
		}

		.context-panel.panel-open {
			transform: translateX(0);
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

		.paper-view-actions .action-label {
			display: none;
		}
	}

	/* ── Fullscreen override ── */
	.reader-layout.fullscreen .context-panel,
	.reader-layout.fullscreen .resize-handle {
		display: none;
	}

	/* ── Phone (≤480px) ── */
	@media (max-width: 480px) {
		.main-view-panel {
			padding: var(--sp-3);
		}

		.main-view-panel.chat-main {
			padding: 0;
		}

		.panel-content {
			padding: var(--sp-3);
		}

		.pdf-header-actions {
			gap: var(--sp-2);
		}
	}
</style>
