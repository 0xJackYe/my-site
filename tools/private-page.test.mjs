import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import ts from 'typescript';

const source = await readFile(new URL('../worker/private-page.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { decryptPrivatePage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const config = { salt: 'ab'.repeat(16), hash: 'cd'.repeat(32) };
const raw = JSON.stringify(config);

function envelope(document) {
  const key = createHash('sha256').update('terminal-page:v1:' + config.salt + ':' + config.hash).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  return { version: 1, iv: iv.toString('hex'), ciphertext: Buffer.concat([cipher.update(document), cipher.final(), cipher.getAuthTag()]).toString('base64') };
}

test('private page decrypts with the server configuration; JSON whitespace is irrelevant', async () => {
  const document = '<!doctype html><html lang="zh"><body>仅测试用的私有页面</body></html>';
  const encrypted = envelope(document);
  assert.equal(await decryptPrivatePage(raw, encrypted), document);
  assert.equal(await decryptPrivatePage(JSON.stringify(config, null, 2), encrypted), document);
});

test('missing or different server configuration cannot decrypt the document', async () => {
  const encrypted = envelope('private test document');
  await assert.rejects(decryptPrivatePage(undefined, encrypted));
  await assert.rejects(decryptPrivatePage(JSON.stringify({ ...config, hash: 'ef'.repeat(32) }), encrypted));
});

test('tampered ciphertext and unsupported envelopes are rejected', async () => {
  const encrypted = envelope('private test document');
  const tampered = Buffer.from(encrypted.ciphertext, 'base64');
  tampered[0] ^= 1;
  await assert.rejects(decryptPrivatePage(raw, { ...encrypted, ciphertext: tampered.toString('base64') }));
  await assert.rejects(decryptPrivatePage(raw, { ...encrypted, version: 2 }));
  await assert.rejects(decryptPrivatePage(raw, { ...encrypted, iv: 'invalid' }));
});
