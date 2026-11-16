import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useContent } from '../lib/content';
import { inline } from '../lib/inline';
import { evidenceFor, formatDate, href, postPath, publishedPosts } from '../lib/site';
import { copyText, toast } from '../lib/state';
import { Icon, linkIcon } from './Icons';
import { Scene3D } from './Scene3D';
import { SectionHead, pad2 } from './Work';

export function Skills({ no }: { no: string }) {
  const c = useContent();
  const all = c.skills.groups.flatMap((g) => g.items);
  const evidence = useMemo(() => new Map(all.map((s) => [s, evidenceFor(c, s)])), [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = all.find((s) => (evidence.get(s)?.length ?? 0) > 0) ?? '';
  const [picked, setPicked] = useState(first);
  const sel = (evidence.get(picked)?.length ?? 0) > 0 ? picked : first;
  const list = evidence.get(sel) ?? [];

  return (
    <section className="section" id="skills" aria-labelledby="skills-title">
      <div className="wrap">
        <SectionHead no={no} id="skills-title" title={c.skills.title} intro={c.skills.intro} />
        <div className="skills" data-reveal>
          <div className="skill-groups">
            {c.skills.groups.map((g) => (
              <div className="skill-group" key={g.group}>
                <h3>{g.group}</h3>
                <ul>
                  {g.items.map((s) => {
                    const n = evidence.get(s)?.length ?? 0;
                    return (
                      <li key={s}>
                        {n > 0 ? (
                          <button type="button" className="skill" aria-pressed={sel === s} onClick={() => setPicked(s)}>
                            {s}
                            <span className="skill-count" aria-hidden="true">
                              {n}
                            </span>
                            <span className="sr-only">
                              , used in {n} {n === 1 ? 'place' : 'places'}
                            </span>
                          </button>
                        ) : (
                          <span className="skill is-plain">{s}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {sel && (
            <aside className="evidence" aria-live="polite">
              <p className="eyebrow">Receipts for</p>
              <h3 className="evidence-title">{sel}</h3>
              <ul className="evidence-list">
                {list.map((e) => (
                  <li key={e.href}>
                    <a href={e.href}>
                      <span className="evidence-kind">{e.kind}</span>
                      <b>{e.title}</b>
                      <span className="evidence-tagline">{e.tagline}</span>
                      <Icon name="arrow" size={16} />
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}

function CommonGround() {
  const c = useContent();
  const a = c.about;
  const [picked, setPicked] = useState<number[]>([]);
  if (a.common.length === 0) return null;
  const n = picked.length;
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const message =
    n === 0 ? a.commonIntro : n <= 2 ? `${n} in common. A start.` : n <= 5 ? `${n} in common. Okay, we'd get along.` : `${n} in common. Are you me? We should talk.`;
  const mail = c.profile.email
    ? `mailto:${c.profile.email}?subject=${encodeURIComponent(`We have ${n} things in common`)}`
    : href('#contact');

  return (
    <div className="common" id="common" data-reveal>
      <h3 className="sub-title">{a.commonTitle}</h3>
      <ul className="common-list">
        {a.common.map((item, i) => (
          <li key={i}>
            <button type="button" className="common-chip" aria-pressed={picked.includes(i)} onClick={() => toggle(i)}>
              <span aria-hidden="true">{item.emoji}</span>
              {item.text}
            </button>
          </li>
        ))}
      </ul>
      <p className="common-result" role="status">
        <span className="common-count" data-on={n > 0 || undefined}>
          {message}
        </span>
        {n >= 3 && (
          <a className="btn btn-primary" href={mail}>
            Say hi <Icon name="arrow" size={16} />
          </a>
        )}
      </p>
    </div>
  );
}

export function About({ no }: { no: string }) {
  const c = useContent();
  const a = c.about;
  const p = c.profile;
  const initials = p.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="section" id="about" aria-labelledby="about-title">
      <div className="wrap">
        <SectionHead no={no} id="about-title" title={a.title} />
        <div className="about-top">
          <figure className="portrait" data-reveal data-tilt>
            {p.photo ? (
              <img src={href(p.photo)} alt={`Portrait of ${p.name}`} loading="lazy" decoding="async" style={{ objectPosition: p.photoPosition || 'center' }} />
            ) : (
              <span className="portrait-mono" aria-hidden="true">
                {initials}
              </span>
            )}
            <figcaption>
              <b>{p.name}</b>
              <span>{p.location}</span>
            </figcaption>
          </figure>
          <div className="about-bio" data-reveal>
            {a.bio.map((b, i) => (
              <p key={i}>{inline(b)}</p>
            ))}
          </div>
        </div>

        {a.principles.length > 0 && (
          <div className="principles">
            <h3 className="sub-title" data-reveal>
              {a.principlesTitle}
            </h3>
            <ol>
              {a.principles.map((pr, i) => (
                <li key={i} data-reveal style={{ '--d': `${i * 70}ms` } as CSSProperties}>
                  <span className="principle-no" aria-hidden="true">
                    {pad2(i + 1)}
                  </span>
                  <h4>{pr.title}</h4>
                  <p>{inline(pr.body)}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="about-cols" data-reveal>
          {a.education.length > 0 && (
            <div>
              <h3 className="sub-title">Education</h3>
              {a.education.map((e, i) => (
                <div className="edu" key={i}>
                  <b>{e.school}</b>
                  <span>{e.degree}</span>
                  <span className="muted">
                    {e.period}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          {a.activities.length > 0 && (
            <div>
              <h3 className="sub-title">Beyond the keyboard</h3>
              <ul className="bullets">
                {a.activities.map((x, i) => (
                  <li key={i}>{inline(x)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <CommonGround />
      </div>
    </section>
  );
}

export function Writing({ no }: { no: string }) {
  const c = useContent();
  const posts = publishedPosts(c);
  if (posts.length === 0) return null;
  return (
    <section className="section" id="notes" aria-labelledby="notes-title">
      <div className="wrap">
        <SectionHead no={no} id="notes-title" title={c.writing.title} intro={c.writing.intro} />
        <ul className="posts">
          {posts.map((post) => (
            <li key={post.slug} data-reveal>
              <a href={href(postPath(post.slug))}>
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span className="posts-main">
                  <b>{post.title}</b>
                  <span>{post.summary}</span>
                </span>
                <Icon name="arrow" size={20} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Contact() {
  const c = useContent();
  const p = c.profile;
  const [time, setTime] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tick = () => {
      try {
        setTime(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: p.timezone || undefined }).format(new Date()));
      } catch {
        setTime('');
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [p.timezone]);

  const copy = async () => {
    if (await copyText(p.email)) {
      setCopied(true);
      toast('Email address copied.');
      setTimeout(() => setCopied(false), 2000);
    } else toast(p.email);
  };

  return (
    <section className="contact" id="contact" aria-labelledby="contact-title">
      <Scene3D name="plane" className="contact-scene" />
      <div className="wrap">
        <p className="eyebrow">Contact</p>
        <h2 className="contact-headline" id="contact-title" data-reveal>
          {c.contact.headline}
        </h2>
        <p className="contact-sub" data-reveal>
          {inline(c.contact.sub)}
        </p>
        <div className="contact-actions" data-reveal>
          {p.email && (
            <>
              <a className="btn btn-primary btn-lg" href={`mailto:${p.email}`}>
                <Icon name="mail" /> {p.email}
              </a>
              <button type="button" className="btn btn-lg" onClick={copy} aria-label="Copy email address">
                <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </>
          )}
          {p.links.map((l) => (
            <a key={l.url} className="btn btn-lg" href={href(l.url)} target="_blank" rel="me noopener noreferrer">
              <Icon name={linkIcon(l.kind)} /> {l.label}
            </a>
          ))}
          {p.resume && (
            <a className="btn btn-lg" href={href(p.resume)} target="_blank" rel="noopener">
              <Icon name="download" /> Résumé
            </a>
          )}
        </div>
        <p className="contact-time">
          {p.location}
          {time && (
            <>
              {' '}
              · it's <time>{time}</time> for me right now
            </>
          )}
        </p>
      </div>
    </section>
  );
}
