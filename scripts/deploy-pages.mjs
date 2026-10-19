// Builds the app for GitHub Pages and publishes it to the `gh-pages` branch of `origin`.
// Usage: npm run deploy:pages
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
const read = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' }).trim();

const remote = read('git', ['remote', 'get-url', 'origin']);
const repo = remote.replace(/\.git$/, '').split(/[/:]/).pop();
const owner = remote.replace(/\.git$/, '').split(/[/:]/).slice(-2, -1)[0];
const baseHref = `/${repo}/`;

console.log(`Building for ${baseHref} ...`);
run('npx', ['ng', 'build', '--base-href', baseHref]);

const dist = join('dist', 'manhal-client', 'browser');
// SPA fallback: Pages serves 404.html for unknown paths, and the app's router takes over from there.
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
writeFileSync(join(dist, '.nojekyll'), '');

const work = mkdtempSync(join(tmpdir(), 'manhal-pages-'));
try {
  cpSync(dist, work, { recursive: true });
  run('git', ['init', '-q', '-b', 'gh-pages'], { cwd: work });
  run('git', ['add', '-A'], { cwd: work });
  run('git', ['-c', 'user.name=manhal-deploy', '-c', 'user.email=deploy@users.noreply.github.com', 'commit', '-q', '-m', 'Deploy to GitHub Pages'], { cwd: work });
  run('git', ['push', '--force', remote, 'gh-pages:gh-pages'], { cwd: work });
  console.log(`\nPublished. Site: https://${owner}.github.io/${repo}/`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
