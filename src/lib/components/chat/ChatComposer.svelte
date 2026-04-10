<script lang="ts">
	import type { Paper } from '$lib/types';
	import { papers } from '$lib/stores.svelte';
	import PaperMentionMenu from './PaperMentionMenu.svelte';

	let {
		isStreaming = false,
		compact = false,
		onsend,
		onstop,
	}: {
		isStreaming?: boolean;
		compact?: boolean;
		onsend: (text: string, attachedPaperIds: string[]) => void;
		onstop?: () => void;
	} = $props();

	let text = $state('');
	let attached = $state<Paper[]>([]);
	let textarea: HTMLTextAreaElement;
	let menuComponent: ReturnType<typeof PaperMentionMenu> | undefined = $state();

	let mentionOpen = $state(false);
	let mentionQuery = $state('');
	let mentionStart = $state(-1);

	$effect(() => {
		papers.load();
	});

	function autosize() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 240) + 'px';
	}

	function handleInput(e: Event) {
		const t = e.currentTarget as HTMLTextAreaElement;
		text = t.value;
		autosize();

		const cursor = t.selectionStart ?? text.length;
		const before = text.slice(0, cursor);
		const match = before.match(/(?:^|\s)@([\w-]*)$/);
		if (match) {
			mentionStart = cursor - match[1].length - 1;
			mentionQuery = match[1];
			mentionOpen = true;
		} else {
			mentionOpen = false;
			mentionStart = -1;
			mentionQuery = '';
		}
	}

	function pickPaper(p: Paper) {
		if (!attached.find((a) => a.id === p.id)) {
			attached = [...attached, p];
		}
		if (mentionStart >= 0) {
			const before = text.slice(0, mentionStart);
			const after = text.slice(mentionStart + 1 + mentionQuery.length);
			text = before + after;
			textarea.value = text;
			textarea.focus();
			const newCursor = before.length;
			textarea.setSelectionRange(newCursor, newCursor);
		}
		mentionOpen = false;
		mentionStart = -1;
		mentionQuery = '';
	}

	function removeAttached(id: string) {
		attached = attached.filter((p) => p.id !== id);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (mentionOpen && menuComponent) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				menuComponent.moveHighlight(1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				menuComponent.moveHighlight(-1);
				return;
			}
			if (e.key === 'Enter' && !e.shiftKey) {
				if (menuComponent.selectHighlighted()) {
					e.preventDefault();
					return;
				}
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				mentionOpen = false;
				return;
			}
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}

	function submit() {
		const trimmed = text.trim();
		if (!trimmed || isStreaming) return;
		onsend(trimmed, attached.map((p) => p.id));
		text = '';
		attached = [];
		autosize();
	}

	export function injectPrompt(prompt: string) {
		text = prompt;
		setTimeout(() => {
			textarea?.focus();
			autosize();
		}, 0);
	}
</script>

<div class="composer-wrap" class:compact>
	{#if attached.length > 0}
		<div class="chips">
			{#each attached as p (p.id)}
				<span class="chip" title={p.title}>
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
					<span class="chip-text">{p.title}</span>
					<button type="button" class="chip-x" onclick={() => removeAttached(p.id)} aria-label="Remove">
						×
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="desk">
		<div class="textarea-wrap">
			{#if mentionOpen}
				<PaperMentionMenu
					bind:this={menuComponent}
					query={mentionQuery}
					onPick={pickPaper}
					onClose={() => (mentionOpen = false)}
				/>
			{/if}
			<textarea
				bind:this={textarea}
				value={text}
				oninput={handleInput}
				onkeydown={handleKeydown}
				placeholder="Ask, search, or wonder…  type @ for a paper"
				rows="1"
				disabled={isStreaming}
			></textarea>
		</div>

		{#if isStreaming}
			<button type="button" class="action stop" onclick={onstop} title="Stop generating" aria-label="Stop generating">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="6" width="12" height="12" rx="1.5" />
				</svg>
			</button>
		{:else}
			<button type="button" class="action send" onclick={submit} disabled={!text.trim()} title="Send" aria-label="Send message">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M5 12h14" />
					<path d="m13 5 7 7-7 7" />
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	.composer-wrap {
		flex-shrink: 0;
		padding: var(--sp-3) var(--sp-8) var(--sp-4);
		max-width: 720px;
		margin: 0 auto;
		width: 100%;
	}

	.composer-wrap.compact {
		padding: var(--sp-2) var(--sp-3) var(--sp-3);
		max-width: none;
	}

	.composer-wrap.compact textarea {
		font-size: 1rem;
	}

	.composer-wrap.compact .desk {
		padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
		border-radius: 12px;
	}

	.composer-wrap.compact .action {
		width: 34px;
		height: 34px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		margin-bottom: var(--sp-2);
		padding: 0 var(--sp-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		padding: 4px var(--sp-1) 4px var(--sp-2);
		background: rgba(212, 160, 83, 0.08);
		border: 1px solid var(--accent);
		border-radius: 999px;
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-style: italic;
		max-width: 28ch;
	}

	.chip svg {
		color: var(--accent);
		flex-shrink: 0;
	}

	.chip-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip-x {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 15px;
		padding: 0 4px;
		line-height: 1;
		border-radius: 3px;
		font-style: normal;
	}

	.chip-x:hover {
		color: var(--accent);
	}

	/* The "writing desk" — the main composer surface */
	.desk {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: 14px;
		transition:
			border-color var(--duration-normal) var(--ease-out),
			box-shadow var(--duration-normal) var(--ease-out),
			transform var(--duration-normal) var(--ease-out);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.02) inset,
			0 1px 3px rgba(0, 0, 0, 0.4);
	}

	.desk:focus-within {
		border-color: var(--accent);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.04) inset,
			0 0 0 3px rgba(212, 160, 83, 0.18),
			0 8px 32px rgba(0, 0, 0, 0.45);
		transform: translateY(-1px);
	}

	.textarea-wrap {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	textarea {
		width: 100%;
		min-height: 28px;
		max-height: 240px;
		padding: var(--sp-2) 0;
		background: none;
		border: none;
		border-radius: 0;
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: 1.1rem;
		line-height: 1.55;
		resize: none;
		outline: none;
		box-shadow: none;
		font-feature-settings: 'liga' on, 'dlig' on, 'onum' on;
		transition: none;
	}

	/* Override the app-wide :focus styles in app.css that would otherwise
	   paint a 2px amber ring around the textarea inside the desk. */
	textarea:focus {
		border: none;
		box-shadow: none;
		outline: none;
	}

	textarea::placeholder {
		color: var(--text-tertiary);
		font-style: italic;
		font-feature-settings: 'liga' on;
	}

	textarea:disabled {
		opacity: 0.6;
	}

	.action {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: var(--accent);
		color: var(--bg-base);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-out);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.2) inset,
			0 4px 12px rgba(212, 160, 83, 0.3);
	}

	.action.send:hover:not(:disabled) {
		background: var(--accent-hover);
		transform: translateY(-1px) scale(1.04);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.25) inset,
			0 6px 18px rgba(212, 160, 83, 0.4);
	}

	.action:active:not(:disabled) {
		transform: translateY(0) scale(0.98);
	}

	.action:disabled {
		opacity: 0.3;
		cursor: not-allowed;
		box-shadow: none;
	}

	.action.stop {
		background: var(--status-unread);
		box-shadow:
			0 1px 0 0 rgba(255, 255, 255, 0.2) inset,
			0 4px 12px rgba(196, 122, 90, 0.4);
	}

	.action.stop:hover {
		filter: brightness(1.1);
		transform: translateY(-1px);
	}

	/* Pulsing ring on the stop button to draw the eye */
	.action.stop::before {
		content: '';
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		border: 1px solid var(--status-unread);
		opacity: 0;
		animation: pulse-ring 1.6s ease-out infinite;
	}

	.action.stop {
		position: relative;
	}

	@keyframes pulse-ring {
		0% {
			opacity: 0.7;
			transform: scale(0.95);
		}
		100% {
			opacity: 0;
			transform: scale(1.3);
		}
	}

	@media (max-width: 768px) {
		.composer-wrap {
			padding: var(--sp-3) var(--sp-4) var(--sp-4);
		}

		textarea {
			font-size: 1rem;
		}
	}
</style>
