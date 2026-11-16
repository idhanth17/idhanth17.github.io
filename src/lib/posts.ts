import { BASE } from './site';

// Notes live as Markdown files in content/posts/<slug>.md; their titles and dates
// live in content/site.json. Only published notes are prerendered to pages.
//
// When a visitor moves to a note without a full page load, its text is taken from
// that prerendered page. Nothing about a note is bundled into the site's scripts,
// so an unpublished draft is never shipped to visitors.

export async function loadPostHtml(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}notes/${slug}/`, { headers: { Accept: 'text/html' } });
    if (res.ok) {
      const body = new DOMParser().parseFromString(await res.text(), 'text/html').getElementById('post-body');
      if (body) return body.innerHTML;
    }
  } catch {
    /* offline or blocked: fall through */
  }
  if (import.meta.env.DEV) {
    // The dev server has no prerendered pages, so render the Markdown on the spot.
    const files = import.meta.glob('/content/posts/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
    const loader = files[`/content/posts/${slug}.md`];
    if (loader) {
      const [{ renderMarkdown }, source] = await Promise.all([import('./markdown'), loader()]);
      return renderMarkdown(source);
    }
  }
  return null;
}
