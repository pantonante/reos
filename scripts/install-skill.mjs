#!/usr/bin/env node
// Install (or update) the Re:OS literature-review skill at the user level so
// `/reos-literature-review` is available in any Claude Code workspace.
//
// Source:  src/lib/server/skills/reos-literature-review.md
// Target:  ~/.claude/skills/reos-literature-review/SKILL.md
//
// Claude Code discovers user-level skills under `~/.claude/skills/<name>/SKILL.md`
// (a directory per skill, not a flat `.md` file). Re-run to update.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SKILL_NAME = 'reos-literature-review';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(REPO_ROOT, 'src/lib/server/skills', `${SKILL_NAME}.md`);
const TARGET_DIR = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME);
const TARGET = path.join(TARGET_DIR, 'SKILL.md');

function main() {
	if (!fs.existsSync(SOURCE)) {
		console.error(`[install-skill] source not found: ${SOURCE}`);
		process.exit(1);
	}

	const source = fs.readFileSync(SOURCE, 'utf8');
	const existed = fs.existsSync(TARGET);
	const prior = existed ? fs.readFileSync(TARGET, 'utf8') : null;

	fs.mkdirSync(TARGET_DIR, { recursive: true });
	fs.writeFileSync(TARGET, source, 'utf8');

	if (!existed) {
		console.log(`[install-skill] installed ${SKILL_NAME} → ${TARGET}`);
	} else if (prior !== source) {
		console.log(`[install-skill] updated ${SKILL_NAME} → ${TARGET}`);
	} else {
		console.log(`[install-skill] ${SKILL_NAME} already up to date (${TARGET})`);
	}
}

main();
