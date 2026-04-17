import type { RequestHandler } from './$types';
import { threadEvents, type ThreadEvent } from '$lib/server/thread-events';

export const GET: RequestHandler = async ({ params }) => {
	const threadId = params.id;
	const encoder = new TextEncoder();

	let sendRef: ((ev: ThreadEvent) => void) | null = null;
	let keepalive: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const send = (ev: ThreadEvent) => {
				if ('threadId' in ev && ev.threadId !== threadId) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
				} catch { /* client closed; cancel will clean up */ }
			};
			controller.enqueue(encoder.encode(`: connected ${threadId}\n\n`));
			threadEvents.on('event', send);
			sendRef = send;

			keepalive = setInterval(() => {
				try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { /* closed */ }
			}, 25_000);
		},
		cancel() {
			if (keepalive) clearInterval(keepalive);
			if (sendRef) threadEvents.off('event', sendRef);
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
		},
	});
};
