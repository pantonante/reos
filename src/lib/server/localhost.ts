import os from 'os';

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function getLocalIps(): Set<string> {
	const ips = new Set(loopback);
	const interfaces = os.networkInterfaces();
	for (const addrs of Object.values(interfaces)) {
		if (!addrs) continue;
		for (const addr of addrs) {
			ips.add(addr.address);
			if (addr.family === 'IPv4') {
				ips.add(`::ffff:${addr.address}`);
			}
		}
	}
	return ips;
}

const localIps = getLocalIps();

export function isLocalhost(clientIp: string): boolean {
	return localIps.has(clientIp);
}
