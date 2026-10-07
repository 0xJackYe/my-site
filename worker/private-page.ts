interface EncryptedPage {
  version: number;
  iv: string;
  ciphertext: string;
}

/** Only called after server-side session validation. No decryption key is shipped to clients. */
export async function decryptPrivatePage(rawConfig: string | undefined, payload: EncryptedPage): Promise<string> {
  const config = JSON.parse(rawConfig || '{}');
  if (payload.version !== 1 || !/^[a-f0-9]{24}$/.test(payload.iv) || !/^[a-f0-9]{32}$/.test(config.salt || '') || !/^[a-f0-9]{64}$/.test(config.hash || '')) {
    throw new Error('Private document configuration is unavailable');
  }
  const material = new TextEncoder().encode('terminal-page:v1:' + config.salt + ':' + config.hash);
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', material), 'AES-GCM', false, ['decrypt']);
  const iv = Uint8Array.from(payload.iv.match(/../g)!, byte => parseInt(byte, 16));
  const ciphertext = Uint8Array.from(atob(payload.ciphertext), byte => byte.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
