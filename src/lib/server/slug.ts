const MAX_SLUG_LEN = 60;

export function slugify(title: string): string {
	const base = title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SLUG_LEN)
		.replace(/-+$/g, '');
	return base || 'thread';
}

export function dedupeSlug(candidate: string, existing: ReadonlySet<string>): string {
	if (!existing.has(candidate)) return candidate;
	let i = 2;
	while (existing.has(`${candidate}-${i}`)) i++;
	return `${candidate}-${i}`;
}

export function slugifyUnique(title: string, existing: ReadonlySet<string>): string {
	return dedupeSlug(slugify(title), existing);
}
