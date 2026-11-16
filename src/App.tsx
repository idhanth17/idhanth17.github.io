import { useEffect, useRef, useState } from 'react';
import { About, Contact, Skills, Writing } from './components/About';
import { Brief } from './components/Brief';
import { CasePage, NotFound } from './components/CasePage';
import { Hero } from './components/Hero';
import { Palette } from './components/Palette';
import { PostPage } from './components/PostPage';
import { Projects } from './components/Projects';
import { Footer, Nav, Toasts } from './components/Shell';
import { Work, pad2 } from './components/Work';
import { ContentContext, useContent } from './lib/content';
import { titleFor } from './lib/head';
import { Router, useRoute } from './lib/router';
import { publishedPosts, type Route } from './lib/site';
import { prefersReducedMotion, setPaletteOpen } from './lib/state';
import type { SiteContent } from './lib/types';

/** Fade sections in as they scroll into view. Without JavaScript everything is simply visible. */
function useReveal(route: Route, content: SiteContent) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-in])'));
    if (els.length === 0) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window) || document.documentElement.classList.contains('is-preview')) {
      els.forEach((el) => el.setAttribute('data-in', ''));
      return;
    }
    // Anything already on screen stays put; only what is below the fold animates in.
    const limit = innerHeight * 0.96;
    for (const el of els) if (el.getBoundingClientRect().top < limit) el.setAttribute('data-in', '');
    document.documentElement.classList.add('reveal-on');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute('data-in', '');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -7% 0px', threshold: 0.04 },
    );
    els.forEach((el) => !el.hasAttribute('data-in') && io.observe(el));
    return () => io.disconnect();
  }, [route, content]);
}

/**
 * Cards marked data-tilt lean toward the pointer in 3D and catch a moving highlight.
 * One listener for the whole page; only for real mice, and never with reduced motion.
 */
function useTilt() {
  useEffect(() => {
    if (prefersReducedMotion() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let current: HTMLElement | null = null;
    let raf = 0;
    let x = 0;
    let y = 0;
    const release = (el: HTMLElement) => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.removeAttribute('data-tilting');
    };
    const apply = () => {
      raf = 0;
      if (!current) return;
      const r = current.getBoundingClientRect();
      const px = (x - r.left) / r.width;
      const py = (y - r.top) / r.height;
      const max = Math.min(7, 2200 / Math.max(r.width, 240)); // big cards lean less
      current.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      current.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      current.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      current.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      current.setAttribute('data-tilting', '');
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tilt]') as HTMLElement | null;
      if (el !== current) {
        if (current) release(current);
        current = el;
      }
      if (!current) return;
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (current) release(current);
      current = null;
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
}

function Home() {
  const c = useContent();
  let i = 0;
  const no = () => pad2(++i);
  return (
    <main id="main" tabIndex={-1}>
      <Hero />
      <Brief />
      <Work no={no()} />
      <Projects no={no()} />
      <Skills no={no()} />
      <About no={no()} />
      {publishedPosts(c).length > 0 && <Writing no={no()} />}
      <Contact />
    </main>
  );
}

function Page({ initialPostHtml }: { initialPostHtml: string | null }) {
  const route = useRoute();
  const c = useContent();
  // The prerendered note body is only valid for the page we booted on.
  const [bootRoute] = useState(route);
  const [announce, setAnnounce] = useState('');
  const first = useRef(true);
  useReveal(route, c);
  useTilt();

  const title = titleFor(route, c);
  useEffect(() => {
    document.title = title;
    // Tell screen readers when the page changes without a full load (but not on the first one).
    if (first.current) first.current = false;
    else setAnnounce(title);
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      {route.name === 'home' && <Home />}
      {route.name === 'case' && <CasePage key={route.id} id={route.id} />}
      {route.name === 'post' && (
        <PostPage
          key={route.slug}
          slug={route.slug}
          initialHtml={bootRoute.name === 'post' && bootRoute.slug === route.slug ? initialPostHtml : null}
        />
      )}
      {route.name === 'notfound' && <NotFound />}
      <Footer />
      <Palette />
      <Toasts />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  );
}

export interface AppProps {
  content: SiteContent;
  /** Pathname relative to the site base, e.g. "" or "work/zealot/". */
  initialRel: string;
  initialPostHtml: string | null;
}

export function App({ content: initial, initialRel, initialPostHtml }: AppProps) {
  const [content, setContent] = useState(initial);

  // Live preview: the owner's editor (same origin, /admin/) can push unsaved content
  // into this page inside an iframe. Nothing else can reach this code path.
  useEffect(() => {
    if (window.parent === window || !new URLSearchParams(location.search).has('preview')) return;
    document.documentElement.classList.add('is-preview');
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const data = e.data as { type?: string; content?: SiteContent; target?: string } | null;
      if (data?.type === 'ik:preview' && data.content) setContent(data.content);
      if (data?.type === 'ik:preview-goto' && data.target) {
        document.getElementById(data.target)?.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    };
    addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'ik:preview-ready' }, location.origin);
    return () => removeEventListener('message', onMessage);
  }, []);

  return (
    <ContentContext.Provider value={content}>
      <Router initialRel={initialRel}>
        <Page initialPostHtml={initialPostHtml} />
      </Router>
    </ContentContext.Provider>
  );
}
