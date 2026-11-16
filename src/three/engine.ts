import { Color, type PerspectiveCamera, type Scene, Vector3, WebGLRenderer } from 'three';

// One small engine drives every 3D piece on the site.
//
// - The hero gets its own WebGL canvas (it is large and always first on screen).
// - Every other piece shares a single hidden WebGL renderer: each is drawn into a
//   corner of that renderer and copied onto its own ordinary 2D canvas. That keeps
//   the page at two WebGL contexts no matter how many 3D pieces it shows.
// - Nothing runs unless it is on screen, and nothing animates for people who have
//   asked their system for reduced motion (they get one still frame).

export interface Theme {
  paper: Color;
  paper2: Color;
  paper3: Color;
  ink: Color;
  ink2: Color;
  ink3: Color;
  accent: Color;
  good: Color;
  dark: boolean;
}

export interface Pointer {
  /** -1 (left / top) to 1 (right / bottom), relative to the piece. Eased toward the real pointer. */
  x: number;
  y: number;
}

export interface SceneCtx {
  /** Live colours. They are updated in place when the theme changes, so materials can hold on to them. */
  theme: Theme;
  reduced: boolean;
  lowPower: boolean;
  /** World position -> CSS pixels inside this piece's canvas. */
  project(world: Vector3, out: { x: number; y: number }): void;
}

export interface SceneDef {
  scene: Scene;
  camera: PerspectiveCamera;
  update(time: number, dt: number, pointer: Pointer): void;
  /** Called before the first frame and whenever the canvas changes size (CSS pixels, plus the pixel ratio in use). */
  resize?(width: number, height: number, pixelRatio: number): void;
  retheme?(): void;
  message?(data: unknown): void;
  dispose(): void;
}

export type SceneFactory<O> = (ctx: SceneCtx, opts: O) => SceneDef;

export interface Handle {
  unmount(): void;
  send(data: unknown): void;
}

interface View {
  el: HTMLCanvasElement;
  renderer: WebGLRenderer | null; // set for a direct (own-canvas) view
  ctx2d: CanvasRenderingContext2D | null; // set for a shared view
  def: SceneDef;
  visible: boolean;
  dirty: boolean;
  ready: boolean;
  cssW: number;
  cssH: number;
  W: number;
  H: number;
  pointer: Pointer;
  target: Pointer;
  io: IntersectionObserver;
  ro: ResizeObserver;
}

const TOKENS: Array<[keyof Omit<Theme, 'dark'>, string]> = [
  ['paper', '--paper'],
  ['paper2', '--paper-2'],
  ['paper3', '--paper-3'],
  ['ink', '--ink'],
  ['ink2', '--ink-2'],
  ['ink3', '--ink-3'],
  ['accent', '--accent'],
  ['good', '--good'],
];

class Engine {
  readonly theme: Theme = {
    paper: new Color(),
    paper2: new Color(),
    paper3: new Color(),
    ink: new Color(),
    ink2: new Color(),
    ink3: new Color(),
    accent: new Color(),
    good: new Color(),
    dark: false,
  };
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly lowPower = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;

  private views = new Set<View>();
  private shared: WebGLRenderer | null | undefined; // undefined = not tried yet, null = unavailable
  private raf = 0;
  private last = 0;
  private scratch = new Vector3();

  constructor() {
    this.readTheme();
    new MutationObserver(() => {
      this.readTheme();
      for (const v of this.views) {
        v.def.retheme?.();
        v.dirty = true;
      }
      this.kick();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    addEventListener(
      'pointermove',
      (e) => {
        for (const v of this.views) {
          if (!v.visible) continue;
          const r = v.el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          v.target.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
          v.target.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
        }
      },
      { passive: true },
    );
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.kick();
    });
  }

  private readTheme() {
    const cs = getComputedStyle(document.documentElement);
    for (const [key, token] of TOKENS) {
      const value = cs.getPropertyValue(token).trim();
      if (/^#[0-9a-f]{3,8}$/i.test(value)) this.theme[key].set(value.slice(0, 7));
    }
    this.theme.dark = document.documentElement.getAttribute('data-theme') === 'dark';
  }

  private sharedRenderer(): WebGLRenderer | null {
    if (this.shared === undefined) {
      try {
        const r = new WebGLRenderer({ antialias: true, alpha: true });
        r.setPixelRatio(1);
        r.setClearColor(0x000000, 0);
        r.setScissorTest(true);
        this.shared = r;
      } catch {
        this.shared = null; // no WebGL here: every piece keeps its still fallback
      }
    }
    return this.shared;
  }

  mount<O>(el: HTMLCanvasElement, factory: SceneFactory<O>, opts: O, direct: boolean): Handle | null {
    let renderer: WebGLRenderer | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    if (direct) {
      try {
        renderer = new WebGLRenderer({ canvas: el, antialias: true, alpha: true, powerPreference: 'default' });
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x000000, 0);
      } catch {
        return null;
      }
    } else {
      if (!this.sharedRenderer()) return null;
      ctx2d = el.getContext('2d');
      if (!ctx2d) return null;
    }

    // The scene is created through a holder so its project() can see the view that owns it.
    const holder: { view: View | null } = { view: null };
    const ctx: SceneCtx = {
      theme: this.theme,
      reduced: this.reduced,
      lowPower: this.lowPower,
      project: (world, out) => {
        const v = holder.view;
        if (!v) return;
        this.scratch.copy(world).project(v.def.camera);
        out.x = (this.scratch.x * 0.5 + 0.5) * v.cssW;
        out.y = (-this.scratch.y * 0.5 + 0.5) * v.cssH;
      },
    };

    let def: SceneDef;
    try {
      def = factory(ctx, opts);
    } catch (e) {
      renderer?.dispose();
      console.error('3D scene failed to start', e);
      return null;
    }

    const view: View = {
      el,
      renderer,
      ctx2d,
      def,
      visible: false,
      dirty: true,
      ready: false,
      cssW: 0,
      cssH: 0,
      W: 0,
      H: 0,
      pointer: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      io: new IntersectionObserver(
        (entries) => {
          view.visible = entries[entries.length - 1].isIntersecting;
          if (view.visible) {
            view.dirty = true;
            this.kick();
          }
        },
        { rootMargin: '120px' },
      ),
      ro: new ResizeObserver(() => {
        view.dirty = true;
        this.kick();
      }),
    };
    holder.view = view;
    view.io.observe(el);
    view.ro.observe(el);
    this.views.add(view);
    this.kick();

    return {
      unmount: () => {
        view.io.disconnect();
        view.ro.disconnect();
        this.views.delete(view);
        try {
          def.dispose();
        } finally {
          renderer?.dispose();
          renderer?.forceContextLoss(); // dispose() alone keeps the WebGL context alive
        }
      },
      send: (data) => {
        def.message?.(data);
        view.dirty = true;
        this.kick();
      },
    };
  }

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const time = now / 1000;
    const dt = this.last ? Math.min(0.05, time - this.last) : 0.016;
    this.last = time;
    let animating = false;
    for (const v of this.views) {
      if (!v.visible) continue;
      if (this.reduced && !v.dirty) continue;
      try {
        this.draw(v, time, this.reduced ? 0 : dt);
      } catch (e) {
        // A broken piece must never take the page down: stop drawing it and keep its fallback.
        console.error('3D scene stopped', e);
        v.visible = false;
        v.io.disconnect();
        continue;
      }
      v.dirty = false;
      if (!this.reduced) animating = true;
    }
    if (animating && document.visibilityState === 'visible') this.kick();
    else this.last = 0;
  };

  private draw(v: View, time: number, dt: number) {
    const cssW = v.el.clientWidth;
    const cssH = v.el.clientHeight;
    if (cssW < 2 || cssH < 2) return;
    const ratio = Math.min(devicePixelRatio || 1, this.lowPower ? 1.5 : 2);
    const W = Math.round(cssW * ratio);
    const H = Math.round(cssH * ratio);
    if (W !== v.W || H !== v.H) {
      v.W = W;
      v.H = H;
      v.cssW = cssW;
      v.cssH = cssH;
      v.def.camera.aspect = cssW / cssH;
      v.def.resize?.(cssW, cssH, ratio);
      v.def.camera.updateProjectionMatrix();
      if (v.renderer) v.renderer.setSize(W, H, false);
      else {
        v.el.width = W;
        v.el.height = H;
      }
    }

    // Ease the pointer so tilts feel weighted rather than twitchy.
    const k = dt > 0 ? Math.min(1, dt * 5) : 1;
    v.pointer.x += (v.target.x - v.pointer.x) * k;
    v.pointer.y += (v.target.y - v.pointer.y) * k;

    v.def.update(time, dt, v.pointer);

    if (v.renderer) {
      v.renderer.render(v.def.scene, v.def.camera);
    } else {
      const r = this.sharedRenderer();
      if (!r || !v.ctx2d) return;
      const gl = r.domElement;
      if (gl.width < W || gl.height < H) r.setSize(Math.max(gl.width, W), Math.max(gl.height, H), false);
      r.setViewport(0, 0, W, H);
      r.setScissor(0, 0, W, H);
      r.render(v.def.scene, v.def.camera);
      v.ctx2d.clearRect(0, 0, W, H);
      // WebGL's origin is the bottom-left corner; a canvas image's is the top-left.
      v.ctx2d.drawImage(gl, 0, gl.height - H, W, H, 0, 0, W, H);
    }

    if (!v.ready) {
      v.ready = true;
      v.el.parentElement?.setAttribute('data-ready', '');
    }
  }
}

let engine: Engine | null = null;

export function getEngine(): Engine {
  if (!engine) engine = new Engine();
  return engine;
}
