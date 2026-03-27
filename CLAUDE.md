# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Re:OS is a personal research operating system for collecting, reading, and connecting academic papers. It organizes papers into **threads** (narrative research investigations), not folders. The full spec is in `spec.md`.

## Development Commands

```sh
npm install          # install dependencies
npm run dev          # start dev server (Vite)
npm run build        # production build
npm run check        # type-check (svelte-kit sync + svelte-check)
```

## Architecture

### Stack

- **SvelteKit** (Svelte 5 with runes mode) — frontend framework
- **better-sqlite3** — local SQLite database at `data/reos.db`
- **pdfjs-dist** — PDF rendering in the browser
- **TypeScript** throughout

### Key Directories

- `src/lib/server/db.ts` — Database layer. Single module exporting a `db` object with all CRUD operations. Schema is auto-created on first access (WAL mode, foreign keys on). Array fields (authors, categories, tags, citations) are JSON-serialized in SQLite.
- `src/lib/types.ts` — All shared TypeScript interfaces (Paper, Thread, Annotation, Note, ThreadPaper, ThreadLink).
- `src/lib/stores.svelte.ts` — Svelte 5 reactive stores using `$state`. Generic `createStore` factory that syncs to API endpoints via fetch. Also contains `ui` state (command palette, sidebar, active paper/thread).
- `src/lib/arxiv.ts` — Client-side Arxiv ID extraction and metadata fetching (parses Arxiv API XML).
- `src/lib/components/` — Reusable Svelte components (PdfViewer, AddPaperModal, Sidebar, CommandPalette, PaperCard, etc.).

### Routes

- `/` — Inbox (recently added/unread papers)
- `/library` — Full paper collection
- `/threads` — Thread board (kanban/list by status)
- `/threads/[id]` — Individual thread view
- `/paper/[id]` — Paper detail with PDF viewer
- `/graph` — Citation graph explorer

### API Routes

All under `src/routes/api/`:
- `papers/` — CRUD for papers
- `threads/` — CRUD for threads
- `annotations/` — CRUD for annotations
- `notes/` — CRUD for notes
- `arxiv/` — Proxy for Arxiv API requests
- `pdf-proxy/` — Proxy for serving PDFs

### Data Model

Papers are identified by Arxiv ID. Threads have ordered paper lists with context notes, external links, a synthesis field, and support forking via `parentThreadId`. Annotations are stored in the DB (not on PDFs) and can be scoped to a thread.

### File Storage

PDFs are stored in a mounted Google Drive folder: `/Users/antonap/Library/CloudStorage/GoogleDrive-p.antonante@gmail.com/My Drive/reos`
