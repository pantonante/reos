import type { Chat } from './types';

const PLACEHOLDER_TITLE = /^Chat( \d+)?$/;
const PREVIEW_MAX = 50;

/**
 * True when the chat's title is still a placeholder like "Chat" or "Chat 2"
 * — i.e. it hasn't been auto-renamed from the first user message yet.
 */
export function isPlaceholderTitle(title: string): boolean {
	return PLACEHOLDER_TITLE.test(title);
}

/**
 * Truncate a long string to ~50 characters with an ellipsis.
 */
export function truncatePreview(text: string, max: number = PREVIEW_MAX): string {
	const trimmed = text.trim();
	return trimmed.length > max ? trimmed.slice(0, max) + '…' : trimmed;
}

/**
 * Resolve a chat to its display label, falling back to the first user
 * message preview when the title is still a placeholder. Used by chat
 * pickers and lists so old chats (created before auto-rename existed) and
 * unsent chats still show meaningful labels.
 */
export function chatLabel(chat: Chat | undefined): string {
	if (!chat) return 'Chat';
	if (!isPlaceholderTitle(chat.title)) return chat.title;
	if (chat.firstUserMessage) return truncatePreview(chat.firstUserMessage);
	return chat.title;
}
