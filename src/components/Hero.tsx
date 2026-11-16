import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useContent } from '../lib/content';
import { scrollToHash } from '../lib/router';
import { fmt, href } from '../lib/site';
import { prefersReducedMotion } from '../lib/state';
import { LENSES } from '../lib/types';
import { Icon, linkIcon } from './Icons';
import { Scene3D, type SceneHandle } from './Scene3D';
import { LensSwitch } from './Shell';

/** A hand-drawn pen mark that draws itself in. Purely decorative. */
export function Scribble({ kind }: { kind: 'circle' | 'underline' }) {
  return kind === 'circle' ? (
    <svg className="scribble scribble-circle" viewBox="0 0 220 90" preserveAspectRatio="none" aria-hidden="true">
      <path
        pathLength={1}
        d="M22 54C12 28 64 9 120 10c54 1 90 17 86 41-4 23-55 32-104 30C54 79 15 69 17 47c2-15 26-28 58-33"
      />
    </svg>
  ) : (
    <svg className="scribble scribble-underline" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M3 9c34-6 62 5 98-1s62-5 96 1" />
    </svg>
  );
}

function Headline({ text }: { text: string }) {
  const m = /^(.*?)\*([^*]+)\*(.*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <em className="marked">
        {m[2]}
        <Scribble kind="circle" />
      </em>
      {m[3]}
    </>
  );
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** What stands in for the 3D bottle until it has loaded, and for anyone whose device cannot draw it. */
function BottleStill() {
  return (
    <svg viewBox="0 0 520 300" role="presentation">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M70 92c-18 0-30 26-30 58s12 58 30 58h206c30 0 44-22 70-30l96-6c8 0 8-44 0-44l-96-6c-26-8-40-30-70-30Z" opacity=".55" />
        <ellipse cx="442" cy="150" rx="7" ry="23" opacity=".55" />
        <ellipse cx="394" cy="150" rx="13" ry="34" className="still-mark" />
      </g>
      <g fill="currentColor" opacity=".5">
        {Array.from({ length: 46 }, (_, i) => (
          <circle key={i} cx={72 + ((i * 53) % 250)} cy={112 + ((i * 37) % 78)} r={2 + (i % 3)} />
        ))}
      </g>
    </svg>
  );
}

/** The four headline results. The numbers move with the 3D scene: jammed before the fix, flowing after it. */
function Hud({ t, onPick }: { t: number; onPick: (phase: 0 | 1) => void }) {
  const c = useContent();
  const state = t < 0.02 ? 'Before' : t > 0.98 ? 'After' : 'Fixing';
  return (
    <aside className="hud" aria-label="Measured results, before and after" style={{ '--mix': `${((1 - t) * 100).toFixed(1)}%` } as CSSProperties} data-tilt>
      <header className="hud-head">
        <span className="hud-title">{c.hero.instrumentTitle}</span>
        <span className="hud-switch" role="group" aria-label="Show the numbers before or after the fixes">
          <button type="button" aria-pressed={t < 0.5} onClick={() => onPick(0)}>
            Before
          </button>
          <button type="button" aria-pressed={t >= 0.5} onClick={() => onPick(1)}>
            After
          </button>
        </span>
        <span className="hud-state">
          <i aria-hidden="true" />
          {state}
        </span>
      </header>
      <ul className="hud-cells">
        {c.metrics.map((m) => {
          const v = m.before + (m.after - m.before) * t;
          const max = Math.max(m.before, m.after) || 1;
          return (
            <li className="hud-cell" key={m.id}>
              <span className="hud-label">{m.label}</span>
              <span className="hud-value" aria-hidden="true">
                <span className="hud-num">{fmt(v, m.decimals)}</span>
                <span className="hud-unit">{m.unit}</span>
              </span>
              <span className="hud-bar" aria-hidden="true">
                <span style={{ width: `${((v / max) * 100).toFixed(2)}%` }} />
              </span>
              <span className="hud-was">
                <s>{fmt(m.before, m.decimals)}</s>
                <span className="sr-only"> to </span>
                <Icon name="arrow" size={11} />
                <b>{fmt(m.after, m.decimals)}</b>
                <span className="hud-delta">{m.delta}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hud-note">{c.hero.instrumentNote}</p>
    </aside>
  );
}

/** A strip of proof points that scrolls by. It can be paused with its button, or by hovering. */
export function Ticker() {
  const items = useContent().hero.ticker;
  const [paused, setPaused] = useState(false);
  if (items.length === 0) return null;
  const row = (hidden: boolean) => (
    <ul className="ticker-row" aria-hidden={hidden || undefined}>
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
  return (
    <div className="ticker" role="region" aria-label="Measured results" data-paused={paused || undefined}>
      <button type="button" className="ticker-toggle" aria-label={paused ? 'Resume the moving strip of results' : 'Pause the moving strip of results'} onClick={() => setPaused((p) => !p)}>
        <Icon name={paused ? 'play' : 'pause'} size={14} />
      </button>
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

export function Hero() {
  const c = useContent();
  const p = c.profile;
  const [phase, setPhase] = useState(0);
  const scene = useRef<SceneHandle | null>(null);
  const note = useRef<HTMLDivElement>(null);
  const driven = useRef(false); // true once the 3D scene is the one moving the numbers

  // How much the first result improved. The 3D flow before and after is in this ratio.
  const first = c.metrics[0];
  const ratio = first && Math.min(first.before, first.after) > 0 ? Math.max(first.before, first.after) / Math.min(first.before, first.after) : 1.75;

  const opts = useMemo(
    () => ({
      ratio,
      label: () => note.current,
      onPhase: (value: number) => {
        driven.current = true;
        setPhase(value);
      },
    }),
    [ratio],
  );

  // If the 3D scene never starts (no WebGL, blocked, reduced motion), the numbers still make their move once.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase(1);
      return;
    }
    let raf = 0;
    const timer = window.setTimeout(() => {
      if (driven.current) return;
      const start = performance.now();
      const tick = (now: number) => {
        if (driven.current) return;
        const k = Math.min(1, (now - start) / 1900);
        setPhase(easeInOut(k));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 7000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const pick = (target: 0 | 1) => {
    if (scene.current) scene.current.send({ phase: target });
    else setPhase(target);
  };

  return (
    <section className="hero" id="top">
      <div className="wrap hero-inner">
        <div className="hero-copy">
          {p.availability && (
            <p className="status-chip">
              <i aria-hidden="true" />
              {p.availability}
            </p>
          )}
          <h1 className="hero-id">
            <span>{p.name}</span>
            <span className="hero-id-role">
              {p.role} · {p.focus}
            </span>
          </h1>
          <p className="hero-headline">
            <Headline text={c.hero.headline} />
          </p>
          <div className="hero-sub">
            {LENSES.map((l) => (
              <p key={l} data-lens-only={l}>
                {c.hero.sub[l]}
              </p>
            ))}
          </div>
          <div className="hero-actions">
            <a className="btn btn-primary" href={href('#work')}>
              See the work <Icon name="arrowDown" size={16} />
            </a>
            {p.resume && (
              <a className="btn" href={href(p.resume)} target="_blank" rel="noopener">
                Résumé <Icon name="download" size={16} />
              </a>
            )}
            <span className="hero-links">
              {p.links.map((l) => (
                <a key={l.url} className="icon-link" href={href(l.url)} target="_blank" rel="me noopener noreferrer" aria-label={l.label} title={l.label}>
                  <Icon name={linkIcon(l.kind)} size={20} />
                </a>
              ))}
              {p.email && (
                <a className="icon-link" href={`mailto:${p.email}`} aria-label="Email" title="Email">
                  <Icon name="mail" size={20} />
                </a>
              )}
            </span>
          </div>
          <div className="lens-prompt">
            <span className="lens-prompt-label">Who's reading?</span>
            <LensSwitch onPick={() => scrollToHash('brief', true, false)} />
            <span className="lens-prompt-hint">The page adapts to you.</span>
          </div>
        </div>

        <div className="hero-stage">
          <Scene3D
            name="bottleneck"
            direct
            className="hero-scene"
            opts={opts}
            onReady={(h) => {
              scene.current = h;
            }}
            overlay={
              <div className="scene-note" ref={note} data-phase="before">
                <span className="scene-note-before">{c.hero.sceneBefore}</span>
                <span className="scene-note-after">{c.hero.sceneAfter}</span>
              </div>
            }
          >
            <BottleStill />
          </Scene3D>
          <Hud t={phase} onPick={pick} />
        </div>
      </div>
      <Ticker />
    </section>
  );
}
