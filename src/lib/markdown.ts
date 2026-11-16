import { Marked } from 'marked';

// Notes are written in Markdown. Raw HTML inside a note is shown as text rather than
// run, and links or images may only point at web addresses, so a note can never
// carry a script onto the site.

const SAFE_TARGET = /^(https?:|mailto:|\/(?!\/)|#)/i;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const md = new Marked({ gfm: true });
md.use({
  walkTokens(token) {
    if (token.type === 'link' || token.type === 'image') {
      if (!SAFE_TARGET.test(String(token.href).trim())) token.href = '#';
    } else if (token.type === 'html') {
      token.text = escapeHtml(token.text);
    }
  },
});

export function renderMarkdown(source: string): string {
  return md.parse(source, { async: false });
}
