import fs from 'fs';
import path from 'path';
import {
	threadWorkspaceDir,
	threadOutputsDir,
	threadClaudeSettingsPath,
} from './paths';

const DEFAULT_SETTINGS = {
	permissions: {
		allow: [
			'WebSearch',
			'WebFetch(*)',
			'Read(./**)',
			'Write(./outputs/**)',
			'Bash(mkdir:./outputs/**)',
		],
	},
};

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

/**
 * Idempotently prepare a thread's Claude Code workspace. Every thread gets
 * `workspace/`, `workspace/outputs/`, and a `.claude/settings.json` permissive
 * enough that terminal sessions don't stall on approval prompts.
 *
 * The `literature-review` skill is installed at the user level via
 * `npm run install-skill` (see scripts/install-skill.mjs), so it's available
 * in every workspace without per-thread duplication.
 */
export function ensureWorkspace(slug: string): void {
	const workspace = threadWorkspaceDir(slug);
	const outputs = threadOutputsDir(slug);
	ensureDir(workspace);
	ensureDir(outputs);

	const settingsPath = threadClaudeSettingsPath(slug);
	if (!fs.existsSync(settingsPath)) {
		ensureDir(path.dirname(settingsPath));
		fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2) + '\n', 'utf8');
	}
}
