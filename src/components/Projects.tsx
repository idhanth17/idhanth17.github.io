import { useEffect, useRef, useState } from 'react';
import { useContent } from '../lib/content';
import { inline } from '../lib/inline';
import { href, projectTags, seeded } from '../lib/site';
import type { Project } from '../lib/types';
import { Icon } from './Icons';
import { Scene3D } from './Scene3D';
import { SectionHead } from './Work';

/** Drawn cover art: unique per project, identical on server and client. Also the still behind a 3D emblem. */
function ProjectCover({ seed, variant }: { seed: string; variant: number }) {
  const rnd = seeded(seed);
  const kind = variant % 4; // neighbouring cards never share a pattern
  const W = 320;
  const H = 150;
  const f = (n: number) => n.toFixed(1);
  let art;
  if (kind === 0) {
    // Stepped traces
    const line = (yBase: number) => {
      let x = 0;
      let y = yBase;
      let d = `M0 ${f(y)}`;
      while (x < W) {
        x += 14 + rnd() * 30;
        d += ` H${f(Math.min(W, x))}`;
        y = Math.max(14, Math.min(H - 14, y + (rnd() - 0.5) * 46));
        d += ` V${f(y)}`;
      }
      return d;
    };
    art = (
      <>
        <path className="cover-ink" d={line(48)} />
        <path className="cover-ink" d={line(96)} />
        <path className="cover-accent" d={line(72)} />
      </>
    );
  } else if (kind === 1) {
    // Dot matrix
    const dots = [];
    const hot = Math.floor(rnd() * 16 * 6);
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 16; c++) {
        const i = r * 16 + c;
        dots.push(<circle key={i} className={i === hot || rnd() > 0.93 ? 'cover-accent-fill' : 'cover-ink-fill'} cx={f(20 + c * 18.7)} cy={f(22 + r * 21)} r={f(1.4 + rnd() * 3.4)} />);
      }
    art = dots;
  } else if (kind === 2) {
    // Histogram
    const bars = [];
    const hot = Math.floor(rnd() * 26);
    for (let i = 0; i < 26; i++) {
      const h = 14 + rnd() * 104;
      bars.push(<rect key={i} className={i === hot ? 'cover-accent-fill' : 'cover-ink-fill'} x={f(12 + i * 11.5)} y={f(H - 14 - h)} width="6.5" height={f(h)} rx="1.5" />);
    }
    art = bars;
  } else {
    // Rings
    const cx = rnd() > 0.5 ? W * 0.2 : W * 0.8;
    const cy = rnd() > 0.5 ? H * 0.15 : H * 0.85;
    const hot = 2 + Math.floor(rnd() * 5);
    art = Array.from({ length: 9 }, (_, i) => <circle key={i} className={i === hot ? 'cover-accent' : 'cover-ink'} cx={f(cx)} cy={f(cy)} r={f(18 + i * 24)} />);
  }
  return (
    <svg className="cover-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {art}
    </svg>
  );
}

function Links({ p }: { p: Project }) {
  return (
    <footer className="proj-links">
      {p.live && (
        <a href={href(p.live)} target="_blank" rel="noopener noreferrer">
          Live <Icon name="arrowUpRight" size={15} />
        </a>
      )}
      {p.repo && (
        <a href={href(p.repo)} target="_blank" rel="noopener noreferrer">
          Code <Icon name="arrowUpRight" size={15} />
        </a>
      )}
      {p.status && <span className="proj-status">{p.status}</span>}
    </footer>
  );
}

function ProjectCard({ p, index, hidden }: { p: Project; index: number; hidden: boolean }) {
  return (
    <article className="proj" id={`project-${p.id}`} hidden={hidden} data-reveal data-tilt>
      <div className="proj-cover">
        {p.image ? (
          <img src={href(p.image)} alt="" loading="lazy" />
        ) : p.emblem ? (
          <Scene3D name={p.emblem} className="proj-scene">
            <ProjectCover seed={p.id} variant={index} />
          </Scene3D>
        ) : (
          <ProjectCover seed={p.id} variant={index} />
        )}
        {p.statValue && (
          <p className="proj-stat">
            <b>{p.statValue}</b>
            <span>{p.statLabel}</span>
          </p>
        )}
      </div>
      <div className="proj-body">
        <header className="proj-head">
          <h3>{p.title}</h3>
          <span className="proj-year">{p.year}</span>
        </header>
        <p className="proj-tagline">{p.tagline}</p>
        <p className="proj-desc" data-lens-hide="recruiter">
          {inline(p.description)}
        </p>
        {p.highlights.length > 0 && (
          <ul className="bullets proj-highlights" data-lens-hide="friend">
            {p.highlights.map((h, i) => (
              <li key={i}>{inline(h)}</li>
            ))}
          </ul>
        )}
        <ul className="chips" aria-label="Stack">
          {p.stack.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <Links p={p} />
      </div>
    </article>
  );
}

function ArchiveRow({ p, hidden }: { p: Project; hidden: boolean }) {
  return (
    <li hidden={hidden}>
      <details className="arow" id={`project-${p.id}`}>
        <summary>
          <span className="arow-year">{p.year}</span>
          <span className="arow-title">{p.title}</span>
          <span className="arow-tagline">{p.tagline}</span>
          <span className="arow-stack">{p.stack.slice(0, 3).join(' · ')}</span>
          <span className="arow-toggle" aria-hidden="true">
            <Icon name="plus" size={16} />
          </span>
        </summary>
        <div className="arow-body">
          <p>{inline(p.description)}</p>
          <Links p={p} />
        </div>
      </details>
    </li>
  );
}

interface Repo {
  name: string;
  url: string;
  language: string | null;
  pushed: string;
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years <= 1 ? 'a year ago' : `${years} years ago`;
}

/** Fetched in the visitor's browser when the section scrolls near, so it is always current. */
function GithubFeed() {
  const c = useContent();
  const gh = c.profile.links.find((l) => l.kind === 'github');
  const user = gh ? /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/.exec(gh.url.trim())?.[1] : undefined;
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!user || !el) return;
    let cancelled = false;
    const load = async () => {
      try {
        const cached = sessionStorage.getItem('ik:gh:' + user);
        if (cached) {
          setRepos(JSON.parse(cached));
          return;
        }
      } catch {
        /* no session storage */
      }
      try {
        const res = await fetch(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=10`, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: Array<{ name: string; html_url: string; language: string | null; pushed_at: string; fork: boolean }> = await res.json();
        const list = data
          .filter((r) => !r.fork)
          .slice(0, 5)
          .map((r) => ({ name: r.name, url: r.html_url, language: r.language, pushed: r.pushed_at }));
        if (cancelled) return;
        setRepos(list);
        try {
          sessionStorage.setItem('ik:gh:' + user, JSON.stringify(list));
        } catch {
          /* ignore */
        }
      } catch {
        if (!cancelled) setRepos([]);
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        void load();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [user]);

  if (!user || !gh) return null;
  return (
    <div className="ghfeed" ref={ref} data-reveal>
      <p className="eyebrow">
        <i className="live-dot" aria-hidden="true" /> Live from GitHub · recently pushed
      </p>
      {repos === null ? (
        <p className="muted">Checking github.com/{user}…</p>
      ) : repos.length === 0 ? (
        <p className="muted">
          GitHub didn't answer just now.{' '}
          <a href={href(gh.url)} target="_blank" rel="noopener noreferrer">
            See github.com/{user}
          </a>
        </p>
      ) : (
        <ul className="ghfeed-list">
          {repos.map((r) => (
            <li key={r.name}>
              <a href={href(r.url)} target="_blank" rel="noopener noreferrer">
                <b>{r.name}</b>
                <span>{r.language ?? '—'}</span>
                <time dateTime={r.pushed}>{ago(r.pushed)}</time>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Projects({ no }: { no: string }) {
  const c = useContent();
  const items = c.projects.items;
  const tags = projectTags(items);
  const [tag, setTag] = useState('All');
  const active = tag === 'All' || tags.includes(tag) ? tag : 'All';
  const match = (p: Project) => active === 'All' || p.tags.includes(active);
  const featured = items.filter((p) => p.featured);
  const archive = items.filter((p) => !p.featured);
  const shown = items.filter(match).length;

  // A link to a project that the filter is hiding clears the filter first (see scrollToHash).
  useEffect(() => {
    const showAll = () => setTag('All');
    addEventListener('ik:reveal', showAll);
    return () => removeEventListener('ik:reveal', showAll);
  }, []);

  return (
    <section className="section" id="projects" aria-labelledby="projects-title">
      <div className="wrap">
        <SectionHead no={no} id="projects-title" title={c.projects.title} intro={c.projects.intro} />
        {tags.length > 1 && (
          <div className="filters" role="group" aria-label="Filter projects by area" data-reveal>
            {['All', ...tags].map((t) => (
              <button key={t} type="button" className="filter" aria-pressed={active === t} onClick={() => setTag(t)}>
                {t}
                <span className="filter-count">{t === 'All' ? items.length : items.filter((p) => p.tags.includes(t)).length}</span>
              </button>
            ))}
            <span className="filters-status" role="status">
              Showing {shown} of {items.length}
            </span>
          </div>
        )}
        <div className="proj-grid">
          {featured.map((p, i) => (
            <ProjectCard key={p.id} p={p} index={i} hidden={!match(p)} />
          ))}
        </div>
        {archive.length > 0 && (
          <div className="archive" data-reveal hidden={!archive.some(match)}>
            <h3 className="sub-title">The archive</h3>
            <ul className="archive-list">
              {archive.map((p) => (
                <ArchiveRow key={p.id} p={p} hidden={!match(p)} />
              ))}
            </ul>
          </div>
        )}
        {c.projects.showGithubFeed && <GithubFeed />}
      </div>
    </section>
  );
}
