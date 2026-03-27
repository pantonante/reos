<script lang="ts">
	import { onMount } from 'svelte';
	import 'pdfjs-dist/web/pdf_viewer.css';
	import type { Annotation } from '$lib/types';

	interface Props {
		arxivId: string;
		annotations: Annotation[];
		onCreateAnnotation: (selectedText: string, page: number) => void;
		onClickAnnotation?: (annotation: Annotation) => void;
	}

	let { arxivId, annotations, onCreateAnnotation, onClickAnnotation }: Props = $props();

	let container: HTMLDivElement;
	let pdfDoc: any = null;
	let currentScale = $state(1.2);
	let numPages = $state(0);
	let loading = $state(true);
	let error = $state('');
	let renderedPages = $state<Set<number>>(new Set());

	// Selection popover state
	let popover = $state<{ x: number; y: number; text: string; page: number } | null>(null);

	// Track page elements for intersection observer
	let pageElements: Map<number, HTMLDivElement> = new Map();

	let pdfjsLib: typeof import('pdfjs-dist');

	onMount(async () => {
		try {
			pdfjsLib = await import('pdfjs-dist');

			const workerUrl = new URL(
				'pdfjs-dist/build/pdf.worker.mjs',
				import.meta.url
			).toString();
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

			const loadingTask = pdfjsLib.getDocument(`/api/pdf-proxy?id=${encodeURIComponent(arxivId)}`);
			pdfDoc = await loadingTask.promise;
			numPages = pdfDoc.numPages;
			loading = false;

			await renderAllPages();
		} catch (e: any) {
			error = e.message || 'Failed to load PDF';
			loading = false;
		}
	});

	async function renderAllPages() {
		if (!pdfDoc) return;
		for (let i = 1; i <= numPages; i++) {
			await renderPage(i);
		}
	}

	async function renderPage(pageNum: number) {
		if (!pdfDoc || renderedPages.has(pageNum)) return;
		renderedPages = new Set([...renderedPages, pageNum]);

		const page = await pdfDoc.getPage(pageNum);
		const viewport = page.getViewport({ scale: currentScale });

		const pageDiv = container.querySelector(`[data-page="${pageNum}"]`) as HTMLDivElement;
		if (!pageDiv) return;

		// Canvas for PDF rendering
		const canvas = pageDiv.querySelector('canvas') as HTMLCanvasElement;
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		canvas.style.width = `${viewport.width}px`;
		canvas.style.height = `${viewport.height}px`;

		const ctx = canvas.getContext('2d')!;
		await page.render({ canvasContext: ctx, viewport }).promise;

		// Text layer for selection
		const textLayerDiv = pageDiv.querySelector('.textLayer') as HTMLDivElement;
		textLayerDiv.style.width = `${viewport.width}px`;
		textLayerDiv.style.height = `${viewport.height}px`;

		const textContent = await page.getTextContent();
		const textLayer = new pdfjsLib.TextLayer({
			textContentSource: textContent,
			container: textLayerDiv,
			viewport: viewport,
		});
		await textLayer.render();

		// Highlight layer for annotations
		renderHighlights(pageNum, viewport, textLayerDiv);
	}

	function renderHighlights(pageNum: number, viewport: any, textLayerDiv: HTMLDivElement) {
		const pageAnnotations = annotations.filter(a => a.page === pageNum);
		const highlightLayer = textLayerDiv.parentElement?.querySelector('.highlight-layer') as HTMLDivElement;
		if (!highlightLayer) return;
		highlightLayer.innerHTML = '';
		highlightLayer.style.width = `${viewport.width}px`;
		highlightLayer.style.height = `${viewport.height}px`;

		for (const ann of pageAnnotations) {
			if (!ann.selectedText) continue;
			// Find matching text spans in the text layer
			const spans = textLayerDiv.querySelectorAll('span');
			const matchRanges = findTextInSpans(spans, ann.selectedText);

			for (const range of matchRanges) {
				const rects = range.getClientRects();
				const layerRect = highlightLayer.getBoundingClientRect();

				for (const rect of rects) {
					const highlightEl = document.createElement('div');
					highlightEl.className = 'pdf-highlight';
					highlightEl.dataset.annotationId = ann.id;
					highlightEl.style.left = `${rect.left - layerRect.left}px`;
					highlightEl.style.top = `${rect.top - layerRect.top}px`;
					highlightEl.style.width = `${rect.width}px`;
					highlightEl.style.height = `${rect.height}px`;
					highlightEl.style.backgroundColor = ann.color || 'var(--highlight-yellow)';
					highlightEl.title = ann.content || '';
					highlightEl.addEventListener('click', () => onClickAnnotation?.(ann));
					highlightLayer.appendChild(highlightEl);
				}
			}
		}
	}

	function findTextInSpans(spans: NodeListOf<HTMLSpanElement>, searchText: string): Range[] {
		const ranges: Range[] = [];
		const normalized = searchText.replace(/\s+/g, ' ').trim().toLowerCase();
		if (!normalized) return ranges;

		// Build a text map from spans
		let fullText = '';
		const charMap: { node: Text; offset: number }[] = [];

		for (const span of spans) {
			const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
			let textNode: Text | null;
			while ((textNode = walker.nextNode() as Text | null)) {
				const text = textNode.textContent || '';
				for (let i = 0; i < text.length; i++) {
					charMap.push({ node: textNode, offset: i });
				}
				fullText += text;
			}
			// Add space between spans
			charMap.push({ node: null!, offset: 0 });
			fullText += ' ';
		}

		const lowerFull = fullText.toLowerCase();
		let searchStart = 0;
		while (true) {
			const idx = lowerFull.indexOf(normalized, searchStart);
			if (idx === -1) break;

			const startChar = charMap[idx];
			const endChar = charMap[idx + normalized.length - 1];
			if (startChar?.node && endChar?.node) {
				const range = document.createRange();
				range.setStart(startChar.node, startChar.offset);
				range.setEnd(endChar.node, endChar.offset + 1);
				ranges.push(range);
			}
			searchStart = idx + 1;
		}

		return ranges;
	}

	function handleMouseUp(e: MouseEvent) {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !sel.toString().trim()) {
			popover = null;
			return;
		}

		const text = sel.toString().trim();
		if (text.length < 2) return;

		// Determine which page the selection is in
		let pageNum = 1;
		const anchorNode = sel.anchorNode;
		if (anchorNode) {
			const pageDiv = (anchorNode as Element).closest?.('[data-page]')
				|| (anchorNode.parentElement?.closest('[data-page]'));
			if (pageDiv) {
				pageNum = parseInt(pageDiv.getAttribute('data-page') || '1');
			}
		}

		// Position popover near the selection
		const range = sel.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();

		popover = {
			x: rect.left - containerRect.left + rect.width / 2,
			y: rect.top - containerRect.top - 8,
			text,
			page: pageNum,
		};
	}

	function handleAnnotate() {
		if (!popover) return;
		onCreateAnnotation(popover.text, popover.page);
		window.getSelection()?.removeAllRanges();
		popover = null;
	}

	function dismissPopover() {
		popover = null;
	}

	function zoomIn() {
		currentScale = Math.min(currentScale + 0.2, 3);
		rerender();
	}

	function zoomOut() {
		currentScale = Math.max(currentScale - 0.2, 0.5);
		rerender();
	}

	function rerender() {
		renderedPages = new Set();
		// Clear canvases and text layers, then re-render
		requestAnimationFrame(() => renderAllPages());
	}

	// Re-render highlights when annotations change
	$effect(() => {
		// Access annotations to track reactivity
		const _ = annotations.length;
		if (!pdfDoc || loading) return;

		// Re-render highlight layers
		for (let i = 1; i <= numPages; i++) {
			const pageDiv = container?.querySelector(`[data-page="${i}"]`) as HTMLDivElement;
			if (!pageDiv) continue;
			const textLayerDiv = pageDiv.querySelector('.textLayer') as HTMLDivElement;
			if (!textLayerDiv) continue;

			const page = pdfDoc.getPage(i).then((p: any) => {
				const viewport = p.getViewport({ scale: currentScale });
				renderHighlights(i, viewport, textLayerDiv);
			});
		}
	});
</script>

<div class="pdf-viewer" bind:this={container}>
	<!-- Toolbar -->
	<div class="pdf-toolbar">
		<div class="pdf-toolbar-left">
			<span class="mono page-info">
				{#if numPages > 0}{numPages} pages{/if}
			</span>
		</div>
		<div class="pdf-toolbar-center">
			<button class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>
			<span class="mono zoom-level">{Math.round(currentScale * 100)}%</span>
			<button class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
		</div>
		<div class="pdf-toolbar-right">
			<span class="mono hint">Select text to annotate</span>
		</div>
	</div>

	<!-- PDF pages -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="pdf-pages" onmouseup={handleMouseUp}>
		{#if loading}
			<div class="pdf-loading">
				<span class="mono">Loading PDF...</span>
			</div>
		{:else if error}
			<div class="pdf-error">
				<span class="mono">{error}</span>
			</div>
		{:else}
			{#each Array.from({ length: numPages }, (_, i) => i + 1) as pageNum}
				<div class="pdf-page-wrapper" data-page={pageNum}>
					<canvas></canvas>
					<div class="highlight-layer"></div>
					<div class="textLayer"></div>
					<div class="page-number mono">Page {pageNum}</div>
				</div>
			{/each}
		{/if}

		<!-- Selection popover -->
		{#if popover}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="selection-popover"
				style="left: {popover.x}px; top: {popover.y}px;"
				onmousedown={(e) => e.stopPropagation()}
			>
				<button class="popover-btn" onclick={handleAnnotate}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/></svg>
					Annotate
				</button>
				<button class="popover-dismiss" onclick={dismissPopover}>×</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.pdf-viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		position: relative;
	}

	.pdf-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-2) var(--sp-4);
		background: var(--bg-raised);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.pdf-toolbar-left,
	.pdf-toolbar-right {
		flex: 1;
	}

	.pdf-toolbar-right {
		text-align: right;
	}

	.pdf-toolbar-center {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.page-info,
	.zoom-level {
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.hint {
		font-size: 0.68rem;
		color: var(--text-tertiary);
		opacity: 0.7;
	}

	.zoom-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		font-size: 1rem;
		font-weight: 500;
		color: var(--text-tertiary);
		transition: all var(--duration-fast);
	}

	.zoom-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.pdf-pages {
		flex: 1;
		overflow-y: auto;
		overflow-x: auto;
		background: #525252;
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		position: relative;
	}

	.pdf-loading,
	.pdf-error {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-tertiary);
	}

	.pdf-error {
		color: var(--status-unread);
	}

	.pdf-page-wrapper {
		position: relative;
		background: white;
		box-shadow: var(--shadow-md);
	}

	.pdf-page-wrapper canvas {
		display: block;
	}

	/* Override PDF.js text layer selection color */
	.pdf-page-wrapper :global(.textLayer ::selection) {
		background: rgba(212, 160, 83, 0.4);
	}

	.highlight-layer {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.highlight-layer :global(.pdf-highlight) {
		position: absolute;
		pointer-events: auto;
		cursor: pointer;
		border-radius: 2px;
		mix-blend-mode: multiply;
		transition: opacity var(--duration-fast);
	}

	.highlight-layer :global(.pdf-highlight:hover) {
		opacity: 0.8;
		outline: 2px solid var(--accent);
	}

	.page-number {
		position: absolute;
		bottom: -20px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Selection popover */
	.selection-popover {
		position: absolute;
		transform: translate(-50%, -100%);
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 2px;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 2px;
		box-shadow: var(--shadow-lg);
		animation: slideUp var(--duration-fast) var(--ease-out);
	}

	.popover-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-1) var(--sp-3);
		font-size: 0.78rem;
		font-family: var(--font-mono);
		color: var(--accent);
		border-radius: var(--radius-sm);
		transition: background var(--duration-fast);
		white-space: nowrap;
	}

	.popover-btn:hover {
		background: var(--bg-hover);
	}

	.popover-dismiss {
		padding: var(--sp-1) var(--sp-2);
		font-size: 0.85rem;
		color: var(--text-tertiary);
		border-radius: var(--radius-sm);
	}

	.popover-dismiss:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}
</style>
