import { useEffect, useState } from 'react';
import { useContent } from '../lib/content';
import { loadPostHtml } from '../lib/posts';
import { formatDate, href } from '../lib/site';
import { NotFound } from './CasePage';
import { Icon } from './Icons';

/** A full page for one note: /notes/<slug>/ */
export function PostPage({ slug, initialHtml }: { slug: string; initialHtml: string | null }) {
  const c = useContent();
  const post = c.writing.posts.find((p) => p.slug === slug && p.published);
  const [html, setHtml] = useState<string | null>(initialHtml);

  useEffect(() => {
    if (html !== null || !post) return;
    let live = true;
    loadPostHtml(slug).then((h) => {
      if (live) setHtml(h ?? '<p>This note could not be loaded.</p>');
    });
    return () => {
      live = false;
    };
  }, [slug, html, post]);

  if (!post) return <NotFound />;

  return (
    <main id="main" tabIndex={-1} className="post">
      <div className="wrap wrap-narrow">
        <a className="back" href={href('#notes')}>
          <Icon name="arrowLeft" size={16} /> All notes
        </a>
        <header className="case-head">
          <p className="eyebrow">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            {post.tags.length > 0 && <> · {post.tags.join(' · ')}</>}
          </p>
          <h1 className="case-title">{post.title}</h1>
          {post.summary && <p className="case-tagline">{post.summary}</p>}
        </header>
        <article className="prose" id="post-body" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html ?? '' }} />
        <footer className="post-foot">
          <p>
            Written by {c.profile.name}.{' '}
            {c.profile.email && (
              <>
                Thoughts or corrections? <a href={`mailto:${c.profile.email}`}>Email me</a>.
              </>
            )}
          </p>
          <a className="btn" href={href('/')}>
            <Icon name="arrowLeft" size={16} /> Back to the site
          </a>
        </footer>
      </div>
    </main>
  );
}
