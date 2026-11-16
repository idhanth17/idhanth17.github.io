import { useEffect, useRef, type ReactNode } from 'react';

export interface SceneHandle {
  send(data: unknown): void;
}

interface Props {
  /** Which scene from src/three to run. */
  name: string;
  /** Data for the scene. Read once, when the scene starts. */
  opts?: unknown;
  /** The large hero scene draws straight to its own canvas; everything else shares one renderer. */
  direct?: boolean;
  className?: string;
  /** Called with a handle once the scene is running, and with null when it stops. */
  onReady?: (handle: SceneHandle | null) => void;
  /** Something laid over the scene that stays visible (for example a note the scene moves around). */
  overlay?: ReactNode;
  /** A still picture shown until the scene is running, and kept if 3D is unavailable. */
  children?: ReactNode;
}

/**
 * A 3D scene. The 3D code is not part of the page's first download: it is fetched
 * once the scene is near the screen, and the scene only animates while visible.
 * It is decoration, so it is hidden from assistive technology.
 */
export function Scene3D({ name, opts, direct = false, className = '', onReady, overlay, children }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ opts, onReady });
  latest.current = { opts, onReady };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false;
    let handle: { unmount(): void; send(data: unknown): void } | null = null;
    const start = () => {
      import('../three')
        .then((three) => {
          if (cancelled) return;
          handle = three.mountScene(el, name, latest.current.opts, direct);
          if (handle) latest.current.onReady?.(handle);
        })
        .catch(() => {
          /* the still fallback stays in place */
        });
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        start();
      },
      { rootMargin: '500px' },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      latest.current.onReady?.(null);
      handle?.unmount();
      el.parentElement?.removeAttribute('data-ready');
    };
  }, [name, direct]);

  return (
    <div className={'scene3d ' + className} aria-hidden="true">
      <canvas ref={canvas} />
      {children && <div className="scene3d-still">{children}</div>}
      {overlay}
    </div>
  );
}
