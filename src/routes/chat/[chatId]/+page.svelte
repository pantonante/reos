<script lang="ts">
	import { page } from '$app/state';
	import { chats, papers } from '$lib/stores.svelte';
	import type { ChatMessage } from '$lib/types';
	import ChatHeader from '$lib/components/chat/ChatHeader.svelte';
	import MessageStream, { type LiveTool } from '$lib/components/chat/MessageStream.svelte';
	import ChatComposer from '$lib/components/chat/ChatComposer.svelte';
	import EmptyState from '$lib/components/chat/EmptyState.svelte';

	const chatId = $derived(page.params.chatId!);
	const chat = $derived(chats.get(chatId));
	const paper = $derived(chat?.paperId ? papers.get(chat.paperId) ?? null : null);

	let messages = $state<ChatMessage[]>([]);
	let isStreaming = $state(false);
	let streamingText = $state('');
	let liveThinkingBlocks = $state<string[]>([]);
	let liveThinkingCurrent = $state('');
	let liveTools = $state<LiveTool[]>([]);

	// Track which papers have already been attached as PDFs in this page session
	// (resets on reload). Initialized empty; the chat's own paperId is auto-attached
	// on the very first message via the `attachInitialPaper` flag below.
	let attachedPaperIds = $state(new Set<string>());

	let abortController: AbortController | null = null;
	let composer: ReturnType<typeof ChatComposer> | undefined = $state();

	// Reset everything when chatId changes
	$effect(() => {
		const id = chatId;
		messages = [];
		streamingText = '';
		liveThinkingBlocks = [];
		liveThinkingCurrent = '';
		liveTools = [];
		isStreaming = false;
		attachedPaperIds = new Set();
		loadMessages(id);
	});

	$effect(() => {
		// Make sure papers store is loaded so the @mention menu has data.
		papers.load();
	});

	async function loadMessages(id: string) {
		try {
			const res = await fetch(`/api/chats/${id}/messages`);
			if (res.ok) {
				const loaded: ChatMessage[] = await res.json();
				messages = loaded;
				// If history already contains a document block for this chat's paper,
				// mark it as attached so we don't double-attach on the next message.
				const docTitles = new Set<string>();
				for (const m of loaded) {
					for (const p of m.parts ?? []) {
						if (p.type === 'document' && p.title) docTitles.add(p.title);
					}
				}
				if (chat?.paperId && paper && docTitles.has(paper.title)) {
					attachedPaperIds.add(chat.paperId);
				}
			}
		} catch {
			// offline
		}
	}

	async function sendMessage(text: string, mentionedPaperIds: string[]) {
		// Update the chat title from the first user message.
		if (chat && chat.title === 'New chat') {
			const title = text.length > 50 ? text.slice(0, 50) + '...' : text;
			chats.update(chatId, { title, updatedAt: new Date().toISOString() });
		}

		// Decide which paperIds to attach as PDFs in this turn.
		const toAttach: string[] = [];
		// On first turn of a paper-scoped chat, auto-attach the chat's own paper.
		if (chat?.paperId && !attachedPaperIds.has(chat.paperId)) {
			toAttach.push(chat.paperId);
		}
		// Plus any newly @-mentioned papers we haven't attached this session.
		for (const pid of mentionedPaperIds) {
			if (!attachedPaperIds.has(pid) && !toAttach.includes(pid)) {
				toAttach.push(pid);
			}
		}
		for (const pid of toAttach) attachedPaperIds.add(pid);
		attachedPaperIds = new Set(attachedPaperIds); // trigger reactivity

		// Optimistically add the user message
		const userMsg: ChatMessage = {
			id: `m${Date.now()}`,
			chatId,
			role: 'user',
			content: text,
			parts: [{ type: 'text', text }],
			createdAt: new Date().toISOString(),
		};
		messages = [...messages, userMsg];

		// Reset live state
		isStreaming = true;
		streamingText = '';
		liveThinkingBlocks = [];
		liveThinkingCurrent = '';
		liveTools = [];

		abortController = new AbortController();
		try {
			const res = await fetch(`/api/chats/${chatId}/stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: text, paperIds: toAttach }),
				signal: abortController.signal,
			});

			if (!res.ok || !res.body) {
				isStreaming = false;
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					try {
						handleEvent(JSON.parse(line.slice(6)));
					} catch {
						/* skip malformed */
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				streamingText += `\n\n_Error: ${(err as Error).message}_`;
			}
		} finally {
			// Reload from the server to pick up the persisted assistant turns
			// (with full parts: thinking, tool_use, tool_result).
			isStreaming = false;
			abortController = null;
			await loadMessages(chatId);
			streamingText = '';
			liveThinkingBlocks = [];
			liveThinkingCurrent = '';
			liveTools = [];
			// Refresh chat record so the title in the header updates.
			await chats.reload();
		}
	}

	function handleEvent(event: { type: string; [k: string]: unknown }) {
		switch (event.type) {
			case 'text':
				streamingText += event.text as string;
				break;
			case 'thinking_delta':
				liveThinkingCurrent += event.text as string;
				break;
			case 'thinking_done':
				if (liveThinkingCurrent) {
					liveThinkingBlocks = [...liveThinkingBlocks, liveThinkingCurrent];
					liveThinkingCurrent = '';
				}
				break;
			case 'tool_start':
				liveTools = [
					...liveTools,
					{
						id: event.id as string,
						name: event.tool as string,
						input: '',
						isLocal: true,
					},
				];
				break;
			case 'tool_input_delta':
				if (liveTools.length > 0) {
					const last = liveTools[liveTools.length - 1];
					liveTools = [
						...liveTools.slice(0, -1),
						{ ...last, input: last.input + (event.text as string) },
					];
				}
				break;
			case 'tool_stop':
				if (liveTools.length > 0) {
					const last = liveTools[liveTools.length - 1];
					liveTools = [...liveTools.slice(0, -1), { ...last, done: true }];
				}
				break;
			case 'tool_result': {
				const toolUseId = event.toolUseId as string;
				liveTools = liveTools.map((t) =>
					t.id === toolUseId
						? {
								...t,
								result: event.output as string,
								isError: (event.isError as boolean) ?? false,
								done: true,
						  }
						: t
				);
				break;
			}
			case 'done':
				// Stream end — handled in the finally block above.
				break;
			case 'error':
				streamingText += `\n\n_Error: ${event.error}_`;
				break;
		}
	}

	function stopStreaming() {
		abortController?.abort();
	}

	function pickStarter(prompt: string) {
		composer?.injectPrompt(prompt);
	}
</script>

<svelte:head>
	<title>{chat?.title ?? 'Chat'} — Re:OS</title>
</svelte:head>

<div class="chat-page">
	<div class="grain" aria-hidden="true"></div>

	<div class="chat-main">
		<ChatHeader {chat} {paper} />

		<div class="chat-body">
			{#if messages.length === 0 && !isStreaming}
				<EmptyState paperTitle={paper?.title ?? null} onPick={pickStarter} />
			{:else}
				<MessageStream
					{messages}
					{isStreaming}
					{streamingText}
					{liveThinkingBlocks}
					{liveThinkingCurrent}
					{liveTools}
				/>
			{/if}

			<ChatComposer
				bind:this={composer}
				{isStreaming}
				onsend={sendMessage}
				onstop={stopStreaming}
			/>
		</div>
	</div>
</div>

<style>
	.chat-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		position: relative;
		isolation: isolate;
	}

	/* Subtle film grain over the entire chat surface — gives the dark
	   background a paper-like texture without competing with the type. */
	.grain {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		opacity: 0.035;
		mix-blend-mode: screen;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	.chat-main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
		position: relative;
		z-index: 1;
	}

	.chat-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		position: relative;
	}

	/* A wash at the top of the body so the message column fades in cleanly
	   under the header rather than colliding with it. */
	.chat-body::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 32px;
		background: linear-gradient(to bottom, var(--bg-base), transparent);
		pointer-events: none;
		z-index: 2;
	}
</style>
