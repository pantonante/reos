<script lang="ts">
	import type { Chat } from '$lib/types';

	let {
		chats,
		activeChatId = null,
		oncreate,
		onselect,
		ondelete,
	}: {
		chats: Chat[];
		activeChatId?: string | null;
		oncreate: () => void;
		onselect: (id: string) => void;
		ondelete: (id: string) => void;
	} = $props();

	function formatTime(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		if (diff < 86400000) {
			return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		}
		if (diff < 604800000) {
			return d.toLocaleDateString([], { weekday: 'short' });
		}
		return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
	}
</script>

<div class="chat-list">
	<div class="chat-list-header">
		<h2>Chats</h2>
		<button class="new-chat-btn" onclick={oncreate} title="New chat">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
		</button>
	</div>

	<div class="chat-items">
		{#each chats as chat (chat.id)}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="chat-item"
				class:active={chat.id === activeChatId}
				onclick={() => onselect(chat.id)}
				role="button"
				tabindex="0"
			>
				<span class="chat-title">{chat.title}</span>
				<span class="chat-time">{formatTime(chat.updatedAt)}</span>
				<button
					class="delete-btn"
					onclick={(e: MouseEvent) => { e.stopPropagation(); ondelete(chat.id); }}
					title="Delete chat"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
		{/each}

		{#if chats.length === 0}
			<p class="empty">No chats yet</p>
		{/if}
	</div>
</div>

<style>
	.chat-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-raised);
		border-right: 1px solid var(--border);
	}

	.chat-list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-4) var(--sp-4) var(--sp-3);
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.new-chat-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		transition: all var(--duration-fast);
	}

	.new-chat-btn:hover {
		background: var(--bg-hover);
		color: var(--accent);
	}

	.chat-items {
		flex: 1;
		overflow-y: auto;
		padding: 0 var(--sp-2);
	}

	.chat-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-3) var(--sp-3);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-family: var(--font-body);
		text-align: left;
		transition: all var(--duration-fast);
		cursor: pointer;
		position: relative;
	}

	.chat-item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.chat-item.active {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.chat-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chat-time {
		flex-shrink: 0;
		font-size: 0.7rem;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
	}

	.delete-btn {
		flex-shrink: 0;
		display: none;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		transition: all var(--duration-fast);
	}

	.chat-item:hover .delete-btn {
		display: flex;
	}

	.delete-btn:hover {
		color: var(--status-unread);
		background: var(--bg-surface);
	}

	.empty {
		text-align: center;
		color: var(--text-tertiary);
		font-size: 0.85rem;
		padding: var(--sp-8) var(--sp-4);
	}
</style>
