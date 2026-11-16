# idhanth17.github.io

My portfolio: <https://idhanth17.github.io/>

A React site that is prerendered to plain HTML (fast, and readable by search engines), with 3D scenes drawn in three.js and an editor that only I can publish from.

## Editing the site

Open <https://idhanth17.github.io/admin/> and sign in with a GitHub token.

1. Go to [GitHub → New fine-grained token](https://github.com/settings/personal-access-tokens/new).
2. Repository access: **Only select repositories** → `idhanth17.github.io`.
3. Repository permissions: **Contents → Read and write**. Nothing else.
4. Pick a short expiration (30 or 90 days), generate it, and paste it into the editor.

Change anything, watch the live preview, press **Publish**. That makes one commit; the site rebuilds and is live about a minute later. Every publish is in the commit history, so any version can be brought back.

Why this is safe: the editor page is public, but it can do nothing without a token that GitHub accepts for this repository. The token is kept for the browser tab only and is sent to `api.github.com` and nowhere else. Because it is limited to this one repository, the worst a leaked token could do is change this site.

Unpublished notes are left out of the built site, but this repository is public, so don't put anything private in a draft.

## Where things are

| Path | What |
| --- | --- |
| `content/site.json` | Every word and number on the site. The editor writes this file. |
| `content/posts/*.md` | The text of each note. |
| `public/` | Files served as they are: `resume.pdf`, `og.png`, uploaded images. |
| `src/components/` | The page sections. |
| `src/three/` | The 3D scenes and the small engine that runs them. |
| `src/admin/` | The editor. |
| `scripts/prerender.mjs` | Writes one HTML file per page, plus the sitemap. |
| `resume/resume.html` | Source of the public résumé PDF. |

## Working on it locally

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run og` redraws the link-preview image (`public/og.png`) and reprints `public/resume.pdf` from `resume/resume.html`. It needs Chrome or Edge installed. Run it after changing the headline or the résumé, then commit the two files.

To try the editor without touching the real repository, run `node scripts/mock-github.mjs` next to `npm run dev` and open <http://localhost:5173/admin/?api=http://localhost:8787>. Any made-up token signs in.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages. In the repository's **Settings → Pages**, the source must be **GitHub Actions**.

To use a custom domain, set it in Settings → Pages and change the site address in the editor under **Site settings**. To host it under a sub-path instead, build with `SITE_BASE=/your-path/`.
