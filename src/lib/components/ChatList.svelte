<script lang="ts">
	import type { Chat } from '$lib/types';
	import { papers } from '$lib/stores.svelte';
	import { chatLabel, isPlaceholderTitle } from '$lib/chat-display';

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

	/**
	 * Two-tier display: paper title (when available) above the chat's
	 * own label (resolved via `chatLabel`, which falls back to the first
	 * user message preview when the title is still a placeholder).
	 *
	 * For non-paper chats, only the resolved label is shown.
	 */
	function display(chat: Chat): { primary: string; secondary: string | null } {
		const paperTitle = chat.paperId ? papers.get(chat.paperId)?.title ?? null : null;
		const label = chatLabel(chat);

		if (paperTitle) {
			// Don't repeat the paper title as a secondary line if there's
			// genuinely no other info to show.
			const secondary = label === paperTitle || isPlaceholderTitle(label) ? null : label;
			return { primary: paperTitle, secondary };
		}
		return { primary: label, secondary: null };
	}
</script>

<div class="chat-list">
	<div class="chat-list-header">
		<button class="new-chat-btn" onclick={oncreate} title="New chat" aria-label="New chat">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			<span class="new-chat-label">New chat</span>
		</button>
	</div>

	<div class="chat-items">
		{#each chats as chat (chat.id)}
			{@const d = display(chat)}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="chat-item"
				class:active={chat.id === activeChatId}
				class:has-context={d.secondary !== null}
				onclick={() => onselect(chat.id)}
				role="button"
				tabindex="0"
			>
				<div class="text-block">
					<span class="chat-title">{d.primary}</span>
					{#if d.secondary}
						<span class="chat-preview">
							<span class="quote-mark" aria-hidden="true">›</span>
							{d.secondary}
						</span>
					{/if}
				</div>
				<span class="chat-time">{formatTime(chat.updatedAt)}</span>
				<button
					class="delete-btn"
					onclick={(e: MouseEvent) => { e.stopPropagation(); ondelete(chat.id); }}
					title="Delete chat"
					aria-label="Delete chat"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
		{/each}

		{#if chats.length === 0}
			<p class="empty">
				<em>No conversations yet.</em><br />Start one to begin.
			</p>
		{/if}
	</div>
</div>

<style>
	.chat-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-base);
		border-right: 1px solid var(--border-subtle);
	}

	.chat-list-header {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-3) var(--sp-3);
		border-bottom: 1px solid var(--border-subtle);
	}

	.new-chat-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.92rem;
		border: 1px dashed var(--border);
		background: transparent;
		transition: all var(--duration-fast) var(--ease-out);
	}

	.new-chat-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
		border-style: solid;
		background: rgba(212, 160, 83, 0.06);
	}

	.new-chat-btn svg {
		flex-shrink: 0;
	}

	.chat-items {
		flex: 1;
		overflow-y: auto;
		padding: var(--sp-2) var(--sp-2);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.chat-item {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		text-align: left;
		transition: all var(--duration-fast) var(--ease-out);
		cursor: pointer;
		position: relative;
	}

	.chat-item:hover {
		background: var(--bg-raised);
		color: var(--text-primary);
	}

	.chat-item.active {
		background: rgba(212, 160, 83, 0.1);
		color: var(--text-primary);
	}

	.chat-item.active:hover {
		background: rgba(212, 160, 83, 0.14);
	}

	.text-block {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
		padding-top: 2px;
	}

	.chat-title {
		font-family: var(--font-display);
		font-size: 0.95rem;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		font-feature-settings: 'liga' on, 'dlig' on, 'onum' on;
	}

	.chat-item.has-context .chat-title {
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}

	.chat-preview {
		display: flex;
		align-items: baseline;
		gap: 4px;
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.78rem;
		color: var(--text-tertiary);
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-feature-settings: 'liga' on;
	}

	.quote-mark {
		color: var(--accent);
		font-style: normal;
		flex-shrink: 0;
		opacity: 0.7;
	}

	.chat-time {
		flex-shrink: 0;
		font-size: 0.66rem;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		letter-spacing: -0.01em;
		padding-top: 4px;
	}

	.delete-btn {
		flex-shrink: 0;
		display: none;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		margin-top: 1px;
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		transition: all var(--duration-fast);
	}

	.chat-item:hover .delete-btn {
		display: flex;
	}

	.chat-item:hover .chat-time {
		display: none;
	}

	.delete-btn:hover {
		color: var(--status-unread);
		background: var(--bg-overlay);
	}

	.empty {
		text-align: center;
		color: var(--text-tertiary);
		font-family: var(--font-display);
		font-size: 0.88rem;
		line-height: 1.6;
		padding: var(--sp-10) var(--sp-4);
	}

	.empty em {
		color: var(--text-secondary);
		font-style: italic;
	}
</style>
