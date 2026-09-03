import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
const N = 16384;
const R = 8;
const P = 1;

export type PasswordVerificationDiagnostic = {
  ok: boolean;
  reason: 'match' | 'mismatch' | 'invalid-format' | 'error';
  algorithm: string;
  parameters: { n: number | null; r: number | null; p: number | null };
  saltLength: number;
  keyLength: number;
};

export function describePasswordHash(
  encoded: string,
): Omit<PasswordVerificationDiagnostic, 'ok' | 'reason'> {
  const [kind, nText, rText, pText, saltText = '', keyText = ''] =
    encoded.split('$');
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  return {
    algorithm: kind || 'unknown',
    parameters: {
      n: Number.isFinite(n) ? n : null,
      r: Number.isFinite(r) ? r : null,
      p: Number.isFinite(p) ? p : null,
    },
    saltLength: saltText.length,
    keyLength: keyText.length,
  };
}

export async function verifyPasswordDiagnostic(
  password: string,
  encoded: string,
): Promise<PasswordVerificationDiagnostic> {
  const metadata = describePasswordHash(encoded);
  try {
    const [kind, n, r, p, saltText, keyText] = encoded.split('$');
    if (
      kind !== 'scrypt' ||
      !saltText ||
      !keyText ||
      !Number.isInteger(Number(n)) ||
      !Number.isInteger(Number(r)) ||
      !Number.isInteger(Number(p))
    )
      return { ...metadata, ok: false, reason: 'invalid-format' };
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(keyText, 'base64url');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    const ok =
      actual.length === expected.length && timingSafeEqual(actual, expected);
    return { ...metadata, ok, reason: ok ? 'match' : 'mismatch' };
  } catch {
    return { ...metadata, ok: false, reason: 'error' };
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  return (await verifyPasswordDiagnostic(password, encoded)).ok;
}
export const sessionToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
