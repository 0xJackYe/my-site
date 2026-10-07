import { mkdir, writeFile } from 'node:fs/promises';

// GitHub Pages cannot execute the password/session Worker. Keep old Pages
// links useful by forwarding to the canonical site, never publishing sources.
const canonical = 'https://jack-ye-oxjackye.realjackye.chatgpt.site/';
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jack Ye</title><link rel="canonical" href="${canonical}"><meta http-equiv="refresh" content="0;url=${canonical}"><style>body{background:#faf9f5;color:#141413;font:16px system-ui;padding:48px}a{color:inherit}</style></head><body><p>正在打开个人网站… <a href="${canonical}">点击继续</a></p><script>const target=new URL(${JSON.stringify(canonical)});target.search=location.search;target.hash=location.hash;location.replace(target.href);</script></body></html>`;
await mkdir('dist/pages', { recursive: true });
await Promise.all(['index.html', '404.html'].map(name => writeFile('dist/pages/' + name, html)));
console.log('Created public Pages redirect. No repository source or private data included.');
