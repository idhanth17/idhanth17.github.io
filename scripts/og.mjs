// Draws the link-preview image (public/og.png, 1200x630) and prints the public
// résumé (public/resume.pdf from resume/resume.html) with a locally installed Chrome.
// Run it by hand after changing your name, headline or résumé, then commit the results:
//
//   npm run og
//
// Set CHROME to the browser's path if it is not in the usual place.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const chrome = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!chrome) throw new Error('No Chrome or Edge found. Set the CHROME environment variable to its path.');

const site = JSON.parse(readFileSync(root + 'content/site.json', 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const font = (pkg, file) => pathToFileURL(`${root}node_modules/@fontsource-variable/${pkg}/files/${file}`).href;
const headline = esc(site.hero.headline).replace(/\*([^*]+)\*/, '<em>$1</em>');
const metrics = site.metrics
  .slice(0, 3)
  .map((m) => `<div><b>${esc(m.delta)}</b><span>${esc(m.label)}</span></div>`)
  .join('');

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:F;src:url(${font('fraunces', 'fraunces-latin-opsz-normal.woff2')})}
@font-face{font-family:F;font-style:italic;src:url(${font('fraunces', 'fraunces-latin-opsz-italic.woff2')})}
@font-face{font-family:M;src:url(${font('geist-mono', 'geist-mono-latin-wght-normal.woff2')})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#f4f0e6;color:#15140f;padding:64px 72px;display:flex;flex-direction:column;
 background-image:linear-gradient(rgba(21,20,15,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(21,20,15,.07) 1px,transparent 1px);background-size:44px 44px}
.top{font:500 22px M;letter-spacing:.09em;text-transform:uppercase;display:flex;gap:22px}
.top span{color:#6b665b}
h1{font:370 118px/0.98 F;letter-spacing:-.042em;margin-top:44px}
em{font-style:italic;font-weight:400;border:5px solid #d43a10;border-radius:50%;padding:0 .12em .04em}
.row{margin-top:auto;display:flex;gap:18px}
.row div{flex:1;border:2.5px solid #15140f;border-radius:14px;background:#f4f0e6;padding:16px 20px;box-shadow:6px 6px 0 #15140f}
.row b{display:block;font:500 40px M;letter-spacing:-.04em;color:#075c37}
.row span{font:500 17px M;color:#48453c}
</style>
<p class="top">${esc(site.profile.name)}<span>${esc(site.profile.role)} · ${esc(site.profile.focus)}</span></p>
<h1>${headline}</h1>
<div class="row">${metrics}</div>`;

const dir = mkdtempSync(join(tmpdir(), 'og-'));
const page = join(dir, 'og.html');
writeFileSync(page, html);
const run = (args) => execFileSync(chrome, ['--headless=new', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, ...args], { stdio: 'ignore' });

run([`--screenshot=${root}public/og.png`, '--window-size=1200,630', '--virtual-time-budget=3000', pathToFileURL(page).href]);
console.log('wrote public/og.png');

const resume = root + 'resume/resume.html';
if (existsSync(resume)) {
  run([`--print-to-pdf=${root}public/resume.pdf`, '--no-pdf-header-footer', pathToFileURL(resume).href]);
  console.log('wrote public/resume.pdf');
}
