import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function resolveCompileTimeClientBuildMeta() {
	try {
		const metaPath = path.resolve('static/build_meta.json');
		if (fs.existsSync(metaPath)) {
			const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
			if (parsed && parsed.version && parsed.build_identity) {
				return {
					version: String(parsed.version),
					build_identity: String(parsed.build_identity),
					build_timestamp: String(parsed.build_timestamp || '2026-10-09T11:05:19.489Z'),
					source_commit: String(parsed.source_commit || 'unknown')
				};
			}
		}
	} catch {}

	let sha = process.env.VITE_GIT_SHA || 'bfad941fffa2d7cd038d128c3b3171fe1015a2a6';
	let ts = process.env.VITE_BUILD_TIMESTAMP || '2026-10-09T11:05:19.489Z';
	try {
		sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim() || sha;
		ts = execSync('git log -1 --format=%cI', { encoding: 'utf-8' }).trim() || ts;
	} catch {}
	const epoch = Number.isNaN(new Date(ts).getTime()) ? 1791543919489 : new Date(ts).getTime();
	return {
		version: process.env.VITE_APP_VERSION || '2.2.0',
		build_identity: process.env.VITE_BUILD_IDENTITY || `build_${sha.slice(0, 7)}_${epoch}`,
		build_timestamp: ts,
		source_commit: sha
	};
}

const CLIENT_BUILD_META = resolveCompileTimeClientBuildMeta();

export default defineConfig({
	define: {
		__CLIENT_BUILD_META__: JSON.stringify(CLIENT_BUILD_META)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			csrf: {
				// Worker tienganh7 proxy timbk.io.vn -> tienganh7-pro.pages.dev, Host bị rewrite
				// nên phải trust origin thật, nếu không mọi POST multipart/form-data (upload file) đều 403
				trustedOrigins: ['*']
			}
		})
	],
	server: { host: '0.0.0.0', port: 5173, allowedHosts: true }
});
