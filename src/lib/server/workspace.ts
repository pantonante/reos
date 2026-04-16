import fs from 'fs';
import path from 'path';
import {
	threadWorkspaceDir,
	threadOutputsDir,
	threadSkillsDir,
	threadClaudeSettingsPath,
} from './paths';
// Vite `?raw` import — the skill text is bundled into the server build so we
// don't depend on the source tree at runtime.
import literatureReviewSkill from './skills/literature-review.md?raw';

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
 * enough that terminal sessions don't stall on approval prompts. For
 * literature-review threads we additionally drop the bundled skill into
 * `.claude/skills/` so `/literature-review` is available.
 */
export function ensureWorkspace(slug: string, opts: { installLitReviewSkill?: boolean } = {}): void {
	const workspace = threadWorkspaceDir(slug);
	const outputs = threadOutputsDir(slug);
	ensureDir(workspace);
	ensureDir(outputs);

	const settingsPath = threadClaudeSettingsPath(slug);
	if (!fs.existsSync(settingsPath)) {
		ensureDir(path.dirname(settingsPath));
		fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2) + '\n', 'utf8');
	}

	if (opts.installLitReviewSkill) {
		const skillsDir = threadSkillsDir(slug);
		ensureDir(skillsDir);
		const skillPath = path.join(skillsDir, 'literature-review.md');
		if (!fs.existsSync(skillPath)) {
			fs.writeFileSync(skillPath, literatureReviewSkill, 'utf8');
		}
	}
}
