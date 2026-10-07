import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, buildHistory } from './bitcoin-balance-core.mjs';

const root = new URL('../', import.meta.url);
const snapshot = JSON.parse(await readFile(new URL('outputs/bitcoin-balance-snapshot.json', root), 'utf8'));
snapshot.fx = JSON.parse(await readFile(new URL('outputs/bitcoin-cny-rates.json', root), 'utf8'));
validateSnapshot(snapshot);
const history = buildHistory(snapshot);
const template = await readFile(new URL('tools/bitcoin-balance.template.html', root), 'utf8');
const core = (await readFile(new URL('tools/bitcoin-balance-core.mjs', root), 'utf8')).replace(/^export\s+/gm, '');
const html = template.replace('/* __BALANCE_CORE__ */', () => core)
  .replace('__SNAPSHOT_JSON__', () => JSON.stringify(snapshot).replace(/</g, '\\u003c'));
const target = new URL('outputs/bitcoin-balance.html', root);
await writeFile(target, html, 'utf8');
console.log(JSON.stringify({file:fileURLToPath(target), balanceSats:history.balanceSats, transactions:history.transactions.length, points:history.points.length}));
