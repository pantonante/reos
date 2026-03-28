<script lang="ts">
	let { onsend, disabled = false }: { onsend: (text: string) => void; disabled?: boolean } = $props();
	let text = $state('');
	let textarea: HTMLTextAreaElement;

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}

	function submit() {
		const trimmed = text.trim();
		if (!trimmed || disabled) return;
		onsend(trimmed);
		text = '';
		// Reset height
		if (textarea) textarea.style.height = 'auto';
	}

	function autoResize() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
	}
</script>

<div class="chat-input" class:disabled>
	<textarea
		bind:this={textarea}
		bind:value={text}
		onkeydown={handleKeydown}
		oninput={autoResize}
		placeholder="Ask something…"
		rows="1"
		{disabled}
	></textarea>
	<button class="send-btn" onclick={submit} disabled={disabled || !text.trim()} title="Send">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="22" y1="2" x2="11" y2="13"/>
			<polygon points="22 2 15 22 11 13 2 9 22 2"/>
		</svg>
	</button>
</div>

<style>
	.chat-input {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-2);
		padding: var(--sp-4);
		border-top: 1px solid var(--border);
		background: var(--bg-raised);
	}

	textarea {
		flex: 1;
		resize: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-base);
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: 0.9rem;
		padding: var(--sp-3) var(--sp-4);
		line-height: 1.5;
		outline: none;
		transition: border-color var(--duration-fast);
		max-height: 200px;
	}

	textarea:focus {
		border-color: var(--accent);
	}

	textarea::placeholder {
		color: var(--text-tertiary);
	}

	textarea:disabled {
		opacity: 0.5;
	}

	.send-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-text);
		transition: opacity var(--duration-fast);
	}

	.send-btn:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.send-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.disabled {
		opacity: 0.7;
	}
</style>
