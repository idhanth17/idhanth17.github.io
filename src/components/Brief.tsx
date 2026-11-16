import { useContent } from '../lib/content';
import { inline } from '../lib/inline';
import { href } from '../lib/site';
import { Icon } from './Icons';

/** The lens-specific opening. All three versions are in the HTML; CSS shows the one that matches <html data-lens>. */
export function Brief() {
  const c = useContent();
  const { recruiter, engineer, friend } = c.brief;
  const p = c.profile;
  const linkedin = p.links.find((l) => l.kind === 'linkedin');

  return (
    <section className="brief" id="brief" aria-label="A summary for whoever is reading">
      <div className="wrap">
        <div className="brief-card" data-lens-only="recruiter">
          <header className="brief-head">
            <p className="eyebrow">Reading as · Recruiter</p>
            <h2>{recruiter.title}</h2>
          </header>
          <div className="brief-body">
            <dl className="facts">
              {recruiter.facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{inline(f.value)}</dd>
                </div>
              ))}
            </dl>
            <ul className="brief-highlights">
              {recruiter.highlights.map((h, i) => (
                <li key={i}>{inline(h)}</li>
              ))}
            </ul>
            <div className="brief-actions">
              {p.resume && (
                <a className="btn btn-primary" href={href(p.resume)} target="_blank" rel="noopener">
                  Download résumé <Icon name="download" size={16} />
                </a>
              )}
              {p.email && (
                <a className="btn" href={`mailto:${p.email}`}>
                  Email me <Icon name="mail" size={16} />
                </a>
              )}
              {linkedin && (
                <a className="btn" href={href(linkedin.url)} target="_blank" rel="noopener noreferrer">
                  LinkedIn <Icon name="arrowUpRight" size={16} />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="brief-card" data-lens-only="engineer">
          <header className="brief-head">
            <p className="eyebrow">Reading as · Engineer</p>
            <h2>{engineer.title}</h2>
          </header>
          <div className="brief-body">
            <p className="brief-text">{inline(engineer.body)}</p>
            <ol className="jumps">
              {engineer.jumps.map((j, i) => (
                <li key={i}>
                  <a href={href(j.href)}>
                    <span className="jump-no">{String(i + 1).padStart(2, '0')}</span>
                    <span className="jump-label">{j.label}</span>
                    <Icon name="arrow" size={16} />
                  </a>
                </li>
              ))}
            </ol>
            {engineer.tip && <p className="brief-tip">{engineer.tip}</p>}
          </div>
        </div>

        <div className="brief-card" data-lens-only="friend">
          <header className="brief-head">
            <p className="eyebrow">Reading as · Friend</p>
            <h2>{friend.title}</h2>
          </header>
          <div className="brief-body">
            <p className="brief-text brief-text-lg">{inline(friend.body)}</p>
            <div className="brief-actions">
              {friend.jumps.map((j, i) => (
                <a key={i} className={'btn' + (i === 0 ? ' btn-primary' : '')} href={href(j.href)}>
                  {j.label} <Icon name="arrow" size={16} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
