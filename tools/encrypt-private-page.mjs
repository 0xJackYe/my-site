import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { resolve, dirname } from 'node:path';

// The full HTML stays local. The committed envelope can only be opened using
// the server's private access configuration, never the six-digit PIN alone.
const input = resolve(process.argv[2] || 'outputs/bitcoin-balance.html');
const output = resolve('private/terminal.enc.json');
const localEnv = await readFile('.dev.vars', 'utf8').then(parseEnv).catch(() => ({}));
const config = JSON.parse(process.env.PRIVATE_ACCESS_CONFIG || localEnv.PRIVATE_ACCESS_CONFIG || '{}');
if (!/^[a-f0-9]{32}$/.test(config.salt || '') || !/^[a-f0-9]{64}$/.test(config.hash || '')) {
  throw new Error('Set PRIVATE_ACCESS_CONFIG in the ignored .dev.vars or process environment.');
}
const key = createHash('sha256').update('terminal-page:v1:' + config.salt + ':' + config.hash).digest();
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const plaintext = await readFile(input);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ version: 1, iv: iv.toString('hex'), ciphertext: ciphertext.toString('base64') }) + '\n');
console.log('Encrypted private page written. Plaintext and server credentials remain local.');
