import { useContent } from '../lib/content';
import { inline } from '../lib/inline';
import { allTracks, casePath, findTrack, href, metricById } from '../lib/site';
import type { Metric } from '../lib/types';
import { Icon } from './Icons';
import { Delta, Flow, TrackVisual, pad2 } from './Work';

export function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="notfound">
      <div className="wrap">
        <p className="eyebrow">404 · measured, and missing</p>
        <h1 className="case-title">This page doesn't exist.</h1>
        <p className="case-tagline">The link may be old, or the page may have moved.</p>
        <a className="btn btn-primary" href={href('/')}>
          <Icon name="arrowLeft" size={16} /> Back to the start
        </a>
      </div>
    </main>
  );
}

/** A full page for one case file: /work/<id>/ */
export function CasePage({ id }: { id: string }) {
  const c = useContent();
  const found = findTrack(c, id);
  if (!found) return <NotFound />;
  const { track, exp } = found;
  const tracks = allTracks(c);
  const idx = tracks.findIndex((t) => t.track.id === id);
  const next = tracks.length > 1 ? tracks[(idx + 1) % tracks.length] : undefined;
  const metrics = track.metrics.map((m) => metricById(c, m)).filter((m): m is Metric => !!m);

  return (
    <main id="main" tabIndex={-1} className="case">
      <div className="wrap">
        <a className="back" href={href('#work')}>
          <Icon name="arrowLeft" size={16} /> All work
        </a>
        <header className="case-head">
          <p className="eyebrow">
            Case file {pad2(idx + 1)} · {exp.org} · {exp.period}
          </p>
          <h1 className="case-title">{track.title}</h1>
          <p className="case-tagline">{track.tagline}</p>
        </header>

        <TrackVisual track={track} className="case-visual" />

        <div className="case-top">
          <div className="case-summary">
            <p>{inline(track.summary)}</p>
            <dl className="case-meta">
              <div>
                <dt>Role</dt>
                <dd>{exp.role}</dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>
                  {exp.org} · {exp.location}
                </dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{exp.period}</dd>
              </div>
            </dl>
          </div>
          {metrics.length > 0 && (
            <div className="case-metrics" aria-label="Measured results">
              {metrics.map((m) => (
                <Delta key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>

        <Flow steps={track.flow} />

        {track.stories.length > 0 && (
          <div className="case-body">
            <nav className="case-toc" aria-label="Stories in this case file">
              <p className="eyebrow">In this file</p>
              <ol>
                {track.stories.map((s, i) => (
                  <li key={i}>
                    <a href={`#story-${i + 1}`}>{s.title}</a>
                  </li>
                ))}
              </ol>
            </nav>
            <ol className="stories">
              {track.stories.map((s, i) => (
                <li className="story" id={`story-${i + 1}`} key={i}>
                  <p className="story-no" aria-hidden="true">
                    {pad2(i + 1)}
                  </p>
                  <h2 className="story-title">{s.title}</h2>
                  <p className="story-impact">
                    <span className="eyebrow">Impact</span>
                    {inline(s.impact)}
                  </p>
                  <dl className="car">
                    <div>
                      <dt>Challenge</dt>
                      <dd>{inline(s.challenge)}</dd>
                    </div>
                    <div>
                      <dt>Action</dt>
                      <dd>{inline(s.action)}</dd>
                    </div>
                    <div>
                      <dt>Result</dt>
                      <dd>{inline(s.result)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          </div>
        )}

        <footer className="case-foot">
          <div>
            <p className="eyebrow">Stack</p>
            <ul className="chips">
              {track.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          {next && next.track.id !== track.id && (
            <a className="next-case" href={href(casePath(next.track.id))}>
              <span className="eyebrow">Next case file</span>
              <b>{next.track.title}</b>
              <span>{next.track.tagline}</span>
              <Icon name="arrow" size={20} />
            </a>
          )}
        </footer>
      </div>
    </main>
  );
}
