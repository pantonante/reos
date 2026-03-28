<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { chats } from '$lib/stores.svelte';
	import ChatList from '$lib/components/ChatList.svelte';

	let { children } = $props();

	const activeChatId = $derived(
		page.url.pathname.startsWith('/chat/')
			? page.url.pathname.split('/')[2] || null
			: null
	);

	const sortedChats = $derived(
		[...chats.items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
	);

	async function createChat() {
		const now = new Date().toISOString();
		const chat = {
			id: `c${Date.now()}`,
			title: 'New chat',
			claudeSessionId: null,
			paperId: null,
			createdAt: now,
			updatedAt: now,
		};
		await chats.add(chat);
		goto(`/chat/${chat.id}`);
	}

	function selectChat(id: string) {
		goto(`/chat/${id}`);
	}

	async function deleteChat(id: string) {
		await chats.remove(id);
		if (activeChatId === id) {
			goto('/chat');
		}
	}
</script>

<div class="chat-layout">
	<aside class="chat-sidebar">
		<ChatList
			chats={sortedChats}
			{activeChatId}
			oncreate={createChat}
			onselect={selectChat}
			ondelete={deleteChat}
		/>
	</aside>
	<div class="chat-main">
		{@render children()}
	</div>
</div>

<style>
	.chat-layout {
		display: grid;
		grid-template-columns: 280px 1fr;
		height: 100%;
	}

	.chat-sidebar {
		overflow: hidden;
		min-width: 0;
	}

	.chat-main {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-height: 0;
	}

	@media (max-width: 768px) {
		.chat-layout {
			grid-template-columns: 1fr;
		}

		.chat-sidebar {
			display: none;
		}
	}
</style>
