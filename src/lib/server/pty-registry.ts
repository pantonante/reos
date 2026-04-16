import type { IPty } from 'node-pty';
import { threadWorkspaceDir } from './paths';

const RING_BUFFER_BYTES = 64 * 1024;

type ClientSend = (data: string) => void;

interface PtySession {
	threadId: string;
	terminalId: string;
	pty: IPty;
	clients: Set<ClientSend>;
	buffer: string;
	disposeOnExit: boolean;
	exited: boolean;
}

// Keyed by `${threadId}::${terminalId}` so multiple terminals can share a thread.
const globalForRegistry = globalThis as unknown as { __reosPtyRegistry?: Map<string, PtySession> };
const registry: Map<string, PtySession> =
	globalForRegistry.__reosPtyRegistry ?? (globalForRegistry.__reosPtyRegistry = new Map());

function keyOf(threadId: string, terminalId: string): string {
	return `${threadId}::${terminalId}`;
}

async function loadSpawn(): Promise<typeof import('node-pty').spawn> {
	const mod = await import('node-pty');
	return mod.spawn;
}

function pushBuffer(session: PtySession, chunk: string): void {
	session.buffer += chunk;
	if (session.buffer.length > RING_BUFFER_BYTES) {
		session.buffer = session.buffer.slice(session.buffer.length - RING_BUFFER_BYTES);
	}
}

export async function getOrCreatePty(threadId: string, terminalId: string): Promise<PtySession> {
	const key = keyOf(threadId, terminalId);
	const existing = registry.get(key);
	if (existing && !existing.exited) return existing;

	const spawn = await loadSpawn();
	const cwd = threadWorkspaceDir(threadId);

	const pty = spawn('claude', [], {
		name: 'xterm-256color',
		cwd,
		cols: 100,
		rows: 28,
		env: {
			...process.env,
			TERM: 'xterm-256color',
			FORCE_COLOR: '1',
		} as Record<string, string>,
	});

	const session: PtySession = {
		threadId,
		terminalId,
		pty,
		clients: new Set(),
		buffer: '',
		disposeOnExit: true,
		exited: false,
	};

	pty.onData((data: string) => {
		pushBuffer(session, data);
		for (const send of session.clients) {
			try { send(data); } catch { /* client gone */ }
		}
	});

	pty.onExit(({ exitCode, signal }) => {
		session.exited = true;
		const footer = `\r\n[claude exited with code ${exitCode}${signal ? `, signal ${signal}` : ''}]\r\n`;
		pushBuffer(session, footer);
		for (const send of session.clients) {
			try { send(footer); } catch { /* client gone */ }
		}
		if (session.disposeOnExit) registry.delete(key);
	});

	registry.set(key, session);
	return session;
}

export function hasPty(threadId: string, terminalId: string): boolean {
	return registry.has(keyOf(threadId, terminalId));
}

export function listTerminals(threadId: string): string[] {
	const prefix = `${threadId}::`;
	const ids: string[] = [];
	for (const key of registry.keys()) {
		if (key.startsWith(prefix)) ids.push(key.slice(prefix.length));
	}
	return ids;
}

export function killPty(threadId: string, terminalId: string): void {
	const key = keyOf(threadId, terminalId);
	const session = registry.get(key);
	if (!session) return;
	try { session.pty.kill(); } catch { /* already dead */ }
	registry.delete(key);
}

export function attachClient(session: PtySession, send: ClientSend): () => void {
	session.clients.add(send);
	if (session.buffer) {
		try { send(session.buffer); } catch { /* noop */ }
	}
	return () => session.clients.delete(send);
}

export function writeToPty(threadId: string, terminalId: string, data: string): void {
	const session = registry.get(keyOf(threadId, terminalId));
	if (!session || session.exited) return;
	session.pty.write(data);
}

export function resizePty(threadId: string, terminalId: string, cols: number, rows: number): void {
	const session = registry.get(keyOf(threadId, terminalId));
	if (!session || session.exited) return;
	try { session.pty.resize(cols, rows); } catch { /* ignore */ }
}

export type { PtySession };
