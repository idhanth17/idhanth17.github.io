import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { BASE, parseRoute, stripBase, type Route } from './site';
import { prefersReducedMotion } from './state';

// A very small client router. Every route is also prerendered to its own HTML file,
// so deep links, refreshes and crawlers all get real pages; this only makes moving
// between them instant.

interface Loc {
  rel: string; // pathname relative to BASE
  hash: string; // without the leading "#"
  key: number; // changes on every navigation
  pop: boolean; // true when the navigation came from back/forward
  y: number; // scroll position to restore after back/forward
}

const RouterContext = createContext<{ loc: Loc; route: Route } | null>(null);

export function useRoute(): Route {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRoute outside Router');
  return ctx.route;
}

let navigateImpl: (to: string) => void = (to) => {
  location.href = to;
};

/** Navigate to a site URL (path + optional hash). Falls back to a normal page load outside the app. */
export function navigate(to: string) {
  navigateImpl(to);
}

/** A hash someone mangled ("#%") must not take the page down. */
function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function isAppPath(pathname: string): boolean {
  if (!pathname.startsWith(BASE)) return false;
  const rel = pathname.slice(BASE.length);
  return rel === '' || /^(work|notes)\/[^/.]+\/?$/.test(rel);
}

/** Each history entry remembers its own scroll position, so back/forward lands where you were (even after a reload). */
function rememberScroll() {
  try {
    history.replaceState({ ...(history.state || {}), y: Math.round(scrollY) }, '');
  } catch {
    /* some embedded contexts forbid it; scroll restoration is a nicety */
  }
}

export function Router({ initialRel, children }: { initialRel: string; children: ReactNode }) {
  const [loc, setLoc] = useState<Loc>({ rel: initialRel, hash: '', key: 0, pop: false, y: 0 });
  const keyRef = useRef(0);

  useEffect(() => {
    history.scrollRestoration = 'manual';

    const go = (next: Omit<Loc, 'key'>) => {
      keyRef.current += 1;
      const value = { ...next, key: keyRef.current };
      const apply = () => flushSync(() => setLoc(value));
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      // A page that is not being painted would stall inside a view transition.
      if (doc.startViewTransition && !prefersReducedMotion() && document.visibilityState === 'visible') doc.startViewTransition(apply);
      else apply();
    };

    navigateImpl = (to) => {
      const url = new URL(to, location.href);
      if (url.origin !== location.origin || !isAppPath(url.pathname)) {
        location.href = url.href;
        return;
      }
      const hash = decodeHash(url.hash.slice(1));
      if (url.pathname === location.pathname) {
        // Same page: only the scroll target changes.
        history.replaceState(history.state, '', url);
        scrollToHash(hash, true);
        return;
      }
      rememberScroll();
      history.pushState({ y: 0 }, '', url);
      go({ rel: stripBase(url.pathname), hash, pop: false, y: 0 });
      (window as unknown as { goatcounter?: { count?: (o: object) => void } }).goatcounter?.count?.({ path: url.pathname });
    };

    const onPop = () => {
      const y = typeof history.state?.y === 'number' ? history.state.y : 0;
      go({ rel: stripBase(location.pathname), hash: decodeHash(location.hash.slice(1)), pop: true, y });
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !isAppPath(url.pathname)) return;
      e.preventDefault();
      navigateImpl(url.href);
    };

    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(rememberScroll, 140);
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // After a navigation renders: restore the old position (back/forward), jump to the
  // hash target, or start at the top and hand keyboard focus to the new page.
  useLayoutEffect(() => {
    if (loc.key === 0) {
      // First paint: honour a hash in the address bar, but leave focus alone as browsers do.
      if (location.hash.length > 1) scrollToHash(decodeHash(location.hash.slice(1)), false, false);
      return;
    }
    if (loc.pop) window.scrollTo(0, loc.y);
    else if (loc.hash) scrollToHash(loc.hash, false);
    else {
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus({ preventScroll: true });
    }
  }, [loc]);

  return <RouterContext.Provider value={{ loc, route: parseRoute(loc.rel) }}>{children}</RouterContext.Provider>;
}

const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]';

/**
 * Scroll to the element with this id and move keyboard focus there too, the way a
 * native in-page link would. An empty hash means the top of the page.
 */
export function scrollToHash(hash: string, smooth: boolean, focus = true, retried = false) {
  const behavior: ScrollBehavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
  if (!hash) {
    window.scrollTo({ top: 0, behavior });
    if (focus) document.querySelector<HTMLElement>('.brand')?.focus({ preventScroll: true });
    return;
  }
  const el = document.getElementById(hash);
  if (!el) return;
  if (el.closest('[hidden]') && !retried) {
    // For example a project the filter is hiding: ask the page to show it, then try once more.
    window.dispatchEvent(new CustomEvent('ik:reveal', { detail: hash }));
    setTimeout(() => scrollToHash(hash, smooth, focus, true), 60);
    return;
  }
  // An archived project lives inside a <details>; open it so the target is visible.
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior, block: 'start' });
  if (el.matches('.proj, .arow, .story, .common')) {
    el.classList.remove('is-target');
    void el.offsetWidth;
    el.classList.add('is-target');
  }
  if (focus) {
    const target = el instanceof HTMLDetailsElement ? (el.querySelector<HTMLElement>('summary') ?? el) : el;
    if (!target.matches(FOCUSABLE)) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}
