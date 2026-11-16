import type { CSSProperties } from 'react';
import { useContent } from '../lib/content';
import { inline } from '../lib/inline';
import { casePath, fmt, href, metricById } from '../lib/site';
import type { FlowStep, Metric, Track } from '../lib/types';
import { Icon } from './Icons';
import { Scene3D } from './Scene3D';

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function SectionHead({ no, id, title, intro }: { no: string; id: string; title: string; intro?: string }) {
  return (
    <header className="section-head" data-reveal>
      <p className="section-no" aria-hidden="true">
        {no}
      </p>
      <h2 className="section-title" id={id}>
        {title}
      </h2>
      {intro && <p className="section-intro">{inline(intro)}</p>}
    </header>
  );
}

/** One measured result: the old value struck out, the new value beside it. */
export function Delta({ m }: { m: Metric }) {
  return (
    <div className="delta">
      <span className="delta-label">{m.label}</span>
      <span className="delta-values">
        <s>{fmt(m.before, m.decimals)}</s>
        <span className="sr-only"> to </span>
        <Icon name="arrow" size={14} />
        <b>{fmt(m.after, m.decimals)}</b>
        <span className="delta-unit">{m.unit}</span>
      </span>
      <span className="delta-badge">{m.delta}</span>
    </div>
  );
}

/** A left-to-right pipeline sketch with a packet travelling along each connector. */
export function Flow({ steps }: { steps: FlowStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="flow" aria-label="How the system fits together">
      {steps.map((s, i) => (
        <li key={i} className="flow-step" style={{ '--i': i } as CSSProperties}>
          <span className="flow-no">{pad2(i + 1)}</span>
          <span className="flow-label">{s.label}</span>
          <span className="flow-note">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

/** The 3D illustration a case file can carry, with its caption. */
export function TrackVisual({ track, className }: { track: Track; className: string }) {
  if (!track.visual) return null;
  return (
    <figure className={className}>
      <Scene3D name={track.visual} opts={{ count: track.visualCount }} className="visual-scene" />
      {track.visualCaption && <figcaption>{track.visualCaption}</figcaption>}
    </figure>
  );
}

function TrackCard({ track, index }: { track: Track; index: number }) {
  const c = useContent();
  const metrics = track.metrics.map((id) => metricById(c, id)).filter((m): m is Metric => !!m);
  const url = href(casePath(track.id));
  return (
    <article className="track" id={`track-${track.id}`} data-reveal data-tilt>
      <div className="track-main">
        <p className="eyebrow">Case file {pad2(index + 1)}</p>
        <h4 className="track-title">
          <a href={url}>{track.title}</a>
        </h4>
        <p className="track-tagline">{track.tagline}</p>
        <ul className="bullets">
          {track.bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>
        {track.stories.length > 0 && (
          <div className="track-inside" data-lens-only="engineer">
            <p className="eyebrow">Inside the case file</p>
            <ol>
              {track.stories.map((s, i) => (
                <li key={i}>
                  <a href={`${url}#story-${i + 1}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </div>
        )}
        <ul className="chips" aria-label="Stack">
          {track.stack.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
      <aside className="track-side" aria-label="Measured results">
        <TrackVisual track={track} className="track-visual" />
        {metrics.map((m) => (
          <Delta key={m.id} m={m} />
        ))}
        <a className="btn btn-primary track-open" href={url}>
          Open case file <Icon name="arrow" size={16} />
        </a>
        {track.stories.length > 0 && (
          <p className="track-count">
            {track.stories.length} stories inside, each with the challenge, the action and the result.
          </p>
        )}
      </aside>
    </article>
  );
}

export function Work({ no }: { no: string }) {
  const c = useContent();
  let caseIndex = 0;
  return (
    <section className="section" id="work" aria-labelledby="work-title">
      <div className="wrap">
        <SectionHead no={no} id="work-title" title={c.work.title} intro={c.work.intro} />
        {c.work.experience.map((exp) => (
          <article className="exp" key={exp.id}>
            <header className="exp-head" data-reveal>
              <div>
                <h3 className="exp-org">
                  {exp.url ? (
                    <a href={href(exp.url)} target="_blank" rel="noopener noreferrer">
                      {exp.org}
                    </a>
                  ) : (
                    exp.org
                  )}
                </h3>
                <p className="exp-role">{exp.role}</p>
              </div>
              <p className="exp-meta">
                <span>{exp.period}</span>
                <span>{exp.location}</span>
              </p>
            </header>
            {exp.bullets.length > 0 && (
              <ul className="bullets exp-bullets" data-reveal>
                {exp.bullets.map((b, i) => (
                  <li key={i}>{inline(b)}</li>
                ))}
              </ul>
            )}
            {exp.tracks.map((t) => (
              <TrackCard key={t.id} track={t} index={caseIndex++} />
            ))}
            {exp.also.length > 0 && (
              <div className="also" data-reveal>
                <h4 className="also-title">Also shipped at {exp.org}</h4>
                <ul className="also-list">
                  {exp.also.map((a, i) => (
                    <li key={i}>
                      <h5>{a.title}</h5>
                      <p>{inline(a.body)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
