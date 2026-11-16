import './styles/index.css';
import { createRoot, hydrateRoot } from 'react-dom/client';
import siteJson from '../content/site.json';
import { App } from './App';
import { stripBase } from './lib/site';
import type { SiteContent } from './lib/types';

const root = document.getElementById('root')!;
const postBody = document.getElementById('post-body');

const app = (
  <App
    content={siteJson as unknown as SiteContent}
    initialRel={stripBase(location.pathname)}
    initialPostHtml={postBody ? postBody.innerHTML : null}
  />
);

// Production pages arrive prerendered and are hydrated; the dev server starts empty.
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);

console.info(
  '%cLooking under the hood?%c  The source is linked in the footer. Press Ctrl K, and try typing "sudo".',
  'font: 600 14px ui-serif, Georgia, serif',
  'font: 12px ui-monospace, monospace',
);
