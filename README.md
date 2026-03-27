# Re:OS

A personal research operating system for collecting, reading, and connecting academic papers. Re:OS organizes papers into **threads** — narrative research investigations — instead of static folders, helping you trace how ideas connect across your reading.

## Features

- **Inbox** — See unread and in-progress papers at a glance
- **Library** — Browse your full collection with search, filtering by status/category, and card or table views
- **Threads** — Group papers into research investigations with context notes, synthesis, and external links. Kanban board with drag-and-drop status management (active / paused / concluded). Threads can fork from other threads
- **PDF Reader** — In-app PDF viewer with annotations (highlights, notes, questions, cross-references) that can be scoped to a specific thread
- **Citation Graph** — Interactive canvas-based visualization of citation relationships between papers, filterable by thread or reading status
- **Command Palette** — Quick navigation with `Cmd+K`
- **Arxiv Integration** — Add papers by pasting an Arxiv URL or ID; metadata is fetched automatically

## Stack

- **SvelteKit** (Svelte 5, runes mode)
- **better-sqlite3** — local SQLite database (zero config, auto-created on first run)
- **pdfjs-dist** — client-side PDF rendering
- **TypeScript** throughout

No external services required. Everything runs locally.

## Getting Started

```sh
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. The SQLite database is created automatically at `data/reos.db` on first access.

### PDF Storage

PDFs are stored locally on disk. Configure the storage path in `src/lib/server/db.ts` to point to a directory on your machine (the default uses a Google Drive mount).

### Production Build

```sh
npm run build
npm run preview
```

## Project Structure

```
src/
  lib/
    server/db.ts          # Database layer (SQLite, auto-creates schema)
    types.ts               # Shared TypeScript interfaces
    stores.svelte.ts       # Svelte 5 reactive stores
    arxiv.ts               # Arxiv ID extraction & metadata fetching
    components/            # Reusable components (PdfViewer, Sidebar, CommandPalette, etc.)
  routes/
    +page.svelte           # Inbox
    library/               # Paper collection
    threads/               # Thread board & individual thread views
    paper/[id]/            # Paper detail with PDF viewer
    graph/                 # Citation graph explorer
    api/                   # REST API (papers, threads, annotations, notes, arxiv proxy, pdf proxy)
data/
  reos.db                  # SQLite database (auto-created)
```

## License

MIT
