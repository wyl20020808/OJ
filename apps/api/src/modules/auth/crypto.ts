import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
const N = 16384;
const R = 8;
const P = 1;
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  try {
    const [kind, n, r, p, saltText, keyText] = encoded.split('$');
    if (kind !== 'scrypt') return false;
    if (!saltText || !keyText) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(keyText, 'base64url');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
export const sessionToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
