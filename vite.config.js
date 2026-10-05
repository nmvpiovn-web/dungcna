import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			csrf: {
				// Worker tienganh7 proxy timbk.io.vn -> tienganh7-pro.pages.dev, Host bị rewrite
				// nên phải trust origin thật, nếu không mọi POST multipart/form-data (upload file) đều 403
				trustedOrigins: ['https://timbk.io.vn']
			}
		})
	],
	server: { host: '0.0.0.0', port: 5173, allowedHosts: true }
});
