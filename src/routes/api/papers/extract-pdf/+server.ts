import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('pdf') as File | null;

	if (!file || file.type !== 'application/pdf') {
		return new Response(JSON.stringify({ error: 'A PDF file is required' }), { status: 400 });
	}

	// Save to temp file
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reos-pdf-'));
	const tmpPath = path.join(tmpDir, 'paper.pdf');
	const buffer = Buffer.from(await file.arrayBuffer());
	fs.writeFileSync(tmpPath, buffer);

	try {
		const metadata = await extractWithClaude(tmpPath);
		return new Response(JSON.stringify(metadata), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err) {
		console.error('[extract-pdf] Extraction failed:', err);
		return new Response(
			JSON.stringify({ error: 'Failed to extract metadata from PDF' }),
			{ status: 500 }
		);
	} finally {
		// Cleanup temp files
		try {
			fs.unlinkSync(tmpPath);
			fs.rmdirSync(tmpDir);
		} catch { /* ignore cleanup errors */ }
	}
};

function extractWithClaude(pdfPath: string): Promise<{
	title: string;
	authors: string[];
	year: string;
	abstract: string;
}> {
	return new Promise((resolve, reject) => {
		const prompt = `Read the PDF at "${pdfPath}" and extract the following metadata. Return ONLY a valid JSON object with these fields, no other text:
{
  "title": "the paper title",
  "authors": ["author1", "author2"],
  "year": "publication year as string",
  "abstract": "the paper abstract"
}

If you cannot find a field, use an empty string for strings or empty array for authors. Do not include any markdown formatting or code blocks, just raw JSON.`;

		const child = spawn('claude', ['-p', '--allowedTools', 'Read', '--output-format', 'text'], {
			env: { ...process.env },
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});

		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`Claude exited with code ${code}: ${stderr}`));
				return;
			}

			try {
				// Try to extract JSON from the response
				const jsonMatch = stdout.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					reject(new Error('No JSON found in Claude response'));
					return;
				}
				const parsed = JSON.parse(jsonMatch[0]);
				resolve({
					title: parsed.title || '',
					authors: Array.isArray(parsed.authors) ? parsed.authors : [],
					year: parsed.year || '',
					abstract: parsed.abstract || '',
				});
			} catch (e) {
				reject(new Error(`Failed to parse Claude response: ${stdout}`));
			}
		});

		child.on('error', reject);

		child.stdin.write(prompt);
		child.stdin.end();
	});
}
