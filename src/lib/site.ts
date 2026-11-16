import type { Experience, Metric, Project, SiteContent, Track } from './types';

/** Base path the site is served from ("/" on idhanth17.github.io). Always ends with "/". */
export const BASE: string = import.meta.env.BASE_URL || '/';

const WEB_URL = /^(https?:\/\/|mailto:)/i;
// The editor previews not-yet-published uploads as data URLs; only raster images qualify.
const DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i;

/**
 * Turn any URL from content into something safe to put in an href or src.
 * "/x" is site-relative, "#x" is a section of the home page, and http(s)/mailto
 * links pass through. Anything else (javascript:, //host, other schemes) becomes "#".
 */
export function href(path: string): string {
  const p = (path ?? '').trim();
  if (!p) return '#';
  if (p.startsWith('#')) return BASE + p;
  if (p.startsWith('/')) return /^\/[/\\]/.test(p) ? '#' : BASE + p.slice(1);
  if (WEB_URL.test(p) || DATA_IMAGE.test(p)) return p;
  return '#';
}

export const safeUrl = href;

export function isExternal(url: string): boolean {
  return /^https?:/i.test(url);
}

export type Route =
  | { name: 'home' }
  | { name: 'case'; id: string }
  | { name: 'post'; slug: string }
  | { name: 'notfound' };

/** Route for a pathname relative to BASE, e.g. "" | "work/zealot/" | "notes/slug/". */
export function parseRoute(rel: string): Route {
  const p = rel.replace(/^\/+/, '').replace(/index\.html$/, '');
  if (p === '') return { name: 'home' };
  const m = /^(work|notes)\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(p);
  if (m) return m[1] === 'work' ? { name: 'case', id: m[2] } : { name: 'post', slug: m[2] };
  return { name: 'notfound' };
}

export function stripBase(pathname: string): string {
  return pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
}

export function casePath(id: string): string {
  return `/work/${id}/`;
}

export function postPath(slug: string): string {
  return `/notes/${slug}/`;
}

export interface TrackRef {
  track: Track;
  exp: Experience;
}

export function allTracks(c: SiteContent): TrackRef[] {
  return c.work.experience.flatMap((exp) => exp.tracks.map((track) => ({ track, exp })));
}

export function findTrack(c: SiteContent, id: string): TrackRef | undefined {
  return allTracks(c).find((t) => t.track.id === id);
}

export function metricById(c: SiteContent, id: string): Metric | undefined {
  return c.metrics.find((m) => m.id === id);
}

export function publishedPosts(c: SiteContent) {
  return c.writing.posts
    .filter((p) => p.published)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface Evidence {
  kind: 'Case file' | 'Project';
  title: string;
  tagline: string;
  href: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');

/** Everything on the site whose stack lists this skill. This is what makes a skill "have receipts". */
export function evidenceFor(c: SiteContent, skill: string): Evidence[] {
  const key = norm(skill);
  const out: Evidence[] = [];
  for (const { track } of allTracks(c)) {
    if (track.stack.some((s) => norm(s) === key)) {
      out.push({ kind: 'Case file', title: track.title, tagline: track.tagline, href: href(casePath(track.id)) });
    }
  }
  for (const p of c.projects.items) {
    if (p.stack.some((s) => norm(s) === key)) {
      out.push({ kind: 'Project', title: p.title, tagline: p.tagline, href: href(`#project-${p.id}`) });
    }
  }
  return out;
}

export function projectTags(items: Project[]): string[] {
  const seen = new Set<string>();
  for (const p of items) for (const t of p.tags) seen.add(t);
  return [...seen];
}

/** Format a number with fixed decimals and thousands separators. Same output in Node and browsers. */
export function fmt(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (value < 0 ? '−' : '') + grouped + (frac ? '.' + frac : '');
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/** Small deterministic PRNG so generated art is identical on the server and in the browser. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
