import type { Handle } from '@sveltejs/kit';
import type { Server as HttpServer } from 'node:http';
import { db } from '$lib/server/db';
import { startLitReviewWatcher } from '$lib/server/lit-review-watcher';
import { attachWsServer } from '$lib/server/ws-server';

/**
 * Server lifecycle hook. Runs once lazily on the first request — SvelteKit
 * does not expose a dedicated "server start" callback, so we gate with a
 * module-level flag. The bootstrap must be cheap because it sits in the
 * request path: it only creates the inbox thread folder if missing and
 * stamps/rebuilds the cache schema version.
 */
let bootstrapped = false;

export const handle: Handle = async ({ event, resolve }) => {
	if (!bootstrapped) {
		bootstrapped = true;
		try {
			db.bootstrapCache();
		} catch (err) {
			console.error('[bootstrap] cache bootstrap failed:', err);
		}
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
	return resolve(event);
};
