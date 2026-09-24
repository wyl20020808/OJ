/**
 * Payload encryption for transient Redis-held AI governance state.
 *
 * The idempotency replay cache holds consumer-visible terminal results for up to 15 minutes
 * (AI Bridge §14.3). Redis may persist (AOF/RDB), so payloads are encrypted at the boundary with
 * a key derived from an operator secret. Losing the key only loses the replay window — never
 * money, never learner data at rest — so no rotation machinery is needed in V1; the store simply
 * fails closed (unreadable entries are treated as absent).
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const FORMAT_VERSION = 'v1';
const IV_BYTES = 12;

/** Derive a store-encryption key from an operator secret (domain-separated from subject HMAC). */
export function deriveStoreEncryptionKey(operatorSecret: string): Buffer {
  return createHash('sha256')
    .update(`oj:aibridge:v1:store|${operatorSecret}`, 'utf8')
    .digest();
}

export function encryptPayload(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Decrypt, or return `null` for any malformed/wrong-key payload (fail closed, never throw). */
export function decryptPayload(key: Buffer, encoded: string): string | null {
  try {
    const [version, iv, tag, ciphertext] = encoded.split('.');
    if (
      version !== FORMAT_VERSION ||
      iv === undefined ||
      tag === undefined ||
      ciphertext === undefined
    ) {
      return null;
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
