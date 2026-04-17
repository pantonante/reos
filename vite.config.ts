import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type PluginOption } from 'vite';

// Expose Vite's dev HTTP server on a global so the SvelteKit server hook can
// attach the WebSocket upgrade handler for the literature-review terminal
// once SvelteKit's `$env` resolution is live. We can't import `$lib/server/*`
// directly from here because Vite loads this config through Node's ESM
// loader, which doesn't know about SvelteKit's aliases.
function exposeHttpServerPlugin(): PluginOption {
	return {
		name: 'reos-expose-http-server',
		apply: 'serve',
		configureServer(server) {
			const httpServer = server.httpServer;
			if (!httpServer) return;
			(globalThis as unknown as { __reosHttpServer?: unknown }).__reosHttpServer = httpServer;
		},
	};
}

export default defineConfig({
	plugins: [sveltekit(), exposeHttpServerPlugin()],
	server: {
		host: true,
	},
	optimizeDeps: {
		include: ['pdfjs-dist'],
	},
	ssr: {
		// node-pty is a native module; keep it external so Vite doesn't try to
		// bundle the prebuilt `.node` binding.
		external: ['node-pty', 'ws', 'chokidar'],
	},
});
