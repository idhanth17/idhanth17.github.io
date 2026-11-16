// An in-memory stand-in for the parts of the GitHub API the editor uses.
// It exists ONLY to test the editor locally without touching the real repository:
//
//   node scripts/mock-github.mjs            (listens on http://localhost:8787)
//   npm run dev                             (in another terminal)
//   open http://localhost:5173/admin/?api=http://localhost:8787
//
// Sign in with any made-up token. Two special values exercise the error paths:
//   "bad-token"      -> GitHub rejects the token (401)
//   "readonly-token" -> the token can read but not write (403 on writes)
//
// The production build ignores ?api=, so none of this can affect the live site.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 8787);
const root = fileURLToPath(new URL('..', import.meta.url));

const sha1 = (data) => createHash('sha1').update(data).digest('hex');
const blobSha = (buf) => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

const blobs = new Map(); // blob sha -> Buffer
const trees = new Map(); // tree sha -> Map(path -> blob sha)
const commits = new Map(); // commit sha -> { tree, parents, message }
const runPolls = new Map(); // commit sha -> how many times its deploy status was asked for
let head = '';

function addBlob(buf) {
  const sha = blobSha(buf);
  blobs.set(sha, buf);
  return sha;
}

function addTree(entries) {
  const sha = sha1(JSON.stringify([...entries].sort()));
  trees.set(sha, new Map(entries));
  return sha;
}

function addCommit(tree, parents, message) {
  const sha = sha1(`${tree}\n${parents.join(',')}\n${message}\n${commits.size}`);
  commits.set(sha, { tree, parents, message });
  return sha;
}

// Seed the fake repository from the working copy.
{
  const seed = new Map();
  seed.set('content/site.json', addBlob(readFileSync(root + 'content/site.json')));
  const posts = root + 'content/posts';
  if (existsSync(posts)) for (const f of readdirSync(posts)) if (f.endsWith('.md')) seed.set(`content/posts/${f}`, addBlob(readFileSync(`${posts}/${f}`)));
  head = addCommit(addTree(seed), [], 'seed');
}

const treeAt = (ref) => {
  const commit = commits.get(ref === 'main' || !ref ? head : ref);
  return commit ? trees.get(commit.tree) : undefined;
};

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch {
      return send(res, 400, { message: 'Problems parsing JSON' });
    }
    const write = req.method === 'POST' || req.method === 'PATCH';

    // ---- test helpers (not part of GitHub) ----
    if (path === '/__state') {
      const tree = treeAt('main');
      return send(res, 200, {
        head,
        message: commits.get(head).message,
        commits: commits.size,
        files: [...tree].map(([p, sha]) => ({ path: p, bytes: blobs.get(sha).length })),
      });
    }
    if (path === '/__file') {
      const sha = treeAt('main').get(url.searchParams.get('path') || '');
      return sha ? send(res, 200, { text: blobs.get(sha).toString('utf8') }) : send(res, 404, { message: 'Not Found' });
    }
    if (path === '/__touch') {
      // Simulate an edit made somewhere else, to exercise the editor's conflict handling.
      const tree = new Map(treeAt('main'));
      const json = JSON.parse(blobs.get(tree.get('content/site.json')).toString('utf8'));
      json.footer.note = `Changed elsewhere (${commits.size})`;
      tree.set('content/site.json', addBlob(Buffer.from(JSON.stringify(json, null, 2) + '\n')));
      head = addCommit(addTree(tree), [head], 'edit from another device');
      return send(res, 200, { head });
    }

    // ---- GitHub ----
    const runs = /^\/repos\/[^/]+\/[^/]+\/actions\/runs$/.test(path);
    if (!runs) {
      if (!token || token === 'bad-token') return send(res, 401, { message: 'Bad credentials' });
      if (write && token === 'readonly-token') return send(res, 403, { message: 'Resource not accessible by personal access token' });
    }

    if (path === '/user') return send(res, 200, { login: 'idhanth17', name: 'Idhanth Karthik', avatar_url: 'https://avatars.githubusercontent.com/u/139066504?v=4' });

    const m = /^\/repos\/[^/]+\/[^/]+(\/.*)?$/.exec(path);
    if (!m) return send(res, 404, { message: 'Not Found' });
    const rest = m[1] || '';

    if (rest === '') return send(res, 200, { private: false, default_branch: 'main', permissions: { pull: true, push: true, admin: true } });

    if (rest.startsWith('/contents/')) {
      const tree = treeAt(url.searchParams.get('ref'));
      const sha = tree?.get(rest.slice('/contents/'.length));
      if (!sha) return send(res, 404, { message: 'Not Found' });
      return send(res, 200, { sha, encoding: 'base64', content: blobs.get(sha).toString('base64') });
    }

    if (rest === '/git/ref/heads/main') return send(res, 200, { object: { sha: head } });

    if (rest.startsWith('/git/commits/')) {
      const commit = commits.get(rest.slice('/git/commits/'.length));
      return commit ? send(res, 200, { tree: { sha: commit.tree } }) : send(res, 404, { message: 'Not Found' });
    }

    if (rest.startsWith('/git/blobs/')) {
      const blob = blobs.get(rest.slice('/git/blobs/'.length));
      return blob ? send(res, 200, { encoding: 'base64', content: blob.toString('base64') }) : send(res, 404, { message: 'Not Found' });
    }

    if (rest === '/git/blobs' && req.method === 'POST') {
      return send(res, 201, { sha: addBlob(Buffer.from(String(body.content ?? ''), body.encoding === 'base64' ? 'base64' : 'utf8')) });
    }

    if (rest === '/git/trees' && req.method === 'POST') {
      const base = trees.get(body.base_tree);
      if (!base) return send(res, 422, { message: 'base_tree is not a valid tree' });
      const next = new Map(base);
      for (const item of body.tree || []) {
        if (item.sha === null) {
          if (!next.has(item.path)) return send(res, 422, { message: `GitRPC::BadObjectState: ${item.path} does not exist` });
          next.delete(item.path);
        } else if (!blobs.has(item.sha)) return send(res, 422, { message: 'tree.sha is not a valid blob' });
        else next.set(item.path, item.sha);
      }
      return send(res, 201, { sha: addTree(next) });
    }

    if (rest === '/git/commits' && req.method === 'POST') {
      if (!trees.has(body.tree)) return send(res, 422, { message: 'Tree SHA does not exist' });
      return send(res, 201, { sha: addCommit(body.tree, body.parents || [], String(body.message || '')) });
    }

    if (rest === '/git/refs/heads/main' && req.method === 'PATCH') {
      const commit = commits.get(body.sha);
      if (!commit) return send(res, 422, { message: 'Object does not exist' });
      if (!body.force && commit.parents[0] !== head) return send(res, 422, { message: 'Update is not a fast forward' });
      head = body.sha;
      return send(res, 200, { object: { sha: head } });
    }

    if (runs) {
      // Pretend a build takes a few polls: nothing yet -> queued -> in progress -> success.
      const sha = url.searchParams.get('head_sha') || '';
      const n = (runPolls.get(sha) || 0) + 1;
      runPolls.set(sha, n);
      if (n === 1) return send(res, 200, { workflow_runs: [] });
      const run = n === 2 ? { status: 'queued', conclusion: null } : n === 3 ? { status: 'in_progress', conclusion: null } : { status: 'completed', conclusion: 'success' };
      return send(res, 200, { workflow_runs: [{ ...run, html_url: 'https://github.com/idhanth17/idhanth17.github.io/actions' }] });
    }

    send(res, 404, { message: `The mock has no route for ${req.method} ${path}` });
  });
});

server.listen(PORT, () => console.log(`Mock GitHub API listening on http://localhost:${PORT}`));
