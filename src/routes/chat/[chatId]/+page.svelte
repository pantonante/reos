<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { chats } from '$lib/stores.svelte';
	import type { ChatMessage } from '$lib/types';
	import ChatMessages from '$lib/components/ChatMessages.svelte';
	import ChatInput from '$lib/components/ChatInput.svelte';

	const chatId = $derived(page.params.chatId!);
	const chat = $derived(chats.get(chatId));

	let messages = $state<ChatMessage[]>([]);
	let isStreaming = $state(false);
	let streamingContent = $state('');
	let activeTools = $state<{ tool: string; input: string }[]>([]);

	// Load messages when chatId changes
	$effect(() => {
		const id = chatId;
		messages = [];
		isStreaming = false;
		streamingContent = '';
		loadMessages(id);
	});

	async function loadMessages(id: string) {
		try {
			const res = await fetch(`/api/chats/${id}/messages`);
			if (res.ok) {
				messages = await res.json();
			}
		} catch { /* offline */ }
	}

	async function sendMessage(text: string) {
		// Update chat title from first message
		if (chat && chat.title === 'New chat') {
			const title = text.length > 50 ? text.slice(0, 50) + '...' : text;
			chats.update(chatId, { title, updatedAt: new Date().toISOString() });
		}

		// Optimistically add user message
		const userMsg: ChatMessage = {
			id: `m${Date.now()}`,
			chatId,
			role: 'user',
			content: text,
			createdAt: new Date().toISOString(),
		};
		messages = [...messages, userMsg];
		isStreaming = true;
		streamingContent = '';
		activeTools = [];

		try {
			const res = await fetch(`/api/chats/${chatId}/stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: text }),
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
						const event = JSON.parse(line.slice(6));
						if (event.type === 'text') {
							streamingContent += event.text;
						}
						if (event.type === 'tool_start') {
							activeTools = [...activeTools, { tool: event.tool, input: '' }];
						}
						if (event.type === 'tool_input_delta' && activeTools.length > 0) {
							const last = activeTools[activeTools.length - 1];
							activeTools = [...activeTools.slice(0, -1), { ...last, input: last.input + event.text }];
						}
						if (event.type === 'tool_stop' && activeTools.length > 0) {
							activeTools = activeTools.slice(0, -1);
						}
						if (event.type === 'done') {
							// Use streamed content, or fall back to full result text
							const content = streamingContent || event.fullText || '';
							const assistantMsg: ChatMessage = {
								id: `m${Date.now() + 1}`,
								chatId,
								role: 'assistant',
								content,
								createdAt: new Date().toISOString(),
							};
							messages = [...messages, assistantMsg];
							streamingContent = '';
							isStreaming = false;
						}
						if (event.type === 'error') {
							streamingContent += `\n\nError: ${event.error}`;
							isStreaming = false;
						}
					} catch { /* skip malformed */ }
				}
			}
		} catch (err) {
			isStreaming = false;
			streamingContent = '';
		}
	}
</script>

<svelte:head>
	<title>{chat?.title ?? 'Chat'} — Re:OS</title>
</svelte:head>

<div class="chat-detail">
	<ChatMessages {messages} {isStreaming} {streamingContent} {activeTools} />
	<ChatInput onsend={sendMessage} disabled={isStreaming} />
</div>

<style>
	.chat-detail {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
</style>
