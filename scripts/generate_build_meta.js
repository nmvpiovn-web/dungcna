import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

let commitSha = 'unknown';
try {
  commitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  console.warn('Could not read git rev-parse HEAD:', e.message);
}

const buildMeta = {
  source_commit: commitSha,
  build_timestamp: new Date().toISOString(),
  build_identity: `build_${commitSha.slice(0, 7)}_${Date.now()}`,
  version: '2.2.0',
  environment: process.env.NODE_ENV || 'production'
};

const staticDir = path.resolve('static');
if (!fs.existsSync(staticDir)) {
  fs.mkdirSync(staticDir, { recursive: true });
}

fs.writeFileSync(path.join(staticDir, 'build_meta.json'), JSON.stringify(buildMeta, null, 2), 'utf-8');
console.log('Generated static/build_meta.json:', buildMeta);
