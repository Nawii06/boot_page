import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
const keyLength = 64;

/** Passwords are never trimmed or normalized. Spaces and Unicode remain significant. */
export function passwordWithinLimits(password: unknown): password is string {
  if (typeof password !== 'string' || password.length > 256 || Buffer.byteLength(password, 'utf8') > 512) return false;
  const length = Array.from(password).length;
  return length >= 15 && length <= 128;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, parameters, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!passwordWithinLimits(password)) throw new Error('Password must contain 15 to 128 characters (up to 512 UTF-8 bytes).');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Fixed, bounded parameters prevent database corruption from requesting excessive work. */
export async function verifyPassword(password: unknown, encoded: string): Promise<boolean> {
  if (!passwordWithinLimits(password)) return false;
  const parts = /^scrypt\$32768\$8\$3\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/.exec(encoded);
  if (!parts) return false;
  const salt = Buffer.from(parts[1], 'base64url');
  const expected = Buffer.from(parts[2], 'base64url');
  if (salt.length !== 16 || expected.length !== keyLength || salt.toString('base64url') !== parts[1] || expected.toString('base64url') !== parts[2]) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
