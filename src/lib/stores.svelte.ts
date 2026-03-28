import type { Paper, Thread, Annotation, Note } from './types';

function createStore<T extends { id: string }>(initial: T[], endpoint: string) {
	let items = $state<T[]>(initial);
	let loaded = false;

	async function load() {
		if (loaded) return;
		try {
			const res = await fetch(endpoint);
			if (res.ok) {
				items = await res.json();
			}
		} catch {
			// API not available (e.g. during SSR), keep in-memory state
		}
		loaded = true;
	}

	return {
		get items() { return items; },
		set items(v: T[]) { items = v; },
		load,
		get(id: string) { return items.find(i => i.id === id); },
		async add(item: T) {
			items = [...items, item];
			try {
				await fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(item),
				});
			} catch { /* offline fallback */ }
		},
		async update(id: string, data: Partial<T>) {
			items = items.map(i => i.id === id ? { ...i, ...data } : i);
			try {
				await fetch(endpoint, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, ...data }),
				});
			} catch { /* offline fallback */ }
		},
		async remove(id: string) {
			items = items.filter(i => i.id !== id);
			try {
				await fetch(endpoint, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id }),
				});
			} catch { /* offline fallback */ }
		},
	};
}

export const papers = createStore<Paper>([], '/api/papers');

export const threads = createStore<Thread>([], '/api/threads');

export const annotations = createStore<Annotation>([], '/api/annotations');

export const notes = createStore<Note>([], '/api/notes');

// UI state
export const ui = (() => {
	let commandPaletteOpen = $state(false);
	let addPaperOpen = $state(false);
	let sidebarCollapsed = $state(
		typeof localStorage !== 'undefined'
			? localStorage.getItem('reos:sidebarCollapsed') !== 'false'
			: true
	);
	let mobileSidebarOpen = $state(false);
	let pdfFullscreen = $state(false);
	let activePaperId = $state<string | null>(null);
	let activeThreadId = $state<string | null>(null);
	let openPaperIds = $state<string[]>(
		typeof localStorage !== 'undefined'
			? JSON.parse(localStorage.getItem('reos:openPapers') || '[]')
			: []
	);

	function persistOpenPapers() {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('reos:openPapers', JSON.stringify(openPaperIds));
		}
	}

	return {
		get commandPaletteOpen() { return commandPaletteOpen; },
		set commandPaletteOpen(v) { commandPaletteOpen = v; },
		get addPaperOpen() { return addPaperOpen; },
		set addPaperOpen(v) { addPaperOpen = v; },
		get sidebarCollapsed() { return sidebarCollapsed; },
		set sidebarCollapsed(v) {
			sidebarCollapsed = v;
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('reos:sidebarCollapsed', String(v));
			}
		},
		get mobileSidebarOpen() { return mobileSidebarOpen; },
		set mobileSidebarOpen(v) { mobileSidebarOpen = v; },
		get pdfFullscreen() { return pdfFullscreen; },
		set pdfFullscreen(v) { pdfFullscreen = v; },
		get activePaperId() { return activePaperId; },
		set activePaperId(v) { activePaperId = v; },
		get activeThreadId() { return activeThreadId; },
		set activeThreadId(v) { activeThreadId = v; },
		get openPaperIds() { return openPaperIds; },
		openPaper(id: string) {
			if (!openPaperIds.includes(id)) {
				openPaperIds = [...openPaperIds, id];
				persistOpenPapers();
			}
			activePaperId = id;
		},
		closePaper(id: string): string | null {
			const idx = openPaperIds.indexOf(id);
			if (idx === -1) return null;
			openPaperIds = openPaperIds.filter(p => p !== id);
			persistOpenPapers();
			if (activePaperId === id) {
				// Navigate to adjacent tab or null
				const next = openPaperIds[Math.min(idx, openPaperIds.length - 1)] ?? null;
				activePaperId = next;
				return next;
			}
			return activePaperId;
		},
		closeOtherPapers(id: string) {
			openPaperIds = [id];
			activePaperId = id;
			persistOpenPapers();
		},
		closeAllPapers() {
			openPaperIds = [];
			activePaperId = null;
			persistOpenPapers();
		},
	};
})();
