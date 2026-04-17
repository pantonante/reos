import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// node-pty ships a `spawn-helper` binary per-platform. npm's tar extraction
// occasionally drops the executable bit on the helper, causing every PTY
// spawn to fail with "posix_spawnp failed." This script makes the helper
// executable again after install.

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

function ensureHelperExecutable() {
	let pkgRoot;
	try {
		pkgRoot = path.dirname(require.resolve('node-pty/package.json'));
	} catch {
		return; // node-pty not installed; skip.
	}
	const prebuilds = path.join(pkgRoot, 'prebuilds');
	if (!fs.existsSync(prebuilds)) return;
	for (const arch of fs.readdirSync(prebuilds)) {
		const helper = path.join(prebuilds, arch, 'spawn-helper');
		if (!fs.existsSync(helper)) continue;
		try {
			fs.chmodSync(helper, 0o755);
		} catch (err) {
			console.warn(`[ensure-node-pty] could not chmod ${helper}:`, err);
		}
	}
}

ensureHelperExecutable();
void projectRoot;
