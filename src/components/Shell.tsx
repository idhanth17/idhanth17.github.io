import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useContent } from '../lib/content';
import { useRoute } from '../lib/router';
import { href, publishedPosts } from '../lib/site';
import { setLens, setPaletteOpen, setTheme, toast, useLens, useTheme, useToasts } from '../lib/state';
import { LENSES, LENS_LABEL, type Lens } from '../lib/types';
import { Icon } from './Icons';

export interface NavSection {
  id: string;
  label: string;
}

export function useNavSections(): NavSection[] {
  const c = useContent();
  const list: NavSection[] = [{ id: 'work', label: 'Work' }];
  list.push({ id: 'projects', label: 'Projects' }, { id: 'skills', label: 'Skills' }, { id: 'about', label: 'About' });
  if (publishedPosts(c).length > 0) list.push({ id: 'notes', label: 'Notes' });
  list.push({ id: 'contact', label: 'Contact' });
  return list;
}

const LENS_NOTE: Record<Lens, string> = {
  recruiter: 'Reading as a recruiter: outcomes and numbers first.',
  engineer: 'Reading as an engineer: the deep version.',
  friend: 'Reading as a friend: the human version.',
};

/** A radio group: Tab reaches the selected option, the arrow keys move between options. */
export function LensSwitch({ compact = false, label = 'Who is reading?', onPick }: { compact?: boolean; label?: string; onPick?: (lens: Lens) => void }) {
  const lens = useLens();
  const pick = (l: Lens) => {
    setLens(l);
    if (onPick) onPick(l);
    else toast(LENS_NOTE[l]);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? LENSES.length - 1 : step ? (LENSES.indexOf(lens) + step + LENSES.length) % LENSES.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setLens(LENSES[to]);
    toast(LENS_NOTE[LENSES[to]]);
    e.currentTarget.querySelector<HTMLElement>(`[data-lens-btn="${LENSES[to]}"]`)?.focus();
  };
  return (
    <div className={'lens-switch' + (compact ? ' is-compact' : '')} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {LENSES.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lens === l} tabIndex={lens === l ? 0 : -1} data-lens-btn={l} className="lens-btn" onClick={() => pick(l)}>
          {LENS_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="icon-btn theme-toggle" aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
      <span className="theme-sun">
        <Icon name="sun" />
      </span>
      <span className="theme-moon">
        <Icon name="moon" />
      </span>
    </button>
  );
}

export function Nav() {
  const c = useContent();
  const route = useRoute();
  const sections = useNavSections();
  const [active, setActive] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const isHome = route.name === 'home';

  // Scroll progress + "scrolled" state are written straight to the DOM: no re-render per frame.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      el.style.setProperty('--progress', max > 0 ? String(Math.min(1, scrollY / max)) : '0');
      el.toggleAttribute('data-scrolled', scrollY > 12);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [route]);

  // Highlight the section currently under the top third of the viewport.
  useEffect(() => {
    if (!isHome) {
      setActive(route.name === 'case' ? 'work' : route.name === 'post' ? 'notes' : '');
      return;
    }
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    const clearAtTop = () => {
      if (scrollY < 200) setActive('');
    };
    addEventListener('scroll', clearAtTop, { passive: true });
    return () => {
      io.disconnect();
      removeEventListener('scroll', clearAtTop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHome, route.name, sections.map((s) => s.id).join()]);

  // The mobile menu closes on Escape (handing focus back to its button) and on a click outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      menuBtn.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onDown);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const initials = c.profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="nav" ref={ref} data-open={open || undefined}>
      <div className="nav-inner wrap">
        <a className="brand" href={href('/')} aria-label={`${c.profile.name}, home`} onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            {initials}
          </span>
          <span className="brand-name">{c.profile.name}</span>
        </a>
        {/* In the markup the menu button comes right before the links it opens, so Tab moves from one into the other. */}
        <button ref={menuBtn} type="button" className="icon-btn nav-menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
        <nav className="nav-links" id="nav-links" aria-label="Sections">
          {sections.map((s) => (
            <a key={s.id} href={href('#' + s.id)} aria-current={active === s.id ? 'true' : undefined} onClick={() => setOpen(false)}>
              {s.label}
            </a>
          ))}
          <div className="nav-sheet-lens">
            <span className="eyebrow">Reading as</span>
            <LensSwitch compact label="Reading as" />
          </div>
        </nav>
        <div className="nav-tools">
          <LensSwitch compact label="Reading as" />
          <button type="button" className="icon-btn kbd-btn" aria-label="Open command palette" title="Search and commands (Ctrl K)" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={16} />
            <kbd>Ctrl K</kbd>
          </button>
          <ThemeToggle />
        </div>
      </div>
      <span className="nav-progress" aria-hidden="true" />
    </header>
  );
}

interface PageStats {
  ms: number;
  kb: number;
}

function usePageStats(): PageStats | null {
  const [stats, setStats] = useState<PageStats | null>(null);
  useEffect(() => {
    const read = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!nav) return;
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const bytes = (nav.transferSize || 0) + resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
      const ms = Math.round(nav.loadEventEnd > 0 ? nav.loadEventEnd : nav.domContentLoadedEventEnd);
      if (ms > 0) setStats({ ms, kb: Math.round(bytes / 1024) });
    };
    if (document.readyState === 'complete') {
      const t = setTimeout(read, 300);
      return () => clearTimeout(t);
    }
    const onLoad = () => setTimeout(read, 300);
    addEventListener('load', onLoad, { once: true });
    return () => removeEventListener('load', onLoad);
  }, []);
  return stats;
}

export function Footer() {
  const c = useContent();
  const stats = usePageStats();
  const year = new Date().getFullYear();
  const tracked = c.meta.goatcounter.trim() !== '';
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div>
          <p className="footer-name">
            © <span suppressHydrationWarning>{year}</span> {c.profile.name}
          </p>
          <p className="footer-note">{c.footer.note}</p>
        </div>
        <p className="footer-stats">
          {stats ? (
            <>
              This page loaded in <b>{stats.ms.toLocaleString('en-US')} ms</b> on your device
              {stats.kb > 0 ? (
                <>
                  , <b>{stats.kb.toLocaleString('en-US')} kB</b> over the wire
                </>
              ) : (
                <>, straight from your cache</>
              )}
              {tracked ? '.' : ', zero trackers.'} Yes, I measured.
            </>
          ) : (
            <>Measuring this page…</>
          )}
        </p>
        <p className="footer-links">
          {/^[\w.-]+\/[\w.-]+$/.test(c.meta.repo) && (
            <a href={`https://github.com/${c.meta.repo}`} target="_blank" rel="noopener noreferrer">
              Source
            </a>
          )}
          <a href={href('/admin/')} target="_blank" rel="nofollow noopener">
            Owner login
          </a>
          {/* A bare "#" is the top of whichever page this is. */}
          <a href="#">Back to top ↑</a>
        </p>
      </div>
    </footer>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
