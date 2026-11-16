import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { confetti } from '../lib/confetti';
import { useContent } from '../lib/content';
import { navigate, scrollToHash } from '../lib/router';
import { allTracks, casePath, href, postPath, publishedPosts } from '../lib/site';
import { copyText, setLens, setPaletteOpen, setTheme, toast, usePaletteOpen, useTheme } from '../lib/state';
import { LENSES, LENS_LABEL } from '../lib/types';
import { Icon } from './Icons';
import { useNavSections } from './Shell';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  /** Hidden until the query matches it closely. */
  secret?: boolean;
  run: () => void;
}

function useCommands(): Command[] {
  const c = useContent();
  const theme = useTheme();
  const sections = useNavSections();
  return useMemo(() => {
    const p = c.profile;
    const go = (to: string) => () => navigate(href(to));
    const open = (url: string) => () => window.open(href(url), '_blank', 'noopener');
    const list: Command[] = [
      { id: 'top', group: 'Go to', label: 'Top of this page', run: () => scrollToHash('', true) },
      ...sections.map((s) => ({ id: 's-' + s.id, group: 'Go to', label: s.label, run: go('#' + s.id) })),
      ...allTracks(c).map(({ track }) => ({
        id: 'c-' + track.id,
        group: 'Case files',
        label: track.title,
        hint: track.tagline,
        keywords: track.stack.join(' '),
        run: go(casePath(track.id)),
      })),
      ...publishedPosts(c).map((post) => ({
        id: 'n-' + post.slug,
        group: 'Notes',
        label: post.title,
        hint: post.summary,
        keywords: post.tags.join(' '),
        run: go(postPath(post.slug)),
      })),
      ...c.projects.items.map((pr) => ({
        id: 'p-' + pr.id,
        group: 'Projects',
        label: pr.title,
        hint: pr.tagline,
        keywords: pr.stack.join(' ') + ' ' + pr.tags.join(' '),
        run: go('#project-' + pr.id),
      })),
      ...LENSES.map((l) => ({
        id: 'l-' + l,
        group: 'Read as',
        label: `Read as ${LENS_LABEL[l].toLowerCase()}`,
        keywords: 'lens persona view mode',
        run: () => {
          setLens(l);
          toast(`Reading as ${LENS_LABEL[l].toLowerCase()}. The page adapted.`);
        },
      })),
      {
        id: 'theme',
        group: 'Actions',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        keywords: 'dark light mode appearance',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
    ];
    if (p.email) {
      list.push({
        id: 'copy-email',
        group: 'Actions',
        label: 'Copy email address',
        hint: p.email,
        keywords: 'contact mail',
        run: async () => toast((await copyText(p.email)) ? 'Email address copied.' : p.email),
      });
      list.push({ id: 'email', group: 'Actions', label: 'Write me an email', keywords: 'contact mail hire', run: () => (location.href = `mailto:${p.email}`) });
    }
    if (p.resume) list.push({ id: 'resume', group: 'Actions', label: 'Open résumé (PDF)', keywords: 'cv resume download', run: open(p.resume) });
    for (const l of p.links) list.push({ id: 'link-' + l.url, group: 'Actions', label: `Open ${l.label}`, hint: l.url.replace(/^https?:\/\/(www\.)?/, ''), run: open(l.url) });
    list.push({
      id: 'copy-link',
      group: 'Actions',
      label: 'Copy a link to this page',
      keywords: 'share url',
      run: async () => toast((await copyText(location.href)) ? 'Link copied.' : location.href),
    });
    if (/^[\w.-]+\/[\w.-]+$/.test(c.meta.repo)) {
      list.push({ id: 'source', group: 'Actions', label: 'View the source of this site', keywords: 'github code repo', run: open(`https://github.com/${c.meta.repo}`) });
    }

    // A nod to the first version of this site, which had a "Stalker" profile.
    list.push({
      id: 'stalker',
      group: 'Secrets',
      label: 'stalker',
      secret: true,
      run: () => toast("I see you watching… Don't stalk people online, it's not cool. (But thanks for visiting.)", 5200),
    });
    list.push({
      id: 'sudo',
      group: 'Secrets',
      label: 'sudo hire idhanth',
      secret: true,
      run: () => {
        confetti();
        toast('Permission granted. Opening the contact section…', 3600);
        navigate(href('#contact'));
      },
    });
    return list;
  }, [c, theme, sections.map((s) => s.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
}

function search(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands.filter((c) => !c.secret);
  const tokens = q.split(/\s+/);
  const scored: Array<{ c: Command; score: number }> = [];
  for (const c of commands) {
    const label = c.label.toLowerCase();
    if (c.secret) {
      if (label.startsWith(q) && q.length >= 4) scored.push({ c, score: -1 });
      continue;
    }
    const hay = `${label} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) continue;
    scored.push({ c, score: label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2 });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.c);
}

export function Palette() {
  const open = usePaletteOpen();
  const commands = useCommands();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);
  const results = useMemo(() => search(commands, query), [commands, query]);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    setQuery('');
    setIndex(0);
    document.documentElement.classList.add('is-locked');
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.documentElement.classList.remove('is-locked');
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, results]);

  if (!open) return null;

  // Closing by Escape or the backdrop hands focus back to where it was; running a command lets that command decide.
  const dismiss = () => {
    setPaletteOpen(false);
    (lastFocus.current as HTMLElement | null)?.focus?.();
  };
  const run = (cmd: Command | undefined) => {
    if (!cmd) return;
    setPaletteOpen(false);
    cmd.run();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // keep focus in the field; arrows move through results
    }
  };

  // With nothing typed the commands are shown under their group names; a search shows one ranked list.
  const groups: Array<{ name: string; items: Array<{ cmd: Command; i: number }> }> = [];
  results.forEach((cmd, i) => {
    const name = query.trim() ? 'Results' : cmd.group;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push({ cmd, i });
    else groups.push({ name, items: [{ cmd, i }] });
  });

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Jump to a section, case file, project or action…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={results[index] ? 'cmd-' + results[index].id : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" aria-label="Commands" ref={listRef}>
          {groups.map((g, gi) => (
            <div key={g.name + gi} role="group" aria-labelledby={`palette-group-${gi}`}>
              <p className="palette-group" id={`palette-group-${gi}`} role="presentation">
                {g.name}
              </p>
              {g.items.map(({ cmd, i }) => (
                <div key={cmd.id} id={'cmd-' + cmd.id} role="option" aria-selected={i === index} className="palette-item" onMouseMove={() => setIndex(i)} onClick={() => run(cmd)}>
                  <span className="palette-label">{cmd.label}</span>
                  {cmd.hint && <span className="palette-hint">{cmd.hint}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        {results.length === 0 && (
          <p className="palette-empty" role="status">
            Nothing matches “{query}”.
          </p>
        )}
        <p className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to run
          </span>
          <span className="palette-foot-tip">Some commands only appear when you type them.</span>
        </p>
      </div>
    </div>
  );
}
