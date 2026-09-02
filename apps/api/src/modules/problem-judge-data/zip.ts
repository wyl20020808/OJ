import { inflateRawSync } from 'node:zlib';
import { JudgeDataError } from './model.js';
const MAX_ENTRIES = 256,
  MAX_FILE = 16 * 1024 * 1024,
  MAX_TOTAL = 128 * 1024 * 1024;
export type ZipPair = { name: string; input: Uint8Array; output: Uint8Array };
export function parseZip(bytes: Uint8Array): ZipPair[] {
  const b = Buffer.from(bytes),
    out = new Map<string, { input?: Uint8Array; output?: Uint8Array }>();
  let p = 0,
    total = 0,
    count = 0;
  while (p + 4 <= b.length && b.readUInt32LE(p) === 0x04034b50) {
    count++;
    if (count > MAX_ENTRIES)
      throw new JudgeDataError('UNSAFE_ARCHIVE', 'Too many entries');
    const flags = b.readUInt16LE(p + 6),
      method = b.readUInt16LE(p + 8),
      csize = b.readUInt32LE(p + 18),
      usize = b.readUInt32LE(p + 22),
      nlen = b.readUInt16LE(p + 26),
      elen = b.readUInt16LE(p + 28);
    if (
      flags & 8 ||
      csize > MAX_FILE ||
      usize > MAX_FILE ||
      usize + total > MAX_TOTAL
    )
      throw new JudgeDataError('UNSAFE_ARCHIVE', 'Unsafe archive');
    const name = b
      .subarray(p + 30, p + 30 + nlen)
      .toString('utf8')
      .normalize('NFKC');
    if (
      !name ||
      name.length > 255 ||
      name.split('/').length > 8 ||
      name.startsWith('/') ||
      /^[A-Za-z]:[\\/]/.test(name) ||
      name.split('/').includes('..') ||
      name.includes('\\')
    )
      throw new JudgeDataError('UNSAFE_ARCHIVE', 'Unsafe archive path');
    if (out.has(name))
      throw new JudgeDataError('DUPLICATE', 'Duplicate archive entry');
    const start = p + 30 + nlen + elen,
      end = start + csize;
    if (end > b.length)
      throw new JudgeDataError('UNSAFE_ARCHIVE', 'Truncated archive');
    const data =
      method === 0
        ? b.subarray(start, end)
        : method === 8
          ? inflateRawSync(b.subarray(start, end))
          : null;
    if (!data || data.length !== usize)
      throw new JudgeDataError(
        'UNSAFE_ARCHIVE',
        'Unsupported or corrupt archive',
      );
    total += data.length;
    const m = /^(.*)\.(in|out)$/i.exec(name);
    if (m) {
      const key = m[1]!.replace(/^0+/, '') || '0';
      const pair = out.get(key) ?? {};
      if (m[2]!.toLowerCase() === 'in') pair.input = Uint8Array.from(data);
      else pair.output = Uint8Array.from(data);
      out.set(key, pair);
    }
    p = end;
  }
  if (p === 0 || p !== b.length)
    throw new JudgeDataError('UNSAFE_ARCHIVE', 'Invalid archive');
  const pairs: ZipPair[] = [];
  for (const [name, v] of out) {
    if (!v.input || !v.output)
      throw new JudgeDataError('INVALID_PAIR', 'Missing input/output pair');
    pairs.push({ name, input: v.input, output: v.output });
  }
  if (!pairs.length)
    throw new JudgeDataError('INVALID_PAIR', 'No testcase pairs');
  return pairs.sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { numeric: true }),
  );
}
