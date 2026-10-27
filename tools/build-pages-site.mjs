import { cp, mkdir, rm } from 'node:fs/promises';

// The public site is a single static page plus its assets, so GitHub Pages
// can serve it directly. Publish only those files, never repository sources.
const out = 'dist/pages';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('index.html', `${out}/index.html`);
await cp('public/assets', `${out}/assets`, {
  recursive: true,
  filter: source => !source.endsWith('private-entry.js'),
});
await cp('public/trip photos', `${out}/trip photos`, { recursive: true });
console.log(`Built static site in ${out}.`);
