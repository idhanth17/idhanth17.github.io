import '../styles/index.css';
import './admin.css';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';

// Match the reader's theme. Done here rather than inline in the HTML so the page
// can run under a strict Content-Security-Policy (no inline scripts at all).
try {
  const saved = localStorage.getItem('ik:theme');
  const theme = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
} catch {
  /* keep the default light theme */
}

const root = createRoot(document.getElementById('admin')!);

// The editor refuses to run inside another page's frame, where its buttons could be
// covered or clicked on someone's behalf.
if (window.top !== window.self) {
  root.render(
    <main className="ad-signin">
      <p className="ad-empty">For safety, the editor only opens in its own tab.</p>
    </main>,
  );
} else {
  root.render(<AdminApp />);
}
