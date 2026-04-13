import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const GS_ARGS_BASE = [
	'-sDEVICE=pdfwrite',
	'-dCompatibilityLevel=1.4',
	'-dPDFSETTINGS=/ebook',
	'-dNOPAUSE',
	'-dQUIET',
	'-dBATCH',
];

export interface EnsureCompressedPdfResult {
	ok: boolean;
	outputPath: string;
	sizeBytes: number | null;
	reused: boolean;
	reason?: string;
}

function compressedSiblingPath(inputPath: string): string {
	const dir = path.dirname(inputPath);
	const ext = path.extname(inputPath);
	const base = path.basename(inputPath, ext || undefined);
	return path.join(dir, `${base}.sm.pdf`);
}

function runGhostscript(inputPath: string, outputPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const args = [...GS_ARGS_BASE, `-sOutputFile=${outputPath}`, inputPath];
		const child = spawn('gs', args, {
			env: { ...process.env },
			stdio: ['ignore', 'ignore', 'pipe'],
		});

		let stderr = '';
		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT') {
				reject(new Error('Ghostscript (gs) is not installed or not on PATH'));
				return;
			}
			reject(err);
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(stderr.trim() || `Ghostscript exited with code ${code}`));
		});
	});
}

export async function ensureCompressedPdf(inputPath: string): Promise<EnsureCompressedPdfResult> {
	const outputPath = compressedSiblingPath(inputPath);

	if (!fs.existsSync(inputPath)) {
		return {
			ok: false,
			outputPath,
			sizeBytes: null,
			reused: false,
			reason: `Input PDF not found at ${inputPath}`,
		};
	}

	const inputStats = fs.statSync(inputPath);
	if (fs.existsSync(outputPath)) {
		const outStats = fs.statSync(outputPath);
		if (outStats.mtimeMs >= inputStats.mtimeMs) {
			return {
				ok: true,
				outputPath,
				sizeBytes: outStats.size,
				reused: true,
			};
		}
	}

	const tempOutput = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
	try {
		await runGhostscript(inputPath, tempOutput);
		if (!fs.existsSync(tempOutput)) {
			return {
				ok: false,
				outputPath,
				sizeBytes: null,
				reused: false,
				reason: 'Ghostscript finished without producing an output file',
			};
		}

		fs.renameSync(tempOutput, outputPath);
		const sizeBytes = fs.statSync(outputPath).size;
		return { ok: true, outputPath, sizeBytes, reused: false };
	} catch (err) {
		try {
			fs.unlinkSync(tempOutput);
		} catch {
			// best-effort cleanup
		}
		return {
			ok: false,
			outputPath,
			sizeBytes: null,
			reused: false,
			reason: (err as Error).message || 'Unknown Ghostscript error',
		};
	}
}
