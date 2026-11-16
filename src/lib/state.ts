import { useSyncExternalStore } from 'react';
import { LENSES, type Lens } from './types';

// Lens and theme live on <html> as data attributes. A tiny inline script in index.html
// sets them before first paint, so there is no flash; React just mirrors them.

type Listener = () => void;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

const isBrowser = typeof document !== 'undefined';
const root = isBrowser ? document.documentElement : null;

function readLens(): Lens {
  const v = root?.dataset.lens as Lens | undefined;
  return v && LENSES.includes(v) ? v : 'recruiter';
}

export type Theme = 'light' | 'dark';

function readTheme(): Theme {
  return root?.dataset.theme === 'dark' ? 'dark' : 'light';
}

const lensStore = createStore<Lens>(readLens());
const themeStore = createStore<Theme>(readTheme());

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice simply lasts for this page view */
  }
}

export function setLens(lens: Lens) {
  if (!root) return;
  root.dataset.lens = lens;
  remember('ik:lens', lens);
  // A manual choice replaces any ?as= in the address bar.
  const url = new URL(location.href);
  if (url.searchParams.has('as')) {
    url.searchParams.delete('as');
    history.replaceState(history.state, '', url);
  }
  lensStore.set(lens);
}

export function useLens(): Lens {
  return useSyncExternalStore(lensStore.subscribe, lensStore.get, () => 'recruiter');
}

const THEME_COLOR: Record<Theme, string> = { light: '#f4f0e6', dark: '#121210' };

export function setTheme(theme: Theme) {
  if (!root) return;
  root.dataset.theme = theme;
  remember('ik:theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  themeStore.set(theme);
}

export function useTheme(): Theme {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get, () => 'light');
}

// ---- toasts -------------------------------------------------------------

export interface Toast {
  id: number;
  text: string;
}

const toastStore = createStore<Toast[]>([]);
let toastId = 0;

export function toast(text: string, ms = 2600) {
  const id = ++toastId;
  toastStore.set([...toastStore.get(), { id, text }]);
  setTimeout(() => toastStore.set(toastStore.get().filter((t) => t.id !== id)), ms);
}

const NO_TOASTS: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(toastStore.subscribe, toastStore.get, () => NO_TOASTS);
}

// ---- command palette ----------------------------------------------------

const paletteStore = createStore(false);

export function setPaletteOpen(open: boolean) {
  paletteStore.set(open);
}

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(paletteStore.subscribe, paletteStore.get, () => false);
}

export function prefersReducedMotion(): boolean {
  return isBrowser && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
