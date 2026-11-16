import type { ReactNode } from 'react';
import { isExternal, safeUrl } from './site';

// A deliberately tiny inline formatter for content strings:
// **bold**, *italic*, `code` and [label](url). No HTML is ever injected.
const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const t = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (t.startsWith('**')) out.push(<strong key={key++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('*')) out.push(<em key={key++}>{t.slice(1, -1)}</em>);
    else if (t.startsWith('`')) out.push(<code key={key++}>{t.slice(1, -1)}</code>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
      if (mm) {
        const url = safeUrl(mm[2]);
        out.push(
          <a key={key++} href={url} {...(isExternal(url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {mm[1]}
          </a>,
        );
      } else out.push(t);
    }
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
