// Describes every editable field. Form.tsx turns this into the editing UI,
// so adding a field to the site means adding one line here.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Field =
  | { kind: 'text'; key: string; label: string; help?: string; placeholder?: string }
  | { kind: 'textarea'; key: string; label: string; help?: string; rows?: number }
  | { kind: 'number'; key: string; label: string; help?: string; step?: number }
  | { kind: 'toggle'; key: string; label: string; help?: string }
  | { kind: 'select'; key: string; label: string; help?: string; options: Array<{ value: string; label: string }> }
  | { kind: 'tags'; key: string; label: string; help?: string }
  | { kind: 'lines'; key: string; label: string; help?: string; rows?: number; addLabel?: string }
  | { kind: 'image'; key: string; label: string; help?: string }
  | { kind: 'file'; key: string; label: string; help?: string; accept: string; target: string }
  | { kind: 'group'; key: string; label: string; help?: string; fields: Field[] }
  | {
      kind: 'list';
      key: string;
      label: string;
      help?: string;
      fields: Field[];
      title: (item: any, index: number) => string;
      blank: () => unknown;
      addLabel: string;
    };

export interface Section {
  id: string;
  label: string;
  hint: string;
  /** Element id the live preview scrolls to when this section is opened. */
  target: string;
  /** Where this section's object lives inside the content ([] = the root). */
  path: string[];
  fields: Field[];
}

const FORMAT = 'Formatting: **bold**, *italic*, `code`, [link](https://example.com).';

const jumps = (key: string): Field => ({
  kind: 'list',
  key,
  label: 'Jump links',
  help: 'Use "#work" for a section on the home page, or "/work/<id>/" for a case file.',
  title: (j) => j.label || 'New link',
  blank: () => ({ label: '', href: '#work' }),
  addLabel: 'Add link',
  fields: [
    { kind: 'text', key: 'label', label: 'Label' },
    { kind: 'text', key: 'href', label: 'Goes to' },
  ],
});

export const SECTIONS: Section[] = [
  {
    id: 'profile',
    label: 'Profile',
    hint: 'Your name, links, photo and résumé.',
    target: 'top',
    path: ['profile'],
    fields: [
      { kind: 'text', key: 'name', label: 'Name' },
      { kind: 'text', key: 'role', label: 'Role', placeholder: 'Software Engineer' },
      { kind: 'text', key: 'focus', label: 'Focus', placeholder: 'Backend & LLM Systems' },
      { kind: 'text', key: 'availability', label: 'Status chip', help: 'Shown with a green dot at the top of the page. Leave empty to hide it.' },
      { kind: 'text', key: 'location', label: 'Location' },
      { kind: 'text', key: 'timezone', label: 'Time zone', help: 'An IANA zone such as Asia/Kolkata. Drives the "it\'s 2:41 PM for me" line.' },
      { kind: 'text', key: 'email', label: 'Public email', help: 'Shown on the site. Leave empty to hide every email button.' },
      { kind: 'image', key: 'photo', label: 'Photo', help: 'Shown in About. Leave empty to show your initials instead.' },
      { kind: 'text', key: 'photoPosition', label: 'Photo focus', help: 'Which part of the photo to keep when cropping, e.g. "50% 20%" (left-right, top-bottom).' },
      { kind: 'file', key: 'resume', label: 'Résumé (PDF)', accept: 'application/pdf', target: 'public/resume.pdf', help: 'Upload a new PDF to replace the current one.' },
      {
        kind: 'list',
        key: 'links',
        label: 'Profile links',
        title: (l) => l.label || 'New link',
        blank: () => ({ label: '', url: 'https://', kind: 'web' }),
        addLabel: 'Add link',
        fields: [
          { kind: 'text', key: 'label', label: 'Label' },
          { kind: 'text', key: 'url', label: 'URL' },
          {
            kind: 'select',
            key: 'kind',
            label: 'Icon',
            options: [
              { value: 'github', label: 'GitHub' },
              { value: 'linkedin', label: 'LinkedIn' },
              { value: 'instagram', label: 'Instagram' },
              { value: 'x', label: 'X' },
              { value: 'web', label: 'Website' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'hero',
    label: 'Hero',
    hint: 'The first screen: headline, intro and the scrolling strip of numbers.',
    target: 'top',
    path: ['hero'],
    fields: [
      { kind: 'text', key: 'headline', label: 'Headline', help: 'Wrap one word in *asterisks* to circle it in red pen.' },
      {
        kind: 'group',
        key: 'sub',
        label: 'Intro paragraph, per reader',
        fields: [
          { kind: 'textarea', key: 'recruiter', label: 'For recruiters', rows: 3 },
          { kind: 'textarea', key: 'engineer', label: 'For engineers', rows: 3 },
          { kind: 'textarea', key: 'friend', label: 'For friends', rows: 3 },
        ],
      },
      { kind: 'text', key: 'sceneBefore', label: '3D bottle note, before the fix', help: 'The handwritten note pinned to the neck of the 3D bottle.' },
      { kind: 'text', key: 'sceneAfter', label: '3D bottle note, after the fix' },
      { kind: 'lines', key: 'ticker', label: 'Scrolling strip', help: 'Short proof points. Leave empty to hide the strip.', addLabel: 'Add item' },
      { kind: 'text', key: 'instrumentTitle', label: 'Instrument title' },
      { kind: 'textarea', key: 'instrumentNote', label: 'Instrument footnote', rows: 2 },
    ],
  },
  {
    id: 'brief',
    label: 'Summaries',
    hint: 'The opening summary each kind of reader sees.',
    target: 'brief',
    path: ['brief'],
    fields: [
      {
        kind: 'group',
        key: 'recruiter',
        label: 'Recruiter',
        fields: [
          { kind: 'text', key: 'title', label: 'Title' },
          {
            kind: 'list',
            key: 'facts',
            label: 'Facts',
            title: (f) => f.label || 'New fact',
            blank: () => ({ label: '', value: '' }),
            addLabel: 'Add fact',
            fields: [
              { kind: 'text', key: 'label', label: 'Label' },
              { kind: 'textarea', key: 'value', label: 'Value', rows: 2 },
            ],
          },
          { kind: 'lines', key: 'highlights', label: 'Highlights', help: FORMAT, addLabel: 'Add highlight' },
        ],
      },
      {
        kind: 'group',
        key: 'engineer',
        label: 'Engineer',
        fields: [
          { kind: 'text', key: 'title', label: 'Title' },
          { kind: 'textarea', key: 'body', label: 'Text', rows: 3 },
          jumps('jumps'),
          { kind: 'text', key: 'tip', label: 'Tip line' },
        ],
      },
      {
        kind: 'group',
        key: 'friend',
        label: 'Friend',
        fields: [{ kind: 'text', key: 'title', label: 'Title' }, { kind: 'textarea', key: 'body', label: 'Text', rows: 3 }, jumps('jumps')],
      },
    ],
  },
  {
    id: 'metrics',
    label: 'Numbers',
    hint: 'Before/after results. They drive the hero instrument and the result chips on case files.',
    target: 'top',
    path: [],
    fields: [
      {
        kind: 'list',
        key: 'metrics',
        label: 'Results',
        help: 'Only put a number here if you can point to where it was measured.',
        title: (m) => (m.label ? `${m.label}: ${m.before} → ${m.after} ${m.unit}` : 'New result'),
        blank: () => ({ id: 'metric-' + Date.now().toString(36), label: '', before: 0, after: 0, unit: '', decimals: 0, better: 'lower', delta: '', note: '' }),
        addLabel: 'Add result',
        fields: [
          { kind: 'text', key: 'label', label: 'What was measured' },
          { kind: 'number', key: 'before', label: 'Before', step: 0.01 },
          { kind: 'number', key: 'after', label: 'After', step: 0.01 },
          { kind: 'text', key: 'unit', label: 'Unit', placeholder: 's, calls/min, M tokens' },
          { kind: 'number', key: 'decimals', label: 'Decimal places', step: 1 },
          {
            kind: 'select',
            key: 'better',
            label: 'Which way is good?',
            options: [
              { value: 'lower', label: 'Lower is better' },
              { value: 'higher', label: 'Higher is better' },
            ],
          },
          { kind: 'text', key: 'delta', label: 'Badge', placeholder: '6× faster, −28.5%, +75%' },
          { kind: 'text', key: 'note', label: 'How (one line)' },
          { kind: 'text', key: 'id', label: 'ID', help: 'Case files refer to results by this ID. Change it with care.' },
        ],
      },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    hint: 'Experience, case files and their stories.',
    target: 'work',
    path: ['work'],
    fields: [
      { kind: 'text', key: 'title', label: 'Section title' },
      { kind: 'textarea', key: 'intro', label: 'Intro', rows: 2 },
      {
        kind: 'list',
        key: 'experience',
        label: 'Experience',
        title: (e) => (e.org ? `${e.org} · ${e.role}` : 'New experience'),
        blank: () => ({ id: 'exp-' + Date.now().toString(36), org: '', role: '', period: '', location: '', url: '', bullets: [], tracks: [], also: [] }),
        addLabel: 'Add experience',
        fields: [
          { kind: 'text', key: 'org', label: 'Organisation' },
          { kind: 'text', key: 'role', label: 'Role' },
          { kind: 'text', key: 'period', label: 'Period', placeholder: 'May 2026 – Present' },
          { kind: 'text', key: 'location', label: 'Location', placeholder: 'Remote' },
          { kind: 'text', key: 'url', label: 'Website (optional)' },
          { kind: 'lines', key: 'bullets', label: 'Bullets', help: 'For short roles that do not need a case file. ' + FORMAT, addLabel: 'Add bullet' },
          {
            kind: 'list',
            key: 'tracks',
            label: 'Case files',
            help: 'Each case file gets its own page at /work/<id>/.',
            title: (t) => t.title || 'New case file',
            blank: () => ({ id: 'case-' + Date.now().toString(36), title: '', tagline: '', summary: '', bullets: [], metrics: [], stack: [], flow: [], stories: [], visual: '', visualCount: 0, visualCaption: '' }),
            addLabel: 'Add case file',
            fields: [
              { kind: 'text', key: 'title', label: 'Title' },
              { kind: 'text', key: 'tagline', label: 'One-line description' },
              { kind: 'text', key: 'id', label: 'ID (used in the URL)', help: 'Lowercase letters, digits and dashes. Changing it changes the page address.' },
              { kind: 'textarea', key: 'summary', label: 'Summary (top of the case page)', rows: 4 },
              { kind: 'lines', key: 'bullets', label: 'Headline bullets (on the home page)', help: FORMAT, addLabel: 'Add bullet' },
              { kind: 'tags', key: 'metrics', label: 'Result IDs', help: 'IDs from the Numbers section, shown as before → after chips.' },
              { kind: 'tags', key: 'stack', label: 'Stack', help: 'Names that match a skill make this case file appear as that skill\'s receipt.' },
              {
                kind: 'select',
                key: 'visual',
                label: '3D illustration',
                options: [
                  { value: '', label: 'None' },
                  { value: 'corpus', label: 'Document cloud (a search finding its nearest documents)' },
                  { value: 'fleet', label: 'Fleet (machines streaming to one dashboard)' },
                ],
              },
              { kind: 'number', key: 'visualCount', label: 'How many it draws', step: 1, help: 'The real number of documents or machines. Only use a number you can stand behind.' },
              { kind: 'text', key: 'visualCaption', label: 'Caption under the illustration' },
              {
                kind: 'list',
                key: 'flow',
                label: 'Pipeline sketch',
                help: 'Four to six steps, left to right.',
                title: (s) => s.label || 'New step',
                blank: () => ({ label: '', note: '' }),
                addLabel: 'Add step',
                fields: [
                  { kind: 'text', key: 'label', label: 'Step' },
                  { kind: 'text', key: 'note', label: 'Note' },
                ],
              },
              {
                kind: 'list',
                key: 'stories',
                label: 'Stories',
                title: (s) => s.title || 'New story',
                blank: () => ({ title: '', impact: '', challenge: '', action: '', result: '' }),
                addLabel: 'Add story',
                fields: [
                  { kind: 'text', key: 'title', label: 'Title' },
                  { kind: 'textarea', key: 'impact', label: 'Impact (the numbers)', rows: 2 },
                  { kind: 'textarea', key: 'challenge', label: 'Challenge', rows: 3 },
                  { kind: 'textarea', key: 'action', label: 'Action', rows: 4 },
                  { kind: 'textarea', key: 'result', label: 'Result', rows: 2 },
                ],
              },
            ],
          },
          {
            kind: 'list',
            key: 'also',
            label: 'Also shipped',
            title: (a) => a.title || 'New item',
            blank: () => ({ title: '', body: '' }),
            addLabel: 'Add item',
            fields: [
              { kind: 'text', key: 'title', label: 'Title' },
              { kind: 'textarea', key: 'body', label: 'Text', rows: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    hint: 'Featured projects get a card; the rest go in the archive list.',
    target: 'projects',
    path: ['projects'],
    fields: [
      { kind: 'text', key: 'title', label: 'Section title' },
      { kind: 'textarea', key: 'intro', label: 'Intro', rows: 2 },
      { kind: 'toggle', key: 'showGithubFeed', label: 'Show "Live from GitHub"', help: 'Lists your most recently pushed public repos, fetched in the visitor\'s browser.' },
      {
        kind: 'list',
        key: 'items',
        label: 'Projects',
        title: (p) => `${p.featured ? '★ ' : ''}${p.title || 'New project'}${p.year ? ' · ' + p.year : ''}`,
        blank: () => ({
          id: 'project-' + Date.now().toString(36),
          title: '',
          year: String(new Date().getFullYear()),
          tagline: '',
          description: '',
          highlights: [],
          stack: [],
          tags: [],
          live: '',
          repo: '',
          image: '',
          featured: false,
          status: '',
          statValue: '',
          statLabel: '',
          emblem: '',
        }),
        addLabel: 'Add project',
        fields: [
          { kind: 'text', key: 'title', label: 'Title' },
          { kind: 'text', key: 'tagline', label: 'One-line description' },
          { kind: 'toggle', key: 'featured', label: 'Featured (shown as a card)' },
          { kind: 'text', key: 'year', label: 'Year' },
          { kind: 'textarea', key: 'description', label: 'Description', rows: 4, help: FORMAT },
          { kind: 'lines', key: 'highlights', label: 'Highlights (cards only)', addLabel: 'Add highlight' },
          { kind: 'tags', key: 'stack', label: 'Stack' },
          { kind: 'tags', key: 'tags', label: 'Filter tags', help: 'For example AI, Web, Systems, Mobile, Algorithms, Data.' },
          { kind: 'text', key: 'live', label: 'Live URL' },
          { kind: 'text', key: 'repo', label: 'Code URL' },
          { kind: 'text', key: 'status', label: 'Status note', placeholder: 'Personal tool · private source' },
          { kind: 'text', key: 'statValue', label: 'Big number (cards only)', placeholder: '<300 ms' },
          { kind: 'text', key: 'statLabel', label: 'Big number label' },
          {
            kind: 'select',
            key: 'emblem',
            label: '3D emblem (cards only)',
            options: [
              { value: '', label: 'None (drawn cover art)' },
              { value: 'waveform', label: 'Sound meter' },
              { value: 'lottery', label: 'Orbiting balls' },
              { value: 'rings', label: 'Filling rings' },
              { value: 'anvil', label: 'Anvil' },
              { value: 'candles', label: 'Candlestick chart' },
              { value: 'graph', label: 'Chain of steps' },
            ],
          },
          { kind: 'image', key: 'image', label: 'Cover image (optional)', help: 'Replaces the 3D emblem and the drawn cover art.' },
          { kind: 'text', key: 'id', label: 'ID' },
        ],
      },
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    hint: 'A skill shows receipts when a case file or project lists the same name in its stack.',
    target: 'skills',
    path: ['skills'],
    fields: [
      { kind: 'text', key: 'title', label: 'Section title' },
      { kind: 'textarea', key: 'intro', label: 'Intro', rows: 2 },
      {
        kind: 'list',
        key: 'groups',
        label: 'Groups',
        title: (g) => g.group || 'New group',
        blank: () => ({ group: '', items: [] }),
        addLabel: 'Add group',
        fields: [
          { kind: 'text', key: 'group', label: 'Group name' },
          { kind: 'tags', key: 'items', label: 'Skills' },
        ],
      },
    ],
  },
  {
    id: 'about',
    label: 'About',
    hint: 'Bio, principles, education and the "things in common" game.',
    target: 'about',
    path: ['about'],
    fields: [
      { kind: 'text', key: 'title', label: 'Section title' },
      { kind: 'lines', key: 'bio', label: 'Bio paragraphs', rows: 4, help: 'The first paragraph is set large. ' + FORMAT, addLabel: 'Add paragraph' },
      { kind: 'text', key: 'principlesTitle', label: 'Principles heading' },
      {
        kind: 'list',
        key: 'principles',
        label: 'Principles',
        title: (p) => p.title || 'New principle',
        blank: () => ({ title: '', body: '' }),
        addLabel: 'Add principle',
        fields: [
          { kind: 'text', key: 'title', label: 'Title' },
          { kind: 'textarea', key: 'body', label: 'Text', rows: 3 },
        ],
      },
      {
        kind: 'list',
        key: 'education',
        label: 'Education',
        title: (e) => e.school || 'New entry',
        blank: () => ({ school: '', degree: '', period: '', note: '' }),
        addLabel: 'Add entry',
        fields: [
          { kind: 'text', key: 'school', label: 'School' },
          { kind: 'text', key: 'degree', label: 'Degree' },
          { kind: 'text', key: 'period', label: 'Period' },
          { kind: 'text', key: 'note', label: 'Note (optional)', placeholder: 'CGPA, honours…' },
        ],
      },
      { kind: 'lines', key: 'activities', label: 'Beyond the keyboard', addLabel: 'Add line' },
      { kind: 'text', key: 'commonTitle', label: '"In common" heading' },
      { kind: 'text', key: 'commonIntro', label: '"In common" prompt' },
      {
        kind: 'list',
        key: 'common',
        label: '"In common" chips',
        help: 'Remove them all to hide the game.',
        title: (c) => `${c.emoji || ''} ${c.text || 'New chip'}`.trim(),
        blank: () => ({ emoji: '', text: '' }),
        addLabel: 'Add chip',
        fields: [
          { kind: 'text', key: 'emoji', label: 'Emoji' },
          { kind: 'text', key: 'text', label: 'Text' },
        ],
      },
    ],
  },
  {
    id: 'contact',
    label: 'Contact & footer',
    hint: 'The closing call to action and the footer line.',
    target: 'contact',
    path: [],
    fields: [
      {
        kind: 'group',
        key: 'contact',
        label: 'Contact',
        fields: [
          { kind: 'text', key: 'headline', label: 'Headline' },
          { kind: 'textarea', key: 'sub', label: 'Text', rows: 2 },
        ],
      },
      { kind: 'group', key: 'footer', label: 'Footer', fields: [{ kind: 'textarea', key: 'note', label: 'Footer note', rows: 2 }] },
    ],
  },
  {
    id: 'settings',
    label: 'Site settings',
    hint: 'Search and sharing text, the site address and optional analytics.',
    target: 'top',
    path: ['meta'],
    fields: [
      { kind: 'text', key: 'title', label: 'Page title', help: 'Shown in the browser tab and in search results.' },
      { kind: 'textarea', key: 'description', label: 'Description', rows: 3, help: 'Shown under the title in search results and link previews. Aim for one or two sentences.' },
      { kind: 'text', key: 'siteUrl', label: 'Site address', help: 'No trailing slash. Change this if you move to a custom domain.' },
      { kind: 'text', key: 'goatcounter', label: 'GoatCounter code (optional)', help: 'Free, cookie-less visit counts. Sign up at goatcounter.com, then enter only your code, e.g. "idhanth".' },
      { kind: 'text', key: 'repo', label: 'GitHub repository', help: 'owner/name. The editor commits here. Change only if you rename the repository.' },
      { kind: 'text', key: 'branch', label: 'Branch' },
    ],
  },
];

export const WRITING_FIELDS: Field[] = [
  { kind: 'text', key: 'title', label: 'Section title' },
  { kind: 'textarea', key: 'intro', label: 'Intro', rows: 2 },
];

export const POST_FIELDS: Field[] = [
  { kind: 'text', key: 'title', label: 'Title' },
  { kind: 'text', key: 'date', label: 'Date', placeholder: 'YYYY-MM-DD' },
  { kind: 'textarea', key: 'summary', label: 'Summary', rows: 2, help: 'One or two sentences. Also used for search results and link previews.' },
  { kind: 'tags', key: 'tags', label: 'Tags' },
  { kind: 'toggle', key: 'published', label: 'Published', help: 'Unpublished notes are left out of the site. The repository itself is public, though, so never put anything private in a draft.' },
];
