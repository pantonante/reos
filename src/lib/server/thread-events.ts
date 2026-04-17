import { EventEmitter } from 'node:events';

export type ThreadEvent =
	| { type: 'thread:updated'; threadId: string }
	| { type: 'thread:papers-changed'; threadId: string }
	| { type: 'lit-review:ingest-started'; threadId: string }
	| { type: 'synthesis:references-updated'; threadId: string; refCount: number };

class ThreadEventBus extends EventEmitter {
	constructor() {
		super();
		// We expect several per-thread SSE subscribers at once — disable the
		// 10-listener warning so opening multiple tabs doesn't log spam.
		this.setMaxListeners(0);
	}
	emitEvent(ev: ThreadEvent): void {
		this.emit('event', ev);
	}
}

const globalForBus = globalThis as unknown as { __reosThreadBus?: ThreadEventBus };
export const threadEvents: ThreadEventBus = globalForBus.__reosThreadBus ??
	(globalForBus.__reosThreadBus = new ThreadEventBus());
