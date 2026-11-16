import { BASE, findTrack, href, type Route } from './site';
import type { SiteContent } from './types';

export function titleFor(route: Route, c: SiteContent): string {
  if (route.name === 'case') {
    const t = findTrack(c, route.id);
    if (t) return `${t.track.title} · ${c.profile.name}`;
  }
  if (route.name === 'post') {
    const p = c.writing.posts.find((x) => x.slug === route.slug);
    if (p) return `${p.title} · ${c.profile.name}`;
  }
  if (route.name === 'home') return c.meta.title;
  return `Page not found · ${c.profile.name}`;
}

export function descriptionFor(route: Route, c: SiteContent): string {
  if (route.name === 'case') {
    const t = findTrack(c, route.id);
    if (t) return `${t.track.tagline}. A case file by ${c.profile.name}: the challenge, the action and the measured result.`;
  }
  if (route.name === 'post') {
    const p = c.writing.posts.find((x) => x.slug === route.slug);
    if (p) return p.summary;
  }
  return c.meta.description;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Everything that goes in <head> for one route. Used at build time by the prerenderer. */
export function headFor(route: Route, c: SiteContent, rel: string): string {
  const site = c.meta.siteUrl.replace(/\/+$/, '');
  const home = site + BASE;
  const url = home + (route.name === 'notfound' ? '' : rel);
  const title = titleFor(route, c);
  const desc = descriptionFor(route, c);
  const image = home + 'og.png';
  // Only real web addresses are advertised as "the same person".
  const sameAs = c.profile.links.map((l) => href(l.url)).filter((u) => /^https?:\/\//i.test(u));

  const person = {
    '@type': 'Person',
    '@id': home + '#me',
    name: c.profile.name,
    url: home,
    jobTitle: c.profile.role,
    description: c.meta.description,
    ...(c.profile.photo.startsWith('/') ? { image: home + c.profile.photo.replace(/^\/+/, '') } : {}),
    ...(c.profile.email ? { email: 'mailto:' + c.profile.email } : {}),
    sameAs,
    alumniOf: c.about.education.map((e) => ({ '@type': 'CollegeOrUniversity', name: e.school })),
    knowsAbout: c.skills.groups.flatMap((g) => g.items),
  };

  const graph: object[] = [person, { '@type': 'WebSite', '@id': home + '#site', url: home, name: c.profile.name, author: { '@id': person['@id'] } }];

  if (route.name === 'home') {
    // The markup search engines look for on a personal profile page.
    graph.push({ '@type': 'ProfilePage', '@id': home + '#page', url: home, name: title, mainEntity: { '@id': person['@id'] } });
  }
  if (route.name === 'case') {
    const found = findTrack(c, route.id);
    if (found) graph.push({ '@type': 'Article', headline: found.track.title, description: desc, url, image, author: { '@id': person['@id'] } });
  }
  if (route.name === 'post') {
    const post = c.writing.posts.find((x) => x.slug === route.slug);
    if (post) {
      graph.push({
        '@type': 'Article',
        headline: post.title,
        description: desc,
        url,
        image,
        author: { '@id': person['@id'] },
        datePublished: post.date,
        ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
      });
    }
  }

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="author" content="${esc(c.profile.name)}">`,
    route.name === 'notfound' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="${route.name === 'home' ? 'profile' : 'article'}">`,
    `<meta property="og:site_name" content="${esc(c.profile.name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(`${c.profile.name}: ${c.profile.role}, ${c.profile.focus}`)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    ...sameAs.map((u) => `<link rel="me" href="${esc(u)}">`),
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`,
  ];

  // Optional, cookie-less visit counting. It is loaded only when this page is the
  // top-level window: never inside the owner's editor preview, where a third-party
  // script would share an origin with the editor.
  const gc = c.meta.goatcounter.trim();
  if (/^[a-z0-9-]+$/i.test(gc)) {
    tags.push(
      `<script>if(window.top===window){var s=document.createElement('script');s.async=true;s.src='https://gc.zgo.at/count.js';s.setAttribute('data-goatcounter','https://${gc}.goatcounter.com/count');document.head.appendChild(s)}</script>`,
    );
  }
  return tags.join('\n    ');
}
