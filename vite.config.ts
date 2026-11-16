import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// The editor page handles a GitHub token, so its production build gets a strict
// Content-Security-Policy: scripts may only load from this site, and the page may
// only fetch from this site and api.github.com. That removes the usual ways a
// script could be injected or could post the token to another server.
// It is one layer, not a guarantee: the real limit on damage is that the token
// should be scoped to this one repository (see README).
const EDITOR_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function editorCsp(): Plugin {
  return {
    name: 'editor-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.filename.replace(/\\/g, '/').endsWith('/admin/index.html')) return html;
        return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${EDITOR_CSP}" />`);
      },
    },
  };
}

// Unpublished notes must not reach visitors. Their titles and summaries live in
// content/site.json, so the built site gets a copy with the drafts removed.
// (The editor reads the full file from GitHub, not from this bundle.)
function stripDraftNotes(): Plugin {
  return {
    name: 'strip-draft-notes',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').split('?')[0].endsWith('/content/site.json')) return null;
      const data = JSON.parse(code);
      data.writing.posts = data.writing.posts.filter((p: { published?: boolean }) => p.published);
      return { code: JSON.stringify(data), map: null };
    },
  };
}

// SITE_BASE lets the same build run under a sub-path (e.g. /portfolio/).
// It defaults to "/" which is right for idhanth17.github.io, Vercel and custom domains.
export default defineConfig(({ isSsrBuild }) => ({
  base: process.env.SITE_BASE || '/',
  plugins: [stripDraftNotes(), react(), editorCsp()],
  build: {
    target: 'es2022',
    rollupOptions: isSsrBuild
      ? {}
      : { input: { main: root + 'index.html', admin: root + 'admin/index.html' } },
  },
  server: { port: 5173 },
}));
