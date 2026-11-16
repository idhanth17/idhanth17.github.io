import { renderToString } from 'react-dom/server';
import siteJson from '../content/site.json';
import { App } from './App';
import { headFor } from './lib/head';
import { renderMarkdown } from './lib/markdown';
import { allTracks, parseRoute, publishedPosts } from './lib/site';
import type { SiteContent } from './lib/types';

// Build-time only: scripts/prerender.mjs imports this bundle and writes one HTML file per route.

export const site = siteJson as unknown as SiteContent;

const posts = import.meta.glob('/content/posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const postSource = (slug: string): string | undefined => posts[`/content/posts/${slug}.md`];

/** Every page of the site, as paths relative to the base ("" is the home page). */
export function routes(): string[] {
  return [
    '',
    ...allTracks(site).map(({ track }) => `work/${track.id}/`),
    ...publishedPosts(site)
      .filter((p) => postSource(p.slug) !== undefined)
      .map((p) => `notes/${p.slug}/`),
  ];
}

/** The date a page last changed, when it is actually known (notes carry their own date). */
export function lastmod(rel: string): string | undefined {
  const route = parseRoute(rel);
  if (route.name !== 'post') return undefined;
  const date = site.writing.posts.find((p) => p.slug === route.slug)?.date;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

export function render(rel: string): { html: string; head: string } {
  const route = parseRoute(rel);
  let postHtml: string | null = null;
  if (route.name === 'post') {
    const md = postSource(route.slug);
    postHtml = md === undefined ? null : renderMarkdown(md);
  }
  const html = renderToString(<App content={site} initialRel={rel} initialPostHtml={postHtml} />);
  return { html, head: headFor(route, site, rel) };
}
