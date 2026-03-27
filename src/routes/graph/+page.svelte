<script lang="ts">
	import { papers, threads } from '$lib/stores.svelte';
	import { onMount } from 'svelte';

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);
	let hoveredNode = $state<string | null>(null);
	let filterThread = $state('all');
	let filterStatus = $state('all');

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
		const result: { from: string; to: string }[] = [];
		for (const node of nodes) {
			for (const citedId of node.citations) {
				if (nodeIds.has(citedId)) {
					result.push({ from: node.id, to: citedId });
				}
			}
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
		const damping = 0.85;
		const repulsion = 3000;
		const springLen = 160;
		const springK = 0.015;
		const centerPull = 0.002;

		if (!canvasEl) return;
		const cx = canvasEl.width / 2;
		const cy = canvasEl.height / 2;

		for (const p of positions) {
			// Pull toward center
			p.vx += (cx - p.x) * centerPull;
			p.vy += (cy - p.y) * centerPull;

			// Repulsion from all other nodes
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

		// Spring forces for edges
		for (const edge of edges) {
			const a = positions.find(p => p.id === edge.from);
			const b = positions.find(p => p.id === edge.to);
			if (!a || !b) continue;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const dist = Math.sqrt(dx * dx + dy * dy) || 1;
			const force = (dist - springLen) * springK;
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			a.vx += fx;
			a.vy += fy;
			b.vx -= fx;
			b.vy -= fy;
		}

		for (const p of positions) {
			p.vx *= damping;
			p.vy *= damping;
			p.x += p.vx;
			p.y += p.vy;
		}
	}

	function draw() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

		// Edges
		ctx.lineWidth = 1;
		for (const edge of edges) {
			const a = positions.find(p => p.id === edge.from);
			const b = positions.find(p => p.id === edge.to);
			if (!a || !b) continue;

			ctx.strokeStyle = hoveredNode === edge.from || hoveredNode === edge.to
				? '#d4a05380'
				: '#2f2f36';
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();

			// Arrow
			const angle = Math.atan2(b.y - a.y, b.x - a.x);
			const arrowLen = 8;
			const mx = b.x - Math.cos(angle) * 14;
			const my = b.y - Math.sin(angle) * 14;
			ctx.beginPath();
			ctx.moveTo(mx, my);
			ctx.lineTo(mx - arrowLen * Math.cos(angle - 0.4), my - arrowLen * Math.sin(angle - 0.4));
			ctx.moveTo(mx, my);
			ctx.lineTo(mx - arrowLen * Math.cos(angle + 0.4), my - arrowLen * Math.sin(angle + 0.4));
			ctx.stroke();
		}

		// Nodes
		for (const pos of positions) {
			const paper = papers.get(pos.id);
			if (!paper) continue;

			const color = getThreadColor(pos.id);
			const isHovered = hoveredNode === pos.id;
			const radius = isHovered ? 10 : 7;

			// Glow
			if (isHovered) {
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
				ctx.fillStyle = color + '20';
				ctx.fill();
			}

			// Node
			ctx.beginPath();
			ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();

			// Label
			ctx.font = isHovered ? '500 13px "DM Sans"' : '12px "DM Sans"';
			ctx.fillStyle = isHovered ? '#e8e4dc' : '#a09a8e';
			ctx.textAlign = 'center';
			const label = paper.title.length > 30 ? paper.title.slice(0, 28) + '…' : paper.title;
			ctx.fillText(label, pos.x, pos.y + radius + 16);
		}
	}

	function handleCanvasMouseMove(e: MouseEvent) {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		hoveredNode = null;
		for (const pos of positions) {
			const dx = mx - pos.x;
			const dy = my - pos.y;
			if (dx * dx + dy * dy < 225) {
				hoveredNode = pos.id;
				break;
			}
		}
		canvasEl.style.cursor = hoveredNode ? 'pointer' : 'default';
	}

	function handleCanvasClick() {
		if (hoveredNode) {
			window.location.href = `/paper/${hoveredNode}`;
		}
	}

	let animFrame: number;

	onMount(() => {
		if (!canvasEl || !containerEl) return;

		const resize = () => {
			if (!canvasEl || !containerEl) return;
			canvasEl.width = containerEl.clientWidth;
			canvasEl.height = containerEl.clientHeight;
		};

		resize();
		initPositions(canvasEl.width, canvasEl.height);

		let iter = 0;
		function loop() {
			if (iter < 200) simulate();
			draw();
			iter++;
			animFrame = requestAnimationFrame(loop);
		}
		loop();

		window.addEventListener('resize', resize);
		return () => {
			cancelAnimationFrame(animFrame);
			window.removeEventListener('resize', resize);
		};
	});

	// Re-init on filter change
	$effect(() => {
		nodes; // dependency
		if (canvasEl) {
			initPositions(canvasEl.width, canvasEl.height);
		}
	});
</script>

<div class="graph-page">
	<header class="graph-header">
		<div class="header-left">
			<h1>Graph</h1>
			<p class="page-subtitle text-secondary">{nodes.length} papers · {edges.length} citations</p>
		</div>
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
		</div>
	</header>

	<div class="graph-container" bind:this={containerEl}>
		<canvas
			bind:this={canvasEl}
			onmousemove={handleCanvasMouseMove}
			onclick={handleCanvasClick}
		></canvas>

		<!-- Legend -->
		<div class="graph-legend">
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
		</div>
	</div>
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

	.graph-filters {
		display: flex;
		gap: var(--sp-3);
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

	.legend-label {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
</style>
