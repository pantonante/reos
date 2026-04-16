import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { attachClient, getOrCreatePty, resizePty, writeToPty } from './pty-registry';

const globalForWs = globalThis as unknown as { __reosWsAttached?: boolean };

let wss: WebSocketServer | null = null;

// /ws/terminal/<threadId>/<terminalId>
const TERMINAL_ROUTE = /^\/ws\/terminal\/([^/?]+)\/([^/?]+)/;

/**
 * Attach the WebSocket upgrade handler to an HTTP server exactly once. Used
 * by the Vite plugin in dev and by the custom server entry in prod. The
 * registry is keyed by (threadId, terminalId) so a thread can host multiple
 * concurrent terminals and each browser tab attaches to a specific one.
 */
export function attachWsServer(httpServer: HttpServer): void {
	if (globalForWs.__reosWsAttached) return;
	globalForWs.__reosWsAttached = true;

	wss = new WebSocketServer({ noServer: true });

	httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
		const url = req.url ?? '';
		const match = url.match(TERMINAL_ROUTE);
		if (!match) return; // leave for other upgrade handlers (HMR etc.)
		const threadId = decodeURIComponent(match[1]);
		const terminalId = decodeURIComponent(match[2]);
		wss!.handleUpgrade(req, socket, head, (ws) => {
			handleConnection(ws, threadId, terminalId).catch((err) => {
				console.error('[ws-server] handleConnection failed:', err);
				try { ws.close(1011, 'server error'); } catch { /* noop */ }
			});
		});
	});

	console.log('[ws-server] attached at /ws/terminal/:threadId/:terminalId');
}

async function handleConnection(ws: WebSocket, threadId: string, terminalId: string): Promise<void> {
	let session;
	try {
		session = await getOrCreatePty(threadId, terminalId);
	} catch (err) {
		ws.send(`\r\n[failed to start claude: ${(err as Error).message}]\r\n`);
		ws.close();
		return;
	}

	const detach = attachClient(session, (data) => {
		if (ws.readyState === ws.OPEN) ws.send(data);
	});

	ws.on('message', (raw) => {
		const msg = raw.toString();
		if (msg.startsWith('{')) {
			try {
				const parsed = JSON.parse(msg);
				if (parsed.type === 'resize' && typeof parsed.cols === 'number' && typeof parsed.rows === 'number') {
					resizePty(threadId, terminalId, parsed.cols, parsed.rows);
					return;
				}
				if (parsed.type === 'input' && typeof parsed.data === 'string') {
					writeToPty(threadId, terminalId, parsed.data);
					return;
				}
			} catch {
				// Fall through: treat as raw input.
			}
		}
		writeToPty(threadId, terminalId, msg);
	});

	ws.on('close', () => {
		detach();
	});
}
