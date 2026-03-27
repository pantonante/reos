export type ReadingStatus = 'unread' | 'reading' | 'read' | 'archived';
export type ThreadStatus = 'active' | 'paused' | 'concluded';
export type AnnotationType = 'highlight' | 'note' | 'question' | 'cross-reference';

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
