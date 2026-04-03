<script lang="ts">
	import { papers, threads, connections } from '$lib/stores.svelte';
	import type { ConnectionType, PaperConnection } from '$lib/types';
	import { onMount, tick } from 'svelte';

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);
	let terminalEl = $state<HTMLDivElement | null>(null);
	let hoveredNode = $state<string | null>(null);
	let filterThread = $state('all');
	let filterStatus = $state('all');
	let filterConnectionType = $state('all');
	let generating = $state(false);
	let terminalOpen = $state(false);
	let terminalLines = $state<{ type: string; text: string }[]>([]);
	let currentPaperIndex = $state(0);
	let totalPapers = $state(0);
	let tooltipContent = $state<{ x: number; y: number; lines: string[] } | null>(null);
	let legendOpen = $state(true);

	// Zoom & pan state
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let panStartX = 0;
	let panStartY = 0;
	let panStartPanX = 0;
	let panStartPanY = 0;

	// Node dragging state
	let draggedNode = $state<string | null>(null);
	let didDragOrPan = false;
	let mouseDownPos = { x: 0, y: 0 };

	// Simulation control
	let simulating = $state(true);

	// Selected paper sidebar
	let selectedPaperId = $state<string | null>(null);

	const connectionStyles: Record<string, { color: string; dash: number[]; arrow: boolean; label: string }> = {
		'citation':      { color: '#2f2f36', dash: [],       arrow: true,  label: 'Citation' },
		'builds-on':     { color: '#d4a053', dash: [],       arrow: true,  label: 'Builds on' },
		'same-method':   { color: '#5a9ad4', dash: [8, 4],   arrow: false, label: 'Same method' },
		'same-topic':    { color: '#6abf8a', dash: [4, 4],   arrow: false, label: 'Same topic' },
		'contradicts':   { color: '#d45a8a', dash: [12, 4],  arrow: false, label: 'Contradicts' },
		'complementary': { color: '#9a6abf', dash: [2, 4],   arrow: false, label: 'Complementary' },
	};

	interface GraphEdge {
		from: string;
		to: string;
		type: 'citation' | ConnectionType;
		strength?: number;
		explanation?: string;
	}

	// Build graph data
	const nodes = $derived.by(() => {
		let result = papers.items;
		if (filterStatus !== 'all') {
			result = result.filter(p => p.readingStatus === filterStatus);
		}
		if (filterThread !== 'all') {
			const thread = threads.get(filterThread);
			if (thread) {
				const ids = new Set(thread.papers.map(tp => tp.paperId));
				result = result.filter(p => ids.has(p.id));
			}
		}
		return result;
	});

	const edges = $derived.by(() => {
		const nodeIds = new Set(nodes.map(n => n.id));
		const result: GraphEdge[] = [];

		// Citation edges
		if (filterConnectionType === 'all' || filterConnectionType === 'citations') {
			for (const node of nodes) {
				for (const citedId of node.citations) {
					if (nodeIds.has(citedId)) {
						result.push({ from: node.id, to: citedId, type: 'citation' });
					}
				}
			}
		}

		// AI connection edges
		if (filterConnectionType !== 'citations') {
			for (const conn of connections.items) {
				if (!nodeIds.has(conn.fromPaperId) || !nodeIds.has(conn.toPaperId)) continue;
				if (filterConnectionType !== 'all' && conn.connectionType !== filterConnectionType) continue;
				result.push({
					from: conn.fromPaperId,
					to: conn.toPaperId,
					type: conn.connectionType,
					strength: conn.strength,
					explanation: conn.explanation,
				});
			}
		}

		return result;
	});

	const citationCount = $derived(edges.filter(e => e.type === 'citation').length);
	const connectionCount = $derived(edges.filter(e => e.type !== 'citation').length);

	// Papers that have no connections yet (not appearing in any connection as from or to)
	const processedPaperIds = $derived(new Set(
		connections.items.flatMap(c => [c.fromPaperId, c.toPaperId])
	));
	const unprocessedPapers = $derived(
		papers.items.filter(p => !processedPaperIds.has(p.id))
	);

	interface ConnectedPaper {
		paper: import('$lib/types').Paper;
		type: string;
		label: string;
		color: string;
		strength?: number;
		explanation?: string;
		direction: 'from' | 'to' | 'undirected';
	}

	const selectedPaper = $derived(selectedPaperId ? papers.get(selectedPaperId) : null);
	const connectedPapers = $derived.by(() => {
		if (!selectedPaperId) return [];
		const result: ConnectedPaper[] = [];
		const seen = new Set<string>();

		for (const edge of edges) {
			let otherId: string | null = null;
			let direction: 'from' | 'to' | 'undirected' = 'undirected';

			if (edge.from === selectedPaperId) {
				otherId = edge.to;
				direction = connectionStyles[edge.type]?.arrow ? 'to' : 'undirected';
			} else if (edge.to === selectedPaperId) {
				otherId = edge.from;
				direction = connectionStyles[edge.type]?.arrow ? 'from' : 'undirected';
			}
			if (!otherId) continue;

			const key = `${otherId}-${edge.type}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const other = papers.get(otherId);
			if (!other) continue;

			const style = connectionStyles[edge.type] || connectionStyles['citation'];
			result.push({
				paper: other,
				type: edge.type,
				label: style.label,
				color: style.color,
				strength: edge.strength,
				explanation: edge.explanation,
				direction,
			});
		}
		return result;
	});

	function getThreadColor(paperId: string): string {
		const colors = ['#d4a053', '#6abf8a', '#5a9ad4', '#d45a8a', '#9a6abf', '#bf8a6a'];
		for (let i = 0; i < threads.items.length; i++) {
			if (threads.items[i].papers.some(tp => tp.paperId === paperId)) {
				return colors[i % colors.length];
			}
		}
		return '#6b665c';
	}

	// Terminal helpers
	function addTerminalLine(type: string, text: string) {
		terminalLines = [...terminalLines, { type, text }];
		tick().then(() => {
			if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
		});
	}

	function clearTerminal() {
		terminalLines = [];
	}

	// Simple force-directed layout
	interface NodePos { id: string; x: number; y: number; vx: number; vy: number }
	let positions = $state<NodePos[]>([]);

	function initPositions(width: number, height: number) {
		const cx = width / 2;
		const cy = height / 2;
		positions = nodes.map((n, i) => ({
			id: n.id,
			x: cx + (Math.cos(i * 2.4) * 120) + (Math.random() - 0.5) * 80,
			y: cy + (Math.sin(i * 2.4) * 120) + (Math.random() - 0.5) * 80,
			vx: 0,
			vy: 0,
		}));
	}

	function simulate() {
		if (!simulating) return;

		const damping = 0.85;
		const repulsion = 4000;
		const springLen = 180;
		const springK = 0.018;
		const centerPull = 0.002;

		if (!canvasEl) return;
		const cx = canvasEl.width / 2;
		const cy = canvasEl.height / 2;

		for (const p of positions) {
			if (p.id === draggedNode) continue; // skip dragged node

			p.vx += (cx - p.x) * centerPull;
			p.vy += (cy - p.y) * centerPull;

			for (const q of positions) {
				if (p.id === q.id) continue;
				const dx = p.x - q.x;
				const dy = p.y - q.y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const force = repulsion / (dist * dist);
				p.vx += (dx / dist) * force;
				p.vy += (dy / dist) * force;
			}
		}

		for (const edge of edges) {
			const a = positions.find(p => p.id === edge.from);
			const b = positions.find(p => p.id === edge.to);
			if (!a || !b) continue;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const dist = Math.sqrt(dx * dx + dy * dy) || 1;
			const k = edge.type === 'citation' ? springK : springK * (edge.strength ?? 0.5) * 0.5;
			const force = (dist - springLen) * k;
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			if (a.id !== draggedNode) { a.vx += fx; a.vy += fy; }
			if (b.id !== draggedNode) { b.vx -= fx; b.vy -= fy; }
		}

		let totalEnergy = 0;
		for (const p of positions) {
			if (p.id === draggedNode) { p.vx = 0; p.vy = 0; continue; }
			p.vx *= damping;
			p.vy *= damping;
			p.x += p.vx;
			p.y += p.vy;
			totalEnergy += p.vx * p.vx + p.vy * p.vy;
		}

		// Stop simulating when settled
		if (totalEnergy < 0.1 && !draggedNode) {
			simulating = false;
		}
	}

	function reheat() {
		simulating = true;
		for (const p of positions) {
			p.vx += (Math.random() - 0.5) * 5;
			p.vy += (Math.random() - 0.5) * 5;
		}
	}

	function screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
	}

	function draw() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
		ctx.save();
		ctx.translate(panX, panY);
		ctx.scale(zoom, zoom);

		for (const edge of edges) {
			const a = positions.find(p => p.id === edge.from);
			const b = positions.find(p => p.id === edge.to);
			if (!a || !b) continue;

			const style = connectionStyles[edge.type] || connectionStyles['citation'];
			const isHighlighted = hoveredNode === edge.from || hoveredNode === edge.to
				|| selectedPaperId === edge.from || selectedPaperId === edge.to;

			ctx.setLineDash(style.dash);
			ctx.lineWidth = (edge.type === 'citation' ? 1 : Math.max(0.5, (edge.strength ?? 0.5) * 2.5)) / zoom;
			ctx.strokeStyle = isHighlighted ? style.color + 'cc' : style.color + '60';
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();

			if (style.arrow) {
				const angle = Math.atan2(b.y - a.y, b.x - a.x);
				const arrowLen = 8 / zoom;
				const mx = b.x - Math.cos(angle) * (14 / zoom);
				const my = b.y - Math.sin(angle) * (14 / zoom);
				ctx.beginPath();
				ctx.moveTo(mx, my);
				ctx.lineTo(mx - arrowLen * Math.cos(angle - 0.4), my - arrowLen * Math.sin(angle - 0.4));
				ctx.moveTo(mx, my);
				ctx.lineTo(mx - arrowLen * Math.cos(angle + 0.4), my - arrowLen * Math.sin(angle + 0.4));
				ctx.stroke();
			}

			ctx.setLineDash([]);
		}

		for (const pos of positions) {
			const paper = papers.get(pos.id);
			if (!paper) continue;

			const color = getThreadColor(pos.id);
			const isHovered = hoveredNode === pos.id;
			const isSelected = selectedPaperId === pos.id;
			const radius = isHovered || isSelected ? 10 : 7;

			if (isHovered || isSelected) {
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
				ctx.fillStyle = color + '20';
				ctx.fill();
			}

			ctx.beginPath();
			ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();

			const fontSize = isHovered ? 13 / zoom : 12 / zoom;
			ctx.font = isHovered ? `500 ${fontSize}px "DM Sans"` : `${fontSize}px "DM Sans"`;
			ctx.fillStyle = isHovered ? '#e8e4dc' : '#a09a8e';
			ctx.textAlign = 'center';
			const label = paper.title.length > 30 ? paper.title.slice(0, 28) + '\u2026' : paper.title;
			ctx.fillText(label, pos.x, pos.y + radius + 16 / zoom);
		}

		ctx.restore();
	}

	function findNodeAtScreen(sx: number, sy: number): string | null {
		const { x: wx, y: wy } = screenToWorld(sx, sy);
		const hitRadius = 15 / zoom;
		for (const pos of positions) {
			const dx = wx - pos.x;
			const dy = wy - pos.y;
			if (dx * dx + dy * dy < hitRadius * hitRadius) {
				return pos.id;
			}
		}
		return null;
	}

	function handleCanvasMouseMove(e: MouseEvent) {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;

		// Detect meaningful movement (> 4px) to distinguish click from drag
		const movedDist = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);
		if (movedDist > 4) didDragOrPan = true;

		// Handle node dragging
		if (draggedNode && didDragOrPan) {
			const { x: wx, y: wy } = screenToWorld(sx, sy);
			const pos = positions.find(p => p.id === draggedNode);
			if (pos) {
				pos.x = wx;
				pos.y = wy;
			}
			simulating = true;
			return;
		}

		// Handle panning
		if (isPanning && didDragOrPan) {
			panX = panStartPanX + (e.clientX - panStartX);
			panY = panStartPanY + (e.clientY - panStartY);
			canvasEl.style.cursor = 'grabbing';
			tooltipContent = null;
			return;
		}

		hoveredNode = findNodeAtScreen(sx, sy);
		canvasEl.style.cursor = hoveredNode ? 'pointer' : 'default';

		if (hoveredNode) {
			const nodeEdges = edges.filter(
				e => (e.from === hoveredNode || e.to === hoveredNode) && e.type !== 'citation' && e.explanation
			);
			if (nodeEdges.length > 0) {
				const lines = nodeEdges.map(edge => {
					const otherId = edge.from === hoveredNode ? edge.to : edge.from;
					const otherPaper = papers.get(otherId);
					const otherTitle = otherPaper ? (otherPaper.title.length > 40 ? otherPaper.title.slice(0, 38) + '\u2026' : otherPaper.title) : otherId;
					const style = connectionStyles[edge.type];
					return `${style?.label || edge.type} (${Math.round((edge.strength ?? 0) * 100)}%) \u2192 ${otherTitle}`;
				});
				tooltipContent = { x: e.clientX, y: e.clientY, lines };
			} else {
				tooltipContent = null;
			}
		} else {
			tooltipContent = null;
		}
	}

	function handleCanvasMouseDown(e: MouseEvent) {
		if (!canvasEl) return;
		mouseDownPos = { x: e.clientX, y: e.clientY };
		didDragOrPan = false;

		const rect = canvasEl.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;

		const nodeId = findNodeAtScreen(sx, sy);
		if (nodeId) {
			// Start dragging a node (actual drag only if mouse moves)
			draggedNode = nodeId;
			simulating = true;
		} else {
			// Start panning (actual pan only if mouse moves)
			isPanning = true;
			panStartX = e.clientX;
			panStartY = e.clientY;
			panStartPanX = panX;
			panStartPanY = panY;
		}
	}

	function handleCanvasMouseUp() {
		draggedNode = null;
		isPanning = false;
		if (canvasEl) canvasEl.style.cursor = 'default';
	}

	function handleCanvasClick(e: MouseEvent) {
		if (didDragOrPan) return;
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;
		const nodeId = findNodeAtScreen(sx, sy);
		if (nodeId) {
			selectedPaperId = selectedPaperId === nodeId ? null : nodeId;
		} else {
			selectedPaperId = null;
		}
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;

		const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
		const newZoom = Math.min(5, Math.max(0.1, zoom * zoomFactor));

		// Zoom centered on cursor position
		panX = sx - (sx - panX) * (newZoom / zoom);
		panY = sy - (sy - panY) * (newZoom / zoom);
		zoom = newZoom;
	}

	function zoomIn() { handleZoomButton(1.3); }
	function zoomOut() { handleZoomButton(1 / 1.3); }
	function zoomReset() {
		zoom = 1;
		panX = 0;
		panY = 0;
	}
	function handleZoomButton(factor: number) {
		if (!canvasEl) return;
		const cx = canvasEl.width / 2;
		const cy = canvasEl.height / 2;
		const newZoom = Math.min(5, Math.max(0.1, zoom * factor));
		panX = cx - (cx - panX) * (newZoom / zoom);
		panY = cy - (cy - panY) * (newZoom / zoom);
		zoom = newZoom;
	}

	async function streamConnectionsForPaper(paperId: string, paperTitle: string, regenerate: boolean): Promise<PaperConnection[]> {
		addTerminalLine('status', `\n--- Analyzing: ${paperTitle} ---`);

		const res = await fetch('/api/papers/connections', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ paperId, regenerate }),
		});

		if (!res.ok || !res.body) {
			addTerminalLine('error', `Failed to start connection generation`);
			return [];
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let result: PaperConnection[] = [];
		let currentToolInput = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				try {
					const event = JSON.parse(line.slice(6));

					if (event.type === 'status') {
						addTerminalLine('status', event.text);
					} else if (event.type === 'text') {
						// Accumulate text into last line or create new
						const last = terminalLines[terminalLines.length - 1];
						if (last && last.type === 'output') {
							terminalLines = [
								...terminalLines.slice(0, -1),
								{ type: 'output', text: last.text + event.text },
							];
						} else {
							addTerminalLine('output', event.text);
						}
						tick().then(() => {
							if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
						});
					} else if (event.type === 'tool_start') {
						currentToolInput = '';
						addTerminalLine('tool', `> ${event.tool}`);
					} else if (event.type === 'tool_input') {
						currentToolInput += event.text;
						// Try to extract meaningful info from tool input
						try {
							const parsed = JSON.parse(currentToolInput);
							if (parsed.file_path) {
								const last = terminalLines[terminalLines.length - 1];
								if (last && last.type === 'tool') {
									terminalLines = [
										...terminalLines.slice(0, -1),
										{ type: 'tool', text: `> Read ${parsed.file_path.split('/').pop()}` },
									];
								}
							}
						} catch {
							// Partial JSON, wait for more
						}
					} else if (event.type === 'tool_stop') {
						// Tool completed
					} else if (event.type === 'error') {
						addTerminalLine('error', event.error);
					} else if (event.type === 'done') {
						result = event.connections || [];
						const count = result.length;
						addTerminalLine('success', `Found ${count} connection${count !== 1 ? 's' : ''}`);
					}
				} catch {
					// Skip malformed events
				}
			}
		}

		return result;
	}

	async function generateConnections(mode: 'incremental' | 'all' = 'incremental') {
		generating = true;
		terminalOpen = true;
		clearTerminal();

		const regenerate = mode === 'all';
		const papersToProcess = mode === 'all' ? papers.items : unprocessedPapers;
		totalPapers = papersToProcess.length;
		currentPaperIndex = 0;

		if (papersToProcess.length === 0) {
			addTerminalLine('success', 'All papers already have connections.');
			generating = false;
			return;
		}

		const skipped = papers.items.length - papersToProcess.length;
		if (skipped > 0 && mode === 'incremental') {
			addTerminalLine('status', `Skipping ${skipped} already-processed paper${skipped !== 1 ? 's' : ''}`);
		}
		addTerminalLine('status', `Processing ${totalPapers} paper${totalPapers !== 1 ? 's' : ''}...`);

		try {
			for (const paper of papersToProcess) {
				currentPaperIndex++;
				const newConns = await streamConnectionsForPaper(paper.id, paper.title, regenerate);

				// Merge into store
				connections.items = [
					...connections.items.filter(c => c.fromPaperId !== paper.id && c.toPaperId !== paper.id),
					...newConns,
				];
			}
			addTerminalLine('success', `\nDone! Found ${connections.items.length} total connections.`);
		} catch (err) {
			addTerminalLine('error', `Error: ${err}`);
		} finally {
			generating = false;
		}
	}

	let animFrame: number;

	onMount(() => {
		connections.load();

		if (!canvasEl || !containerEl) return;

		const resize = () => {
			if (!canvasEl || !containerEl) return;
			canvasEl.width = containerEl.clientWidth;
			canvasEl.height = containerEl.clientHeight;
		};

		resize();
		initPositions(canvasEl.width, canvasEl.height);

		function loop() {
			simulate();
			draw();
			animFrame = requestAnimationFrame(loop);
		}
		loop();

		window.addEventListener('resize', resize);
		return () => {
			cancelAnimationFrame(animFrame);
			window.removeEventListener('resize', resize);
		};
	});

	$effect(() => {
		nodes; // dependency
		if (canvasEl) {
			initPositions(canvasEl.width, canvasEl.height);
			simulating = true;
		}
	});
</script>

<div class="graph-page">
	<header class="graph-header">
		<div class="header-left">
			<h1>Graph</h1>
			<p class="page-subtitle text-secondary">
				{nodes.length} papers · {citationCount} citations{#if connectionCount > 0} · {connectionCount} connections{/if}
			</p>
		</div>
		<div class="graph-actions">
			{#if generating}
				<button class="generate-btn" disabled>
					Generating {currentPaperIndex}/{totalPapers}...
				</button>
			{:else if unprocessedPapers.length > 0}
				<button
					class="generate-btn"
					onclick={() => generateConnections('incremental')}
					disabled={papers.items.length < 2}
				>
					{#if connections.items.length > 0}
						Find New Connections ({unprocessedPapers.length})
					{:else}
						Find Connections
					{/if}
				</button>
			{/if}
			{#if !generating && connections.items.length > 0}
				<button
					class="generate-btn secondary"
					onclick={() => generateConnections('all')}
				>
					Regenerate All
				</button>
			{/if}
			<button
				class="generate-btn secondary"
				onclick={reheat}
			>
				Re-arrange
			</button>
			{#if terminalOpen && !generating}
				<button class="terminal-toggle" onclick={() => terminalOpen = false}>
					Close Log
				</button>
			{/if}
			<div class="graph-filters">
				<select bind:value={filterThread}>
					<option value="all">All threads</option>
					{#each threads.items as t}
						<option value={t.id}>{t.title}</option>
					{/each}
				</select>
				<select bind:value={filterStatus}>
					<option value="all">All statuses</option>
					<option value="unread">Unread</option>
					<option value="reading">Reading</option>
					<option value="read">Read</option>
				</select>
				<select bind:value={filterConnectionType}>
					<option value="all">All edges</option>
					<option value="citations">Citations only</option>
					<option value="builds-on">Builds on</option>
					<option value="same-method">Same method</option>
					<option value="same-topic">Same topic</option>
					<option value="contradicts">Contradicts</option>
					<option value="complementary">Complementary</option>
				</select>
			</div>
		</div>
	</header>

	<div class="graph-body" class:terminal-visible={terminalOpen}>
		<div class="graph-container" bind:this={containerEl}>
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<canvas
				bind:this={canvasEl}
				onmousemove={handleCanvasMouseMove}
				onmousedown={handleCanvasMouseDown}
				onmouseup={handleCanvasMouseUp}
				onmouseleave={handleCanvasMouseUp}
				onclick={handleCanvasClick}
				onwheel={handleWheel}
			></canvas>

			<!-- Tooltip -->
			{#if tooltipContent}
				<div class="graph-tooltip" style="left: {tooltipContent.x + 12}px; top: {tooltipContent.y - 8}px;">
					{#each tooltipContent.lines as line}
						<div class="tooltip-line">{line}</div>
					{/each}
				</div>
			{/if}

			<!-- Zoom controls -->
			<div class="zoom-controls">
				<button class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
				<button class="zoom-btn" onclick={zoomOut} title="Zoom out">&minus;</button>
				<button class="zoom-btn zoom-reset" onclick={zoomReset} title="Reset view">
					{Math.round(zoom * 100)}%
				</button>
			</div>

			<!-- Legend -->
			{#if legendOpen}
				<div class="graph-legend">
					<div class="legend-header">
						<div class="legend-section-title">Legend</div>
						<button class="legend-close" onclick={() => legendOpen = false}>&times;</button>
					</div>
					<div class="legend-section-title">Threads</div>
					{#each threads.items as t, i}
						<div class="legend-item">
							<span class="legend-dot" style="background: {['#d4a053', '#6abf8a', '#5a9ad4', '#d45a8a', '#9a6abf', '#bf8a6a'][i % 6]}"></span>
							<span class="legend-label">{t.title}</span>
						</div>
					{/each}
					<div class="legend-item">
						<span class="legend-dot" style="background: #6b665c"></span>
						<span class="legend-label">Unthreaded</span>
					</div>

					{#if connections.items.length > 0}
						<div class="legend-divider"></div>
						<div class="legend-section-title">Connections</div>
						{#each Object.entries(connectionStyles) as [type, style]}
							<div class="legend-item">
								<svg class="legend-line" width="20" height="8" viewBox="0 0 20 8">
									<line x1="0" y1="4" x2="20" y2="4"
										stroke={style.color}
										stroke-width="2"
										stroke-dasharray={style.dash.join(',')}
									/>
								</svg>
								<span class="legend-label">{style.label}</span>
							</div>
						{/each}
					{/if}
				</div>
			{:else}
				<button class="legend-toggle" onclick={() => legendOpen = true} title="Show legend">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<rect x="2" y="3" width="5" height="3" rx="0.5" fill="currentColor" opacity="0.6"/>
						<line x1="9" y1="4.5" x2="14" y2="4.5" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
						<rect x="2" y="8" width="5" height="3" rx="0.5" fill="currentColor" opacity="0.4"/>
						<line x1="9" y1="9.5" x2="14" y2="9.5" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
					</svg>
				</button>
			{/if}
		</div>

		<!-- Terminal Panel -->
		{#if terminalOpen}
			<div class="terminal-panel">
				<div class="terminal-header">
					<span class="terminal-title">
						{#if generating}
							<span class="terminal-spinner"></span>
						{/if}
						Connection Log
					</span>
					<button class="terminal-close" onclick={() => { if (!generating) terminalOpen = false; }}>
						&times;
					</button>
				</div>
				<div class="terminal-output" bind:this={terminalEl}>
					{#each terminalLines as line}
						<div class="terminal-line {line.type}">
							{#if line.type === 'status'}
								<span class="line-prefix status-prefix">i</span>
							{:else if line.type === 'tool'}
								<span class="line-prefix tool-prefix">$</span>
							{:else if line.type === 'error'}
								<span class="line-prefix error-prefix">!</span>
							{:else if line.type === 'success'}
								<span class="line-prefix success-prefix">+</span>
							{/if}
							<span class="line-text">{line.text}</span>
						</div>
					{/each}
					{#if generating && terminalLines.length === 0}
						<div class="terminal-line status">
							<span class="line-prefix status-prefix">i</span>
							<span class="line-text">Waiting for Claude...</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Paper Detail Sidebar -->
	{#if selectedPaper}
		<div class="detail-sidebar">
			<div class="detail-header">
				<div class="detail-title-row">
					<h2 class="detail-title">{selectedPaper.title}</h2>
					<button class="detail-close" onclick={() => selectedPaperId = null}>&times;</button>
				</div>
				<p class="detail-authors">{selectedPaper.authors.slice(0, 3).join(', ')}{selectedPaper.authors.length > 3 ? ` +${selectedPaper.authors.length - 3}` : ''}</p>
				<div class="detail-meta">
					<span class="detail-status" class:unread={selectedPaper.readingStatus === 'unread'} class:reading={selectedPaper.readingStatus === 'reading'} class:read={selectedPaper.readingStatus === 'read'}>
						{selectedPaper.readingStatus}
					</span>
					{#if selectedPaper.publishedDate}
						<span class="detail-date">{new Date(selectedPaper.publishedDate).getFullYear()}</span>
					{/if}
				</div>
				<a href="/paper/{selectedPaper.id}" class="detail-open-link">Open paper</a>
			</div>

			{#if connectedPapers.length > 0}
				<div class="detail-connections">
					<div class="detail-section-title">{connectedPapers.length} Connection{connectedPapers.length !== 1 ? 's' : ''}</div>
					{#each connectedPapers as conn}
						<div class="connection-card">
							<div class="connection-type-row">
								<span class="connection-badge" style="background: {conn.color}20; color: {conn.color};">
									{conn.label}
									{#if conn.strength != null}
										<span class="connection-strength">{Math.round(conn.strength * 100)}%</span>
									{/if}
								</span>
								{#if conn.direction === 'to'}
									<span class="connection-dir">&rarr;</span>
								{:else if conn.direction === 'from'}
									<span class="connection-dir">&larr;</span>
								{/if}
							</div>
							<a href="/paper/{conn.paper.id}" class="connection-paper-title" onclick={(e) => { e.preventDefault(); selectedPaperId = conn.paper.id; }}>
								{conn.paper.title}
							</a>
							<p class="connection-paper-authors">{conn.paper.authors.slice(0, 2).join(', ')}{conn.paper.authors.length > 2 ? ' et al.' : ''}</p>
							{#if conn.explanation}
								<p class="connection-explanation">{conn.explanation}</p>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="detail-empty">
					<p>No connections found for this paper.</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.graph-page {
		margin: calc(-1 * var(--sp-8));
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.graph-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: var(--sp-6) var(--sp-8);
		flex-shrink: 0;
	}

	.header-left h1 {
		font-size: 2.2rem;
		font-weight: 300;
		letter-spacing: -0.03em;
		margin-bottom: var(--sp-2);
	}

	.page-subtitle {
		font-size: 0.9rem;
	}

	.graph-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.generate-btn {
		background: var(--bg-raised);
		border: 1px solid var(--border);
		color: var(--text-primary);
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.generate-btn:hover:not(:disabled) {
		border-color: var(--text-secondary);
	}

	.generate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.generate-btn.secondary {
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.terminal-toggle {
		background: none;
		border: 1px solid var(--border);
		color: var(--text-secondary);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.terminal-toggle:hover {
		color: var(--text-primary);
		border-color: var(--text-secondary);
	}

	.graph-filters {
		display: flex;
		gap: var(--sp-3);
	}

	.graph-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.graph-container {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Terminal Panel */
	.terminal-panel {
		width: 380px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		background: #0d0d0f;
		border-left: 1px solid var(--border);
	}

	.terminal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--sp-3) var(--sp-4);
		border-bottom: 1px solid #1a1a1f;
	}

	.terminal-title {
		font-size: 0.8rem;
		font-weight: 500;
		color: #8a8a8e;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.terminal-spinner {
		display: inline-block;
		width: 8px;
		height: 8px;
		border: 1.5px solid #8a8a8e;
		border-top-color: #d4a053;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.terminal-close {
		background: none;
		border: none;
		color: #5a5a5e;
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0 var(--sp-1);
		line-height: 1;
	}

	.terminal-close:hover {
		color: #a0a0a4;
	}

	.terminal-output {
		flex: 1;
		overflow-y: auto;
		padding: var(--sp-3) var(--sp-4);
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.75rem;
		line-height: 1.6;
	}

	.terminal-line {
		display: flex;
		gap: var(--sp-2);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.line-prefix {
		flex-shrink: 0;
		width: 12px;
		text-align: center;
		font-weight: 600;
	}

	.line-text {
		flex: 1;
		min-width: 0;
	}

	.terminal-line.status { color: #5a9ad4; }
	.terminal-line.output { color: #8a8a8e; }
	.terminal-line.tool { color: #d4a053; }
	.terminal-line.error { color: #d45a8a; }
	.terminal-line.success { color: #6abf8a; }

	.status-prefix { color: #5a9ad4; }
	.tool-prefix { color: #d4a053; }
	.error-prefix { color: #d45a8a; }
	.success-prefix { color: #6abf8a; }

	/* Scrollbar for terminal */
	.terminal-output::-webkit-scrollbar {
		width: 4px;
	}

	.terminal-output::-webkit-scrollbar-track {
		background: transparent;
	}

	.terminal-output::-webkit-scrollbar-thumb {
		background: #2a2a2f;
		border-radius: 2px;
	}

	/* Tooltip */
	.graph-tooltip {
		position: fixed;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-2) var(--sp-3);
		pointer-events: none;
		z-index: 100;
		max-width: 360px;
	}

	.tooltip-line {
		font-size: 0.75rem;
		color: var(--text-secondary);
		padding: 2px 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Zoom controls */
	.zoom-controls {
		position: absolute;
		bottom: var(--sp-6);
		right: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.zoom-btn {
		background: transparent;
		border: none;
		color: var(--text-secondary);
		width: 36px;
		height: 32px;
		font-size: 1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.zoom-btn:hover {
		background: var(--border);
		color: var(--text-primary);
	}

	.zoom-reset {
		font-size: 0.65rem;
		border-top: 1px solid var(--border);
	}

	/* Legend */
	.graph-legend {
		position: absolute;
		bottom: var(--sp-6);
		left: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-3) var(--sp-4);
		max-height: 60vh;
		overflow-y: auto;
	}

	.legend-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.legend-close {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 1rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		opacity: 0.6;
	}

	.legend-close:hover {
		opacity: 1;
		color: var(--text-primary);
	}

	.legend-toggle {
		position: absolute;
		bottom: var(--sp-6);
		left: var(--sp-6);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-2);
		cursor: pointer;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.legend-toggle:hover {
		border-color: var(--text-secondary);
		color: var(--text-primary);
	}

	.legend-section-title {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		opacity: 0.7;
	}

	.legend-divider {
		border-top: 1px solid var(--border);
		margin: var(--sp-1) 0;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-line {
		flex-shrink: 0;
	}

	.legend-label {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	/* Detail Sidebar */
	.detail-sidebar {
		position: fixed;
		top: 0;
		right: 0;
		width: 360px;
		height: 100vh;
		background: var(--bg-raised);
		border-left: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		z-index: 200;
		overflow-y: auto;
	}

	.detail-header {
		padding: var(--sp-5) var(--sp-5) var(--sp-4);
		border-bottom: 1px solid var(--border);
	}

	.detail-title-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-3);
	}

	.detail-title {
		font-size: 1.05rem;
		font-weight: 500;
		line-height: 1.35;
		color: var(--text-primary);
		margin: 0;
	}

	.detail-close {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 1.3rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		flex-shrink: 0;
		opacity: 0.6;
	}

	.detail-close:hover {
		opacity: 1;
		color: var(--text-primary);
	}

	.detail-authors {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-top: var(--sp-2);
	}

	.detail-meta {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-top: var(--sp-2);
	}

	.detail-status {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 2px 8px;
		border-radius: 9999px;
		background: var(--border);
		color: var(--text-secondary);
	}

	.detail-status.unread { background: #5a9ad420; color: #5a9ad4; }
	.detail-status.reading { background: #d4a05320; color: #d4a053; }
	.detail-status.read { background: #6abf8a20; color: #6abf8a; }

	.detail-date {
		font-size: 0.8rem;
		color: var(--text-secondary);
		opacity: 0.7;
	}

	.detail-open-link {
		display: inline-block;
		margin-top: var(--sp-3);
		font-size: 0.8rem;
		color: #5a9ad4;
		text-decoration: none;
	}

	.detail-open-link:hover {
		text-decoration: underline;
	}

	.detail-connections {
		padding: var(--sp-4) var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.detail-section-title {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		opacity: 0.7;
	}

	.connection-card {
		padding: var(--sp-3);
		background: var(--bg-base, #1a1a1f);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.connection-type-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-2);
	}

	.connection-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.connection-strength {
		opacity: 0.7;
		font-weight: 400;
	}

	.connection-dir {
		font-size: 0.75rem;
		color: var(--text-secondary);
		opacity: 0.5;
	}

	.connection-paper-title {
		display: block;
		font-size: 0.85rem;
		color: var(--text-primary);
		text-decoration: none;
		line-height: 1.35;
		cursor: pointer;
	}

	.connection-paper-title:hover {
		color: #5a9ad4;
	}

	.connection-paper-authors {
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin-top: 2px;
		opacity: 0.7;
	}

	.connection-explanation {
		font-size: 0.78rem;
		color: var(--text-secondary);
		margin-top: var(--sp-2);
		line-height: 1.45;
	}

	.detail-empty {
		padding: var(--sp-6) var(--sp-5);
		text-align: center;
	}

	.detail-empty p {
		font-size: 0.85rem;
		color: var(--text-secondary);
		opacity: 0.6;
	}

	/* Scrollbar for sidebar */
	.detail-sidebar::-webkit-scrollbar {
		width: 4px;
	}

	.detail-sidebar::-webkit-scrollbar-track {
		background: transparent;
	}

	.detail-sidebar::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 2px;
	}
</style>
