// Turns the client build into a static site: one real HTML file per route,
// plus 404.html, sitemap.xml and robots.txt. Runs as the last step of `npm run build`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const base = process.env.SITE_BASE || '/';

const ssrFiles = await fs.readdir(ssrDir);
const entry = ssrFiles.find((f) => /^entry-server\.(m?js)$/.test(f));
if (!entry) throw new Error(`No server entry found in dist-ssr (found: ${ssrFiles.join(', ')})`);
const { render, routes, site, lastmod } = await import(pathToFileURL(path.join(ssrDir, entry)).href);

const template = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
if (!template.includes('<!--app-html-->') || !/<!--head-start-->[\s\S]*<!--head-end-->/.test(template)) {
  throw new Error('index.html is missing the <!--app-html--> or <!--head-start/end--> markers');
}

// Preload the two fonts every page needs for its first paint.
const assets = await fs.readdir(path.join(dist, 'assets'));
const preload = assets
  .filter((f) => /^(fraunces-latin-opsz-normal|geist-latin-wght-normal)[\w.-]*\.woff2$/.test(f))
  .map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${base}assets/${f}">`)
  .join('\n    ');

function page(rel) {
  const { html, head } = render(rel);
  return template
    .replace(/<!--head-start-->[\s\S]*<!--head-end-->/, () => [head, preload].filter(Boolean).join('\n    '))
    .replace('<!--app-html-->', () => html);
}

const list = routes();
for (const rel of list) {
  const file = path.join(dist, rel, 'index.html');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, page(rel));
}
await fs.writeFile(path.join(dist, '404.html'), page('404.html'));

const origin = String(site.meta.siteUrl || '').replace(/\/+$/, '');
// <lastmod> is only written where the real date is known; a made-up one teaches crawlers to ignore it.
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  list
    .map((rel) => {
      const date = lastmod(rel);
      return `  <url><loc>${origin}${base}${rel}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`;
    })
    .join('\n') +
  '\n</urlset>\n';
await fs.writeFile(path.join(dist, 'sitemap.xml'), sitemap);
// The editor page carries its own noindex tag; listing it here would only advertise it.
await fs.writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}${base}sitemap.xml\n`);
try {
  await fs.access(path.join(dist, 'og.png'));
} catch {
  console.warn('WARNING: dist/og.png is missing, so shared links will have no preview image. Run "npm run og" and commit public/og.png.');
}
// GitHub Pages: serve the files exactly as built.
await fs.writeFile(path.join(dist, '.nojekyll'), '');
await fs.rm(ssrDir, { recursive: true, force: true });

console.log(`prerendered ${list.length} pages + 404:`);
for (const rel of list) console.log('  /' + rel);
