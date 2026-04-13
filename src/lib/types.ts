export type ReadingStatus = 'unread' | 'reading' | 'read' | 'archived';
export type ThreadStatus = 'active' | 'paused' | 'concluded';
export type AnnotationType = 'highlight' | 'note' | 'question' | 'cross-reference';
export type ConnectionType = 'builds-on' | 'same-method' | 'same-topic' | 'contradicts' | 'complementary';

export interface Paper {
	id: string;
	arxivId: string;
	title: string;
	authors: string[];
	abstract: string;
	publishedDate: string;
	categories: string[];
	tags: string[];
	readingStatus: ReadingStatus;
	rating: number | null;
	pdfPath: string;
	arxivUrl: string;
	addedAt: string;
	citations: string[]; // arxiv IDs of papers this one cites (that are in our library)
	links: string[]; // external URLs associated with this paper
	summary: string | null; // AI-generated paper review (markdown)
	summaryDate: string | null; // ISO date when summary was generated
}

export interface ThreadPaper {
	paperId: string;
	contextNote: string;
	order: number;
}

export interface ThreadLink {
	id: string;
	label: string;
	url: string;
}

export interface Thread {
	id: string;
	title: string;
	question: string;
	status: ThreadStatus;
	papers: ThreadPaper[];
	synthesis: string;
	parentThreadId: string | null;
	tags: string[];
	links: ThreadLink[];
	createdAt: string;
	updatedAt: string;
}

export interface Annotation {
	id: string;
	paperId: string;
	threadId: string | null;
	type: AnnotationType;
	content: string;
	selectedText: string;
	page: number;
	color: string;
	createdAt: string;
	linkedPaperId?: string; // for cross-references
}

export interface Note {
	id: string;
	paperId: string;
	content: string;
	createdAt: string;
}

export interface MatrixAttribute {
	id: string;
	name: string;
	threadId: string;
}

/**
 * A persisted assistant or user message. `content` is the plain-text view
 * (used for legacy callers and for cheap rendering of past messages).
 * `parts`, when present, is the JSON-serialized array of Anthropic content
 * blocks (text, thinking, tool_use, tool_result, document) for the turn —
 * this is what lets the chat UI re-render past assistant turns with their
 * reasoning + tool activity instead of just the final text.
 */
export interface ChatMessage {
	id: string;
	chatId: string;
	role: 'user' | 'assistant';
	content: string;
	parts?: ChatMessagePart[] | null;
	createdAt: string;
}

/**
 * One block in a persisted chat message. Mirrors the Anthropic content block
 * shape loosely — we keep the structural fields the UI needs and ignore the
 * rest. Stored as JSON in the `parts` column.
 */
export type ChatMessagePart =
	| { type: 'text'; text: string }
	| { type: 'thinking'; thinking: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	| {
			type: 'tool_result';
			tool_use_id: string;
			content: string;
			is_error?: boolean;
	  }
	| {
			type: 'document';
			source: { type: 'base64'; media_type: string; data: string };
			title?: string;
	  };

export interface Chat {
	id: string;
	title: string;
	claudeSessionId: string | null;
	chatEngine: 'sdk' | 'cli';
	paperId: string | null;
	createdAt: string;
	updatedAt: string;
	/**
	 * First user message in the conversation, if any. Computed at read time
	 * by `db.getAllChats()` via a correlated subquery — not a stored column.
	 * Used as a display fallback when `title` is still a placeholder like
	 * `"Chat"` or `"Chat 2"` (i.e. for chats created before auto-rename
	 * existed, or for chats without any messages yet).
	 */
	firstUserMessage?: string | null;
}

export interface PaperConnection {
	id: string;
	fromPaperId: string;
	toPaperId: string;
	connectionType: ConnectionType;
	strength: number;
	explanation: string;
	generatedAt: string;
}
