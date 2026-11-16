// A minimal GitHub API client for the editor. It talks to api.github.com only,
// with a token the owner pastes in. GitHub, not this page, decides who may write.
//
// This file has no imports on purpose: scripts/selftest-github.mjs runs it in Node too.

const DEFAULT_API = 'https://api.github.com';

export interface GitHubConfig {
  token: string;
  repo: string; // "owner/name"
  branch: string;
  api?: string; // overridden only by the local mock used in development tests
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

async function call<T>(cfg: Pick<GitHubConfig, 'token' | 'api'>, path: string, init: { method?: string; body?: unknown; anonymous?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (!init.anonymous && cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch((cfg.api || DEFAULT_API) + path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    throw new GitHubError(0, 'Could not reach GitHub. Check your connection and try again.');
  }
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      /* keep the status text */
    }
    throw new GitHubError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- base64 helpers that are safe for UTF-8 and for large files -----------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToText(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

// ---- reads ----------------------------------------------------------------

export interface Viewer {
  login: string;
  name: string | null;
  avatar_url: string;
}

export function getViewer(cfg: GitHubConfig): Promise<Viewer> {
  return call<Viewer>(cfg, '/user');
}

export interface RepoAccess {
  canPush: boolean;
  isPrivate: boolean;
  defaultBranch: string;
}

export async function getRepoAccess(cfg: GitHubConfig): Promise<RepoAccess> {
  const r = await call<{ private: boolean; default_branch: string; permissions?: { push?: boolean } }>(cfg, `/repos/${cfg.repo}`);
  return { canPush: !!r.permissions?.push, isPrivate: r.private, defaultBranch: r.default_branch };
}

export interface RepoFile {
  text: string;
  sha: string;
}

/** Encode a repository path for a URL, refusing anything that could climb out of it. */
const encodePath = (p: string) =>
  p
    .split('/')
    .map((segment) => {
      if (segment === '' || segment === '.' || segment === '..') throw new GitHubError(0, `“${p}” is not a valid path.`);
      return encodeURIComponent(segment);
    })
    .join('/');

/**
 * Refuse repository or branch names that could steer a request somewhere else on
 * api.github.com. Both come from the site's own settings, but they are checked anyway
 * because every request carries the owner's token.
 */
export function validateConfig(cfg: GitHubConfig) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(cfg.repo) || cfg.repo.split('/').some((s) => s === '.' || s === '..')) {
    throw new GitHubError(0, 'The repository name in Site settings is not valid. It should look like “owner/name”.');
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(cfg.branch) || cfg.branch.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new GitHubError(0, 'The branch name in Site settings is not valid.');
  }
}

/** Read a text file at a branch or commit. Returns null when it does not exist. */
export async function readFile(cfg: GitHubConfig, path: string, ref?: string): Promise<RepoFile | null> {
  try {
    const f = await call<{ content?: string; encoding?: string; sha: string }>(cfg, `/repos/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref ?? cfg.branch)}`);
    if (typeof f.content === 'string' && f.encoding === 'base64' && f.content !== '') return { text: base64ToText(f.content), sha: f.sha };
    // Files over 1 MB come back without content; fetch the blob instead.
    const blob = await call<{ content: string }>(cfg, `/repos/${cfg.repo}/git/blobs/${f.sha}`);
    return { text: base64ToText(blob.content), sha: f.sha };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
}

export interface Head {
  commit: string;
  tree: string;
}

export async function getHead(cfg: GitHubConfig): Promise<Head> {
  const ref = await call<{ object: { sha: string } }>(cfg, `/repos/${cfg.repo}/git/ref/heads/${encodePath(cfg.branch)}`);
  const commit = await call<{ tree: { sha: string } }>(cfg, `/repos/${cfg.repo}/git/commits/${ref.object.sha}`);
  return { commit: ref.object.sha, tree: commit.tree.sha };
}

// ---- writes ---------------------------------------------------------------

export type FileChange =
  | { path: string; text: string }
  | { path: string; base64: string }
  | { path: string; remove: true };

/**
 * Write several files in ONE commit on top of `head`, then move the branch to it.
 * The branch update is not forced: if someone else pushed in between, GitHub
 * rejects it (422) and nothing is lost.
 */
export async function commitFiles(cfg: GitHubConfig, head: Head, changes: FileChange[], message: string): Promise<string> {
  const tree: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string | null }> = [];
  for (const change of changes) {
    if ('remove' in change) {
      tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blob = await call<{ sha: string }>(cfg, `/repos/${cfg.repo}/git/blobs`, {
      method: 'POST',
      body: 'text' in change ? { content: change.text, encoding: 'utf-8' } : { content: change.base64, encoding: 'base64' },
    });
    tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await call<{ sha: string }>(cfg, `/repos/${cfg.repo}/git/trees`, { method: 'POST', body: { base_tree: head.tree, tree } });
  const commit = await call<{ sha: string }>(cfg, `/repos/${cfg.repo}/git/commits`, {
    method: 'POST',
    body: { message, tree: newTree.sha, parents: [head.commit] },
  });
  await call(cfg, `/repos/${cfg.repo}/git/refs/heads/${encodePath(cfg.branch)}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
  return commit.sha;
}

// ---- deploy status --------------------------------------------------------

export interface DeployRun {
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | ...
  url: string;
}

/** The GitHub Actions run for a commit, if one has started. Falls back to an anonymous request for public repos. */
export async function getDeployRun(cfg: GitHubConfig, commit: string): Promise<DeployRun | null> {
  const path = `/repos/${cfg.repo}/actions/runs?head_sha=${commit}&per_page=1`;
  type Runs = { workflow_runs: Array<{ status: string; conclusion: string | null; html_url: string }> };
  let data: Runs;
  try {
    data = await call<Runs>(cfg, path);
  } catch (e) {
    if (!(e instanceof GitHubError) || (e.status !== 403 && e.status !== 404)) throw e;
    data = await call<Runs>(cfg, path, { anonymous: true });
  }
  const run = data.workflow_runs[0];
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : null;
}

/**
 * Check that the token can really write, without changing anything visible:
 * a blob that no commit points to is invisible and is garbage-collected by GitHub.
 * (The repository's `permissions` field describes the user, not the token.)
 */
export async function canWrite(cfg: GitHubConfig): Promise<boolean> {
  try {
    await call(cfg, `/repos/${cfg.repo}/git/blobs`, { method: 'POST', body: { content: 'write check', encoding: 'utf-8' } });
    return true;
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) return false;
    throw e;
  }
}
