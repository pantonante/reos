import type { Handle } from '@sveltejs/kit';
import type { Server as HttpServer } from 'node:http';
import { db } from '$lib/server/db';
import { startLitReviewWatcher } from '$lib/server/lit-review-watcher';
import { attachWsServer } from '$lib/server/ws-server';

/**
 * Server lifecycle hook. SvelteKit has no dedicated "server start" callback,
 * so the first request triggers a one-shot bootstrap. When the cache schema
 * is out of date we kick the rebuild off in a deferred task and immediately
 * return a small "rebuilding" splash page — without this, every request
 * (including the very first one) would block for several minutes inside a
 * synchronous better-sqlite3 transaction with no visible feedback.
 */
type BootstrapState = 'pending' | 'rebuilding' | 'done';
let bootstrapState: BootstrapState = 'pending';

function rebuildingResponse(): Response {
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="5">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Re:OS — Rebuilding cache…</title>
<style>
	:root { color-scheme: light dark; }
	html, body { height: 100%; margin: 0; }
	body {
		font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
		background: #0f1115;
		color: #e6e8eb;
		display: grid;
		place-items: center;
		padding: 2rem;
	}
	main {
		max-width: 32rem;
		text-align: center;
	}
	.brand {
		font-size: 0.85rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #9aa3b2;
		margin-bottom: 1.5rem;
	}
	.brand .mark { color: #ff8a5b; }
	h1 {
		font-size: 1.4rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
	}
	p {
		margin: 0.5rem 0;
		color: #b8c0cc;
		line-height: 1.5;
	}
	.spinner {
		width: 28px;
		height: 28px;
		margin: 1.75rem auto 0;
		border: 2px solid rgba(255, 255, 255, 0.12);
		border-top-color: #ff8a5b;
		border-radius: 50%;
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.hint {
		font-size: 0.85rem;
		color: #7d8593;
		margin-top: 1.5rem;
	}
	@media (prefers-color-scheme: light) {
		body { background: #fafafa; color: #1c1f24; }
		.brand { color: #6b7280; }
		p { color: #4b5563; }
		.spinner { border-color: rgba(0, 0, 0, 0.08); border-top-color: #ff8a5b; }
		.hint { color: #6b7280; }
	}
</style>
</head>
<body>
<main>
	<div class="brand"><span class="mark">Re:</span>OS</div>
	<h1>Rebuilding cache…</h1>
	<p>Re-indexing your library from disk after a schema update.</p>
	<p>This usually takes a few minutes. The page will reload automatically when it's ready.</p>
	<div class="spinner" aria-hidden="true"></div>
	<p class="hint">You can leave this tab open — no action needed.</p>
</main>
</body>
</html>`;
	return new Response(html, {
		status: 503,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
			'retry-after': '10',
		},
	});
}

function startAuxServices() {
	try {
		startLitReviewWatcher();
	} catch (err) {
		console.error('[bootstrap] lit-review watcher failed to start:', err);
	}
	try {
		const httpServer = (globalThis as unknown as { __reosHttpServer?: HttpServer }).__reosHttpServer;
		if (httpServer) attachWsServer(httpServer);
	} catch (err) {
		console.error('[bootstrap] ws-server attach failed:', err);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	if (bootstrapState === 'pending') {
		let needsRebuild = false;
		try {
			needsRebuild = db.cacheNeedsRebuild();
		} catch (err) {
			console.error('[bootstrap] cacheNeedsRebuild failed:', err);
		}

		if (needsRebuild) {
			bootstrapState = 'rebuilding';
			// Defer the synchronous rebuild so this request can return the
			// splash page first. While the rebuild runs, the Node event loop
			// is blocked, so any concurrent requests will queue and only be
			// served once it completes — which is fine because they'll then
			// see the up-to-date cache.
			setImmediate(() => {
				try {
					db.bootstrapCache();
				} catch (err) {
					console.error('[bootstrap] cache bootstrap failed:', err);
				} finally {
					bootstrapState = 'done';
					startAuxServices();
				}
			});
			return rebuildingResponse();
		}

		bootstrapState = 'done';
		try {
			db.bootstrapCache();
		} catch (err) {
			console.error('[bootstrap] cache bootstrap failed:', err);
		}
		startAuxServices();
	} else if (bootstrapState === 'rebuilding') {
		return rebuildingResponse();
	}

	return resolve(event);
};
