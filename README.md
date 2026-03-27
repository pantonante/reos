# Re:OS

A local-first research OS that organizes papers into **threads** — narrative investigations — not folders. Add papers by Arxiv URL, read and annotate PDFs in-app, and trace how ideas connect across your reading.

## Features

- **Threads** — Group papers into research investigations with context notes, synthesis, and links. Kanban board with drag-and-drop. Fork threads to explore tangents.
- **PDF Reader** — Built-in viewer with highlights, notes, questions, and cross-references, scoped per thread.
- **AI Paper Summaries** — Get structured, critical summaries of any paper using Claude Code's built-in `/paper-reviewer` skill.
- **Citation Graph** — Interactive visualization of how papers cite each other, filterable by thread or status.
- **Arxiv Integration** — Paste an Arxiv URL or ID. Metadata and PDF are fetched automatically.
- **Command Palette** — `Cmd+K` to navigate anywhere.

Everything runs locally. No accounts, no cloud sync, no external services.

## Requirements

- [Node.js](https://nodejs.org/) >= 18
- [Claude Code](https://claude.ai/code) — required for AI-powered paper summaries (`/paper-reviewer`)

## Getting Started

```sh
git clone https://github.com/antonap/reos.git
cd reos
npm install
npm run dev
```

Open `http://localhost:5173`. The SQLite database is created automatically on first run.

### AI Paper Summaries

With [Claude Code](https://claude.ai/code) installed, open a terminal in the project directory and run:

```sh
claude
```

Then use the `/paper-reviewer <path-to-pdf>` slash command to get a structured summary of any paper. It adapts to the paper type (survey, model/system, or theoretical) and produces a practical, builder-oriented analysis.

### PDF Storage

PDFs are stored locally on disk. Configure the storage path in `src/lib/server/db.ts`.

## Stack

- **SvelteKit** (Svelte 5, runes mode)
- **better-sqlite3** — local SQLite, zero config
- **pdfjs-dist** — client-side PDF rendering
- **TypeScript** throughout

## License

MIT
