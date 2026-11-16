import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import siteJson from '../../content/site.json';
import { Icon } from '../components/Icons';
import { renderMarkdown } from '../lib/markdown';
import { BASE } from '../lib/site';
import type { PostMeta, SiteContent } from '../lib/types';
import { Fields, type FormContext } from './Form';
import {
  bytesToBase64,
  canWrite,
  commitFiles,
  getDeployRun,
  getHead,
  getRepoAccess,
  getViewer,
  GitHubError,
  readFile,
  validateConfig,
  type DeployRun,
  type FileChange,
  type GitHubConfig,
  type Viewer,
} from './github';
import { POST_FIELDS, SECTIONS, WRITING_FIELDS } from './schema';

/* eslint-disable @typescript-eslint/no-explicit-any */

const bundled = siteJson as unknown as SiteContent;
const REPO = bundled.meta.repo;
const BRANCH = bundled.meta.branch || 'main';
const CONTENT_PATH = 'content/site.json';
const TOKEN_KEY = 'ik:admin:token';
const DRAFT_KEY = 'ik:admin:draft';

// Development only: point the editor at the local mock in scripts/mock-github.mjs.
// In a production build this is always undefined, so a token can only ever go to api.github.com.
const API_OVERRIDE = import.meta.env.DEV ? (new URLSearchParams(location.search).get('api') ?? undefined) : undefined;

const postFile = (slug: string) => `content/posts/${slug}.md`;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'note'
  );
}

// ---------- small pure helpers ----------

function getIn(obj: any, path: string[]): any {
  return path.reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setIn(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  return { ...obj, [head]: setIn(obj?.[head], rest, value) };
}

/** Fill in any section a stored file is missing, so older content never crashes the site. */
function normalize(raw: any, fallback: SiteContent): SiteContent {
  const out: any = { ...fallback, ...(raw && typeof raw === 'object' ? raw : {}) };
  for (const key of Object.keys(fallback) as Array<keyof SiteContent>) {
    const base = fallback[key] as any;
    if (base && typeof base === 'object' && !Array.isArray(base)) out[key] = { ...base, ...(raw?.[key] ?? {}) };
  }
  return out as SiteContent;
}

const LABELS: Record<string, string> = {
  meta: 'settings',
  profile: 'profile',
  hero: 'hero',
  brief: 'summaries',
  metrics: 'numbers',
  work: 'work',
  projects: 'projects',
  skills: 'skills',
  about: 'about',
  writing: 'notes',
  contact: 'contact',
  footer: 'footer',
};

function changedSections(a: SiteContent, b: SiteContent): string[] {
  return (Object.keys(LABELS) as Array<keyof SiteContent>).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => LABELS[k]);
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

function validate(c: SiteContent): string[] {
  const problems: string[] = [];
  const tracks = c.work.experience.flatMap((e) => e.tracks.map((t) => t.id));
  for (const id of tracks) if (!SLUG.test(id)) problems.push(`Case file ID “${id}” may only contain lowercase letters, digits and dashes.`);
  for (const id of duplicates(tracks)) problems.push(`Two case files share the ID “${id}”.`);
  const projects = c.projects.items.map((p) => p.id);
  for (const id of projects) if (!SLUG.test(id)) problems.push(`Project ID “${id}” may only contain lowercase letters, digits and dashes.`);
  for (const id of duplicates(projects)) problems.push(`Two projects share the ID “${id}”.`);
  for (const id of duplicates(c.metrics.map((m) => m.id))) problems.push(`Two results share the ID “${id}”.`);
  const slugs = c.writing.posts.map((p) => p.slug);
  for (const s of slugs) if (!SLUG.test(s)) problems.push(`Note address “${s}” may only contain lowercase letters, digits and dashes.`);
  for (const s of duplicates(slugs)) problems.push(`Two notes share the address “${s}”.`);
  for (const p of c.writing.posts) if (p.published && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) problems.push(`The note “${p.title || p.slug}” needs a date like 2026-11-15 before it can be published.`);
  if (!/^https?:\/\/[^/]+/.test(c.meta.siteUrl)) problems.push('The site address in Site settings must start with https://');
  if (c.profile.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.profile.email)) problems.push('The public email address does not look valid.');
  if (!c.profile.name.trim()) problems.push('Your name cannot be empty.');
  return problems;
}

function explain(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 0) return e.message;
    if (e.status === 401) return 'GitHub no longer accepts this token. Sign out and sign in with a new one.';
    if (e.status === 403) return 'GitHub refused the change. The token needs the “Contents: Read and write” permission on this repository.';
    if (e.status === 409 || e.status === 422) return 'The site changed on GitHub while publishing. Nothing was lost: press Publish again.';
    return `${e.message} (GitHub ${e.status || 'unreachable'})`;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

// ---------- token storage ----------

// The token is kept for this browser tab only (sessionStorage) and never in
// localStorage: every page on this site's address, including other projects
// published under the same GitHub Pages domain, can read localStorage.

function loadToken(): string {
  try {
    localStorage.removeItem(TOKEN_KEY); // clear anything an older version of this editor left behind
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable: the token lives in memory for this page view only */
  }
}

function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

async function connect(token: string): Promise<{ cfg: GitHubConfig; viewer: Viewer }> {
  const cfg: GitHubConfig = { token, repo: REPO, branch: BRANCH, api: API_OVERRIDE };
  validateConfig(cfg);
  let viewer: Viewer;
  try {
    viewer = await getViewer(cfg);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 401) throw new Error('GitHub did not accept that token. Check that you copied all of it and that it has not expired.');
    throw e;
  }
  try {
    const access = await getRepoAccess(cfg);
    if (!access.canPush || !(await canWrite(cfg))) {
      throw new Error(`That token can read ${REPO} but cannot write to it. Create one with “Contents: Read and write”.`);
    }
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) {
      throw new Error(`That token cannot see ${REPO}. When creating it, choose “Only select repositories” and pick this one.`);
    }
    throw e;
  }
  return { cfg, viewer };
}

// ---------- uploads ----------

interface Upload {
  base64: string;
  mime: string;
}

async function prepareUpload(file: File, opts: { kind: 'image' | 'file'; target?: string }): Promise<{ repoPath: string; sitePath: string; upload: Upload }> {
  if (opts.kind === 'file') {
    if (file.size > 8 * 1024 * 1024) throw new Error('That file is larger than 8 MB.');
    if (opts.target?.endsWith('.pdf') && file.type !== 'application/pdf') throw new Error('Please choose a PDF file.');
    const repoPath = opts.target ?? `public/uploads/${slugify(file.name)}`;
    return {
      repoPath,
      sitePath: '/' + repoPath.replace(/^public\//, ''),
      upload: { base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), mime: file.type || 'application/octet-stream' },
    };
  }
  // Images are redrawn onto a canvas: this caps their size and drops metadata such as GPS location.
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) throw new Error('Please choose a PNG, JPEG, WebP, GIF or AVIF image.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('That image could not be processed.'))), 'image/webp', 0.86));
  const name = `${slugify(file.name.replace(/\.[a-z0-9]+$/i, ''))}-${Date.now().toString(36)}.webp`;
  return {
    repoPath: `public/uploads/${name}`,
    sitePath: `/uploads/${name}`,
    upload: { base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), mime: 'image/webp' },
  };
}

const sitePathOf = (repoPath: string) => '/' + repoPath.replace(/^public\//, '');

// ---------- sign in ----------

function SignIn({ onToken, busy, error }: { onToken: (token: string) => void; busy: boolean; error: string }) {
  const [token, setToken] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (token.trim()) onToken(token.trim());
  };
  return (
    <main className="ad-signin">
      <form className="ad-card" onSubmit={submit}>
        <p className="eyebrow">Owner editor</p>
        <h1>Edit this site</h1>
        <p>
          This editor saves by committing to <b>{REPO}</b> on GitHub. GitHub decides who may do that, and the only person who can is the owner of that
          repository. There is no password on this page to guess.
        </p>
        <ol className="ad-steps">
          <li>
            Open{' '}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
              GitHub → New fine-grained token
            </a>
            .
          </li>
          <li>
            Repository access: <b>Only select repositories</b> → <b>{REPO.split('/')[1]}</b>.
          </li>
          <li>
            Repository permissions: <b>Contents → Read and write</b>. Nothing else is needed.
          </li>
          <li>
            Expiration: a short one (30 or 90 days) is safest. You can make a new token whenever you like.
          </li>
          <li>Generate the token and paste it here.</li>
        </ol>
        <label className="ad-label" htmlFor="ad-token">
          Access token
        </label>
        <input id="ad-token" className="ad-input" type="password" autoComplete="off" spellCheck={false} value={token} placeholder="github_pat_…" onChange={(e) => setToken(e.target.value)} />
        <p className="ad-help">
          The token is kept for this browser tab only and is forgotten when you close the tab or sign out. It is sent to api.github.com and nowhere else.
          Because it can only touch this one repository, the worst a leaked token could do is change this site, and every change can be undone from the
          repository's history.
        </p>
        {error && (
          <p className="ad-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Checking with GitHub…' : 'Sign in'}
        </button>
        <a className="ad-backlink" href={BASE}>
          ← Back to the site
        </a>
      </form>
    </main>
  );
}

// ---------- live preview ----------

function Preview({ content, target, device }: { content: SiteContent; target: string; device: 'desktop' | 'mobile' }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const latest = useRef(content);
  latest.current = content;
  const [box, setBox] = useState({ w: 0, h: 0 });

  const send = useCallback((message: object) => {
    frame.current?.contentWindow?.postMessage(message, location.origin);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if ((e.data as { type?: string } | null)?.type === 'ik:preview-ready') {
        ready.current = true;
        send({ type: 'ik:preview', content: latest.current });
      }
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [send]);

  // Push edits to the preview shortly after typing stops.
  useEffect(() => {
    if (!ready.current) return;
    const t = setTimeout(() => send({ type: 'ik:preview', content }), 220);
    return () => clearTimeout(t);
  }, [content, send]);

  useEffect(() => {
    if (ready.current) send({ type: 'ik:preview-goto', target });
  }, [target, send]);

  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    // Measure straight away as well: observers only report once the browser paints.
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      removeEventListener('resize', measure);
    };
  }, []);

  // The desktop preview renders at 1280px and is scaled down to fit the pane.
  const width = device === 'desktop' ? 1280 : Math.min(390, box.w);
  const scale = device === 'desktop' && box.w > 0 ? Math.min(1, box.w / width) : 1;
  return (
    <div className="ad-preview-pane" ref={pane} data-device={device}>
      <iframe
        ref={frame}
        title="Live preview of the site"
        src={`${BASE}?preview=1`}
        style={{ width, height: box.h > 0 ? box.h / scale : '100%', transform: `scale(${scale})`, left: device === 'mobile' ? Math.max(0, (box.w - width) / 2) : 0 }}
      />
    </div>
  );
}

// ---------- notes ----------

interface NotesProps {
  content: SiteContent;
  onChange: (next: SiteContent) => void;
  ctx: FormContext;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  body: string | null;
  onBody: (slug: string, text: string) => void;
  onDelete: (slug: string) => void;
  bodyFailed: boolean;
  onRetry: () => void;
}

function Notes({ content, onChange, ctx, selected, onSelect, body, onBody, onDelete, bodyFailed, onRetry }: NotesProps) {
  const posts = content.writing.posts;
  const post = posts.find((p) => p.slug === selected);
  const setWriting = (w: SiteContent['writing']) => onChange({ ...content, writing: w });
  const setPost = (next: PostMeta) => setWriting({ ...content.writing, posts: posts.map((p) => (p.slug === next.slug ? next : p)) });

  const add = () => {
    const title = window.prompt('Title of the new note');
    if (!title?.trim()) return;
    let slug = slugify(title);
    const taken = new Set(posts.map((p) => p.slug));
    for (let i = 2; taken.has(slug); i++) slug = `${slugify(title)}-${i}`;
    const today = new Date().toISOString().slice(0, 10);
    setWriting({ ...content.writing, posts: [{ slug, title: title.trim(), date: today, summary: '', tags: [], published: false }, ...posts] });
    onBody(slug, `Write the note here. Markdown works: **bold**, lists, links and \`code\`.\n`);
    onSelect(slug);
  };

  return (
    <>
      <Fields fields={WRITING_FIELDS} value={content.writing} onChange={(w) => setWriting({ ...content.writing, ...w })} ctx={ctx} />
      <div className="ad-field">
        <span className="ad-label">Notes</span>
        <p className="ad-help">Each published note becomes its own page at /notes/address/. The Notes section appears on the home page once one is published.</p>
        <div className="ad-list">
          {posts.length === 0 && <p className="ad-empty">No notes yet.</p>}
          {posts.map((p) => (
            <div className="ad-item" key={p.slug} data-open={p.slug === selected || undefined}>
              <div className="ad-item-head">
                <button type="button" className="ad-item-title" aria-expanded={p.slug === selected} onClick={() => onSelect(p.slug === selected ? null : p.slug)}>
                  <span className="ad-caret" aria-hidden="true">
                    ›
                  </span>
                  <span>{p.title || 'Untitled'}</span>
                </button>
                <span className={'ad-pill' + (p.published ? ' is-on' : '')}>{p.published ? 'Published' : 'Draft'}</span>
              </div>
              {p.slug === selected && post && (
                <div className="ad-item-body">
                  <Fields fields={POST_FIELDS} value={post} onChange={(next) => setPost({ ...post, ...next })} ctx={ctx} />
                  <p className="ad-help">
                    Address: <code>/notes/{post.slug}/</code> (fixed once created, so links to it never break)
                  </p>
                  <div className="ad-field">
                    <label className="ad-label" htmlFor="ad-body">
                      Text (Markdown)
                    </label>
                    {bodyFailed ? (
                      <p className="ad-error" role="alert">
                        The text could not be loaded from GitHub.{' '}
                        <button type="button" className="ad-link" onClick={onRetry}>
                          Try again
                        </button>
                      </p>
                    ) : body === null ? (
                      <p className="ad-empty">Loading the text from GitHub…</p>
                    ) : (
                      <textarea id="ad-body" className="ad-input ad-textarea ad-md" rows={18} value={body} onChange={(e) => onBody(post.slug, e.target.value)} />
                    )}
                  </div>
                  <button
                    type="button"
                    className="ad-btn ad-btn-danger"
                    onClick={() => {
                      if (window.confirm(`Delete the note “${post.title || post.slug}”? It is removed from the site when you publish.`)) onDelete(post.slug);
                    }}
                  >
                    Delete this note
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="ad-add" onClick={add}>
          <Icon name="plus" size={14} /> New note
        </button>
      </div>
    </>
  );
}

// ---------- the editor ----------

interface Loaded {
  content: SiteContent;
  sha: string;
}

type PublishState = { state: 'idle' } | { state: 'confirm' } | { state: 'saving' } | { state: 'conflict'; message: string } | { state: 'error'; message: string };

interface StoredDraft {
  base: string;
  at: number;
  content: SiteContent;
  uploads: Record<string, Upload>;
  bodies: Record<string, string>;
  dirtyBodies: string[];
  removed: string[];
}

function Editor({ cfg, viewer, initial, onSignOut }: { cfg: GitHubConfig; viewer: Viewer; initial: Loaded; onSignOut: () => void }) {
  const [loaded, setLoaded] = useState(initial);
  const [draft, setDraft] = useState(initial.content);
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [dirtyBodies, setDirtyBodies] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [section, setSection] = useState('profile');
  const [note, setNote] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [pub, setPub] = useState<PublishState>({ state: 'idle' });
  const [message, setMessage] = useState('');
  const [deploy, setDeploy] = useState<(DeployRun & { commit: string }) | null>(null);
  const [notice, setNotice] = useState('');
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [bodyRetry, setBodyRetry] = useState(0);
  const deployTimer = useRef(0);
  const restored = useRef(false);

  const changed = useMemo(() => changedSections(loaded.content, draft), [loaded, draft]);
  const pendingUploads = useMemo(() => {
    const text = JSON.stringify(draft);
    return Object.keys(uploads).filter((p) => text.includes(`"${sitePathOf(p)}"`));
  }, [uploads, draft]);
  const liveSlugs = useMemo(() => new Set(draft.writing.posts.map((p) => p.slug)), [draft]);
  const pendingBodies = dirtyBodies.filter((s) => liveSlugs.has(s));
  const pendingRemovals = removed.filter((s) => !liveSlugs.has(s));
  const dirty = changed.length > 0 || pendingUploads.length > 0 || pendingBodies.length > 0 || pendingRemovals.length > 0;
  const problems = useMemo(() => validate(draft), [draft]);

  // Restore unpublished work from this browser, if it was based on the same version of the site.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StoredDraft;
      if (saved.base !== initial.sha) {
        localStorage.removeItem(DRAFT_KEY);
        setNotice('An older unpublished draft in this browser was set aside because the site has changed since.');
        return;
      }
      setDraft(normalize(saved.content, bundled));
      setUploads(saved.uploads ?? {});
      setBodies(saved.bodies ?? {});
      setDirtyBodies(saved.dirtyBodies ?? []);
      setRemoved(saved.removed ?? []);
      setNotice(`Restored your unpublished changes from ${new Date(saved.at).toLocaleString()}.`);
    } catch {
      /* no usable draft */
    }
  }, [initial.sha]);

  // Keep unpublished work in this browser so a closed tab does not lose it.
  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => {
      try {
        if (!dirty) localStorage.removeItem(DRAFT_KEY);
        else {
          const saved: StoredDraft = { base: loaded.sha, at: Date.now(), content: draft, uploads, bodies, dirtyBodies, removed };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(saved));
        }
      } catch {
        // Too large for this browser's storage. Drop the older copy so it is never restored as if it were current.
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* nothing more to do: the leave-page warning still protects the work */
        }
      }
    }, 600);
    return () => clearTimeout(t);
  }, [dirty, draft, uploads, bodies, dirtyBodies, removed, loaded.sha]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => () => clearTimeout(deployTimer.current), []);

  // Load a note's text the first time it is opened.
  useEffect(() => {
    if (!note || note in bodies || bodyError === note) return;
    let live = true;
    readFile(cfg, postFile(note))
      .then((f) => live && setBodies((b) => (note in b ? b : { ...b, [note]: f?.text ?? '' })))
      // A failed load must never look like an empty note: publishing that would wipe the real text.
      .catch(() => live && setBodyError(note));
    return () => {
      live = false;
    };
  }, [note, bodies, cfg, bodyError, bodyRetry]);

  const ctx: FormContext = useMemo(
    () => ({
      upload: async (file, opts) => {
        const { repoPath, sitePath, upload } = await prepareUpload(file, opts);
        setUploads((u) => ({ ...u, [repoPath]: upload }));
        return sitePath;
      },
      preview: (path) => {
        const staged = uploads['public' + path];
        if (staged) return `data:${staged.mime};base64,${staged.base64}`;
        return path.startsWith('/') ? BASE + path.slice(1) : path;
      },
    }),
    [uploads],
  );

  // What the preview shows: the draft, with not-yet-published images swapped for their data.
  const previewContent = useMemo(() => {
    const staged = Object.entries(uploads).filter(([, u]) => u.mime.startsWith('image/'));
    if (staged.length === 0) return draft;
    let text = JSON.stringify(draft);
    for (const [repoPath, u] of staged) text = text.split(`"${sitePathOf(repoPath)}"`).join(`"data:${u.mime};base64,${u.base64}"`);
    return JSON.parse(text) as SiteContent;
  }, [draft, uploads]);

  const active = SECTIONS.find((s) => s.id === section);
  const target = section === 'notes' ? 'notes' : (active?.target ?? 'top');

  const watchDeploy = (commit: string) => {
    clearTimeout(deployTimer.current);
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const run = await getDeployRun(cfg, commit);
        setDeploy({ commit, ...(run ?? { status: 'waiting', conclusion: null, url: '' }) });
        if (run?.status === 'completed') return;
      } catch {
        /* a failed status check is not worth interrupting the editor for */
      }
      if (tries < 90) deployTimer.current = window.setTimeout(tick, 6000);
    };
    setDeploy({ commit, status: 'waiting', conclusion: null, url: '' });
    void tick();
  };

  const publish = async (force: boolean) => {
    setPub({ state: 'saving' });
    try {
      const head = await getHead(cfg);
      const current = await readFile(cfg, CONTENT_PATH, head.commit);
      if (!force && current && current.sha !== loaded.sha) {
        setPub({ state: 'conflict', message: 'The site content on GitHub changed after you opened this editor, probably from another device or tab.' });
        return;
      }
      const changes: FileChange[] = [{ path: CONTENT_PATH, text: JSON.stringify(draft, null, 2) + '\n' }];
      for (const path of pendingUploads) changes.push({ path, base64: uploads[path].base64 });
      for (const slug of pendingBodies) changes.push({ path: postFile(slug), text: (bodies[slug] ?? '').replace(/\s*$/, '\n') });
      for (const slug of pendingRemovals) {
        if (await readFile(cfg, postFile(slug), head.commit)) changes.push({ path: postFile(slug), remove: true });
      }
      const commit = await commitFiles(cfg, head, changes, message.trim() || defaultMessage);
      // The publish has happened by this point; a failed read-back must not report it as failed.
      const fresh = await readFile(cfg, CONTENT_PATH, commit).catch(() => null);
      setLoaded({ content: draft, sha: fresh?.sha ?? '' });
      setUploads({});
      setDirtyBodies([]);
      setRemoved([]);
      setMessage('');
      setNotice('');
      setPub({ state: 'idle' });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      watchDeploy(commit);
    } catch (e) {
      setPub({ state: 'error', message: explain(e) });
    }
  };

  const reload = async () => {
    if (dirty && !window.confirm('Discard your unpublished changes and load the latest version from GitHub?')) return;
    try {
      const file = await readFile(cfg, CONTENT_PATH);
      if (!file) throw new Error(`${CONTENT_PATH} is missing from the repository.`);
      const content = normalize(JSON.parse(file.text), bundled);
      setLoaded({ content, sha: file.sha });
      setDraft(content);
      setUploads({});
      setBodies({});
      setDirtyBodies([]);
      setRemoved([]);
      setNote(null);
      setPub({ state: 'idle' });
      setNotice('Loaded the latest version from GitHub.');
    } catch (e) {
      setPub({ state: 'error', message: explain(e) });
    }
  };

  const discard = () => {
    if (!window.confirm('Discard all unpublished changes?')) return;
    setDraft(loaded.content);
    setUploads({});
    setBodies({});
    setDirtyBodies([]);
    setRemoved([]);
    setNote(null);
    setNotice('');
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const restoreFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data?.profile?.name || !data?.hero || !data?.work) throw new Error('That file is not a backup of this site.');
      setDraft(normalize(data, bundled));
      setNotice('Backup loaded into the editor. Review it, then publish to make it live.');
    } catch (e) {
      setPub({ state: 'error', message: e instanceof Error ? e.message : 'That file could not be read.' });
    }
  };

  const parts: string[] = [];
  if (changed.length) parts.push(changed.join(', '));
  if (pendingUploads.length) parts.push(`${pendingUploads.length} file${pendingUploads.length > 1 ? 's' : ''}`);
  if (pendingBodies.length) parts.push(`${pendingBodies.length} note${pendingBodies.length > 1 ? 's' : ''}`);
  if (pendingRemovals.length) parts.push(`${pendingRemovals.length} note${pendingRemovals.length > 1 ? 's' : ''} removed`);
  const defaultMessage = `Update ${parts.join(' + ') || 'content'}`;

  let deployText = '';
  let deployTone = '';
  if (deploy) {
    if (deploy.status === 'completed') {
      const ok = deploy.conclusion === 'success';
      // A newer publish cancels the build that was still running for an older one.
      const superseded = deploy.conclusion === 'cancelled';
      deployText = ok ? 'Live. Your changes are on the site.' : superseded ? 'A newer publish replaced this build.' : 'The site build failed, so the site is unchanged.';
      deployTone = ok ? 'good' : superseded ? '' : 'bad';
    } else if (deploy.status === 'waiting') deployText = 'Published. Waiting for the site build to start…';
    else deployText = 'Published. The site is rebuilding, usually about a minute…';
  }

  const noteBody = note ? (note in bodies ? bodies[note] : null) : null;
  // The same renderer the site uses, so the preview is what will be published.
  const notePreview = useMemo(() => (noteBody ? DOMPurify.sanitize(renderMarkdown(noteBody)) : ''), [noteBody]);
  const showNotePreview = section === 'notes' && note !== null;

  return (
    <div className="ad-app" data-view={view}>
      <header className="ad-top">
        {/* Opened in a separate tab, so the public pages never share this tab's sign-in. */}
        <a className="brand" href={BASE} target="_blank" rel="noopener" title="Open the site in a new tab">
          <span className="brand-mark" aria-hidden="true">
            IK
          </span>
          <span className="brand-name">Editor</span>
        </a>
        <span className="ad-repo">{REPO}</span>
        <span className="ad-status" data-tone={dirty ? 'warn' : 'ok'}>
          {dirty ? `Unpublished: ${parts.join(' + ')}` : 'Everything is published'}
        </span>
        <span className="ad-top-tools">
          <span className="ad-viewtabs" role="group" aria-label="Show">
            <button type="button" aria-pressed={view === 'edit'} onClick={() => setView('edit')}>
              Edit
            </button>
            <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
              Preview
            </button>
          </span>
          {dirty && (
            <button type="button" className="ad-btn" onClick={discard}>
              Discard
            </button>
          )}
          <button type="button" className="btn btn-primary ad-publish" disabled={!dirty || pub.state === 'saving'} onClick={() => setPub({ state: 'confirm' })}>
            {pub.state === 'saving' ? 'Publishing…' : 'Publish'}
          </button>
          <span className="ad-user" title={`Signed in as ${viewer.login}`}>
            <img src={viewer.avatar_url} alt="" width={28} height={28} />
            <button type="button" className="ad-link" onClick={onSignOut}>
              Sign out
            </button>
          </span>
        </span>
      </header>

      {pub.state === 'saving' && (
        // Nothing can be edited while a publish is running, so nothing typed in those seconds can be lost.
        <div className="ad-sheet" role="alertdialog" aria-modal="true" aria-label="Publishing">
          <div className="ad-card">
            <h2>Publishing…</h2>
            <p>Saving your changes to GitHub. This takes a few seconds.</p>
          </div>
        </div>
      )}
      {(pub.state === 'confirm' || pub.state === 'conflict' || pub.state === 'error') && (
        <div className="ad-sheet" role="dialog" aria-modal="true" aria-label="Publish">
          <div className="ad-card">
            {pub.state === 'error' && (
              <>
                <h2>That did not work</h2>
                <p className="ad-error" role="alert">
                  {pub.message}
                </p>
                <div className="ad-actions">
                  <button type="button" className="btn" onClick={() => setPub({ state: 'idle' })}>
                    Close
                  </button>
                </div>
              </>
            )}
            {pub.state === 'conflict' && (
              <>
                <h2>The site changed in the meantime</h2>
                <p>{pub.message}</p>
                <p className="ad-help">Loading the latest version discards what you changed here. Publishing anyway replaces the newer content with yours.</p>
                <div className="ad-actions">
                  <button type="button" className="btn" onClick={() => setPub({ state: 'idle' })}>
                    Cancel
                  </button>
                  <button type="button" className="btn" onClick={reload}>
                    Load the latest
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => publish(true)}>
                    Publish mine anyway
                  </button>
                </div>
              </>
            )}
            {pub.state === 'confirm' && (
              <>
                <h2>Publish these changes?</h2>
                {problems.length > 0 ? (
                  <>
                    <p>Fix these first:</p>
                    <ul className="ad-problems">
                      {problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    <div className="ad-actions">
                      <button type="button" className="btn" onClick={() => setPub({ state: 'idle' })}>
                        Back to editing
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      This saves one commit to <b>{REPO}</b>. The live site rebuilds itself and updates about a minute later.
                    </p>
                    <label className="ad-label" htmlFor="ad-message">
                      Note for the history
                    </label>
                    <input id="ad-message" className="ad-input" type="text" value={message} placeholder={defaultMessage} onChange={(e) => setMessage(e.target.value)} />
                    <div className="ad-actions">
                      <button type="button" className="btn" onClick={() => setPub({ state: 'idle' })}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => publish(false)}>
                        Publish now
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {(deployText || notice) && (
        <div className="ad-banner" data-tone={deployTone || undefined} role="status">
          <span>{deployText || notice}</span>
          {deploy?.url && (
            <a href={deploy.url} target="_blank" rel="noopener noreferrer">
              View the build
            </a>
          )}
          {deploy?.status === 'completed' && deploy.conclusion === 'success' && (
            <a href={BASE} target="_blank" rel="noopener">
              Open the site
            </a>
          )}
          <button
            type="button"
            className="ad-link"
            onClick={() => {
              setDeploy(null);
              setNotice('');
              clearTimeout(deployTimer.current);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <nav className="ad-nav" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" aria-current={section === s.id ? 'true' : undefined} onClick={() => setSection(s.id)}>
            {s.label}
            {(s.path.length ? [s.path[0]] : s.fields.map((f) => f.key)).some((k) => changed.includes(LABELS[k] ?? '')) && <i aria-label="changed" />}
          </button>
        ))}
        <button type="button" aria-current={section === 'notes' ? 'true' : undefined} onClick={() => setSection('notes')}>
          Notes
          {(changed.includes('notes') || pendingBodies.length > 0) && <i aria-label="changed" />}
        </button>
        <button type="button" aria-current={section === 'backup' ? 'true' : undefined} onClick={() => setSection('backup')}>
          Backup & history
        </button>
      </nav>

      <main className="ad-form">
        {active && (
          <>
            <h1>{active.label}</h1>
            <p className="ad-hint">{active.hint}</p>
            <Fields fields={active.fields} value={getIn(draft, active.path)} onChange={(next) => setDraft((d) => setIn(d, active.path, next))} ctx={ctx} />
          </>
        )}
        {section === 'notes' && (
          <>
            <h1>Notes</h1>
            <p className="ad-hint">Write-ups with their own pages. Good for search traffic: each one is a page people can find and share.</p>
            <Notes
              content={draft}
              onChange={setDraft}
              ctx={ctx}
              selected={note}
              onSelect={setNote}
              body={noteBody}
              bodyFailed={bodyError === note}
              onRetry={() => {
                setBodyError(null);
                setBodyRetry((n) => n + 1);
              }}
              onBody={(slug, text) => {
                setBodies((b) => ({ ...b, [slug]: text }));
                setDirtyBodies((d) => (d.includes(slug) ? d : [...d, slug]));
              }}
              onDelete={(slug) => {
                setDraft((d) => ({ ...d, writing: { ...d.writing, posts: d.writing.posts.filter((p) => p.slug !== slug) } }));
                setRemoved((r) => (r.includes(slug) ? r : [...r, slug]));
                setNote(null);
              }}
            />
          </>
        )}
        {section === 'backup' && (
          <>
            <h1>Backup & history</h1>
            <p className="ad-hint">Every publish is a commit, so nothing is ever really lost.</p>
            <div className="ad-fields">
              <div className="ad-field">
                <span className="ad-label">History</span>
                <p className="ad-help">See every past version of the content, who changed it and when. Any version can be brought back from there.</p>
                <a className="ad-btn" href={`https://github.com/${REPO}/commits/${BRANCH}/${CONTENT_PATH}`} target="_blank" rel="noopener noreferrer">
                  Open the history on GitHub
                </a>
              </div>
              <div className="ad-field">
                <span className="ad-label">Backup file</span>
                <p className="ad-help">Download everything in the editor right now as one file, or load a file you downloaded earlier.</p>
                <div className="ad-actions ad-actions-left">
                  <button type="button" className="ad-btn" onClick={download}>
                    Download a backup
                  </button>
                  <label className="ad-btn">
                    Load a backup file
                    <input type="file" accept="application/json,.json" hidden onChange={(e) => restoreFile(e.target.files?.[0])} />
                  </label>
                </div>
              </div>
              <div className="ad-field">
                <span className="ad-label">Start over</span>
                <p className="ad-help">Throw away what is in the editor and load what is on GitHub now.</p>
                <button type="button" className="ad-btn" onClick={reload}>
                  Reload from GitHub
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      <aside className="ad-preview" aria-label="Preview">
        <div className="ad-preview-bar">
          <span className="eyebrow">{showNotePreview ? 'Note preview' : 'Live preview · not yet published'}</span>
          {!showNotePreview && (
            <span className="ad-viewtabs" role="group" aria-label="Preview size">
              <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
                Desktop
              </button>
              <button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
                Phone
              </button>
            </span>
          )}
        </div>
        {showNotePreview ? (
          <div className="ad-note-preview">
            <article className="prose" dangerouslySetInnerHTML={{ __html: notePreview || '<p class="muted">Nothing to preview yet.</p>' }} />
          </div>
        ) : (
          <Preview content={previewContent} target={target} device={device} />
        )}
      </aside>
    </div>
  );
}

// ---------- shell: sign-in gate ----------

export function AdminApp() {
  const [phase, setPhase] = useState<'boot' | 'signin' | 'editor'>('boot');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<{ cfg: GitHubConfig; viewer: Viewer; loaded: Loaded } | null>(null);

  // `typed` is true when the owner has just entered the token, false when it is being restored for this tab.
  const open = useCallback(async (token: string, typed: boolean) => {
    setBusy(true);
    setError('');
    try {
      const { cfg, viewer } = await connect(token);
      const file = await readFile(cfg, CONTENT_PATH);
      if (!file) throw new Error(`${CONTENT_PATH} was not found on the ${BRANCH} branch of ${REPO}.`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(file.text);
      } catch {
        throw new Error(`${CONTENT_PATH} in the repository is not valid JSON. Fix it on GitHub, or restore an earlier version from its history.`);
      }
      if (typed) saveToken(token);
      setSession({ cfg, viewer, loaded: { content: normalize(parsed, bundled), sha: file.sha } });
      setPhase('editor');
    } catch (e) {
      const expired = e instanceof GitHubError && e.status === 401;
      if (!typed && expired) clearToken();
      // A restored token that has simply expired just returns to the sign-in form, without an alarming message.
      setError(!typed && expired ? '' : e instanceof Error ? e.message : 'Sign-in failed.');
      setPhase('signin');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const token = loadToken();
    if (token) void open(token, false);
    else setPhase('signin');
  }, [open]);

  if (phase === 'boot') {
    return (
      <main className="ad-signin">
        <p className="ad-empty">Opening the editor…</p>
      </main>
    );
  }
  if (phase === 'signin' || !session) return <SignIn onToken={(t) => open(t, true)} busy={busy} error={error} />;
  return (
    <Editor
      key={session.loaded.sha}
      cfg={session.cfg}
      viewer={session.viewer}
      initial={session.loaded}
      onSignOut={() => {
        clearToken();
        setSession(null);
        setError('');
        setPhase('signin');
      }}
    />
  );
}
