// The shape of content/site.json. The admin editor and every component read this.

export type Lens = 'recruiter' | 'engineer' | 'friend';
export const LENSES: Lens[] = ['recruiter', 'engineer', 'friend'];
export const LENS_LABEL: Record<Lens, string> = {
  recruiter: 'Recruiter',
  engineer: 'Engineer',
  friend: 'Friend',
};

export interface LinkItem {
  label: string;
  url: string;
  kind: string; // github | linkedin | instagram | x | web
}

export interface Metric {
  id: string;
  label: string;
  before: number;
  after: number;
  unit: string;
  decimals: number;
  better: 'higher' | 'lower';
  delta: string;
  note: string;
}

export interface Story {
  title: string;
  impact: string;
  challenge: string;
  action: string;
  result: string;
}

export interface FlowStep {
  label: string;
  note: string;
}

export interface Track {
  id: string;
  title: string;
  tagline: string;
  summary: string;
  bullets: string[];
  metrics: string[];
  stack: string[];
  flow: FlowStep[];
  stories: Story[];
  /** A 3D illustration for this case file: "corpus", "fleet" or "" for none. */
  visual: string;
  /** The real count the illustration draws (documents, machines). */
  visualCount: number;
  visualCaption: string;
}

export interface AlsoItem {
  title: string;
  body: string;
}

export interface Experience {
  id: string;
  org: string;
  role: string;
  period: string;
  location: string;
  url: string;
  bullets: string[];
  tracks: Track[];
  also: AlsoItem[];
}

export interface Project {
  id: string;
  title: string;
  year: string;
  tagline: string;
  description: string;
  highlights: string[];
  stack: string[];
  tags: string[];
  live: string;
  repo: string;
  image: string;
  featured: boolean;
  status: string;
  statValue: string;
  statLabel: string;
  /** A 3D emblem for a featured card: waveform, lottery, rings, anvil, candles, graph, or "" for the drawn cover. */
  emblem: string;
}

export interface SkillGroup {
  group: string;
  items: string[];
}

export interface Principle {
  title: string;
  body: string;
}

export interface Education {
  school: string;
  degree: string;
  period: string;
  note: string;
}

export interface CommonItem {
  emoji: string;
  text: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  published: boolean;
}

export interface BriefFact {
  label: string;
  value: string;
}

export interface JumpLink {
  label: string;
  href: string;
}

export interface SiteContent {
  meta: {
    siteUrl: string;
    title: string;
    description: string;
    repo: string;
    branch: string;
    goatcounter: string;
  };
  profile: {
    name: string;
    role: string;
    focus: string;
    location: string;
    timezone: string;
    availability: string;
    email: string;
    photo: string;
    photoPosition: string;
    resume: string;
    links: LinkItem[];
  };
  hero: {
    headline: string;
    sub: Record<Lens, string>;
    /** The handwritten notes pinned to the 3D bottle, before and after the fix. */
    sceneBefore: string;
    sceneAfter: string;
    ticker: string[];
    instrumentTitle: string;
    instrumentNote: string;
  };
  brief: {
    recruiter: { title: string; facts: BriefFact[]; highlights: string[] };
    engineer: { title: string; body: string; jumps: JumpLink[]; tip: string };
    friend: { title: string; body: string; jumps: JumpLink[] };
  };
  metrics: Metric[];
  work: { title: string; intro: string; experience: Experience[] };
  projects: { title: string; intro: string; showGithubFeed: boolean; items: Project[] };
  skills: { title: string; intro: string; groups: SkillGroup[] };
  about: {
    title: string;
    bio: string[];
    principlesTitle: string;
    principles: Principle[];
    education: Education[];
    activities: string[];
    commonTitle: string;
    commonIntro: string;
    common: CommonItem[];
  };
  writing: { title: string; intro: string; posts: PostMeta[] };
  contact: { headline: string; sub: string };
  footer: { note: string };
}
