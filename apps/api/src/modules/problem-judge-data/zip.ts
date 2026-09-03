import { inflateRawSync } from 'node:zlib';
import { JudgeDataError } from './model.js';
import {
  MAX_ARCHIVE_COMPRESSED_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_TESTCASE_PAYLOAD_BYTES,
} from './limits.js';

const MAX_ENTRIES = MAX_ARCHIVE_ENTRIES;
const MAX_FILE = MAX_TESTCASE_PAYLOAD_BYTES;
const MAX_TOTAL = MAX_ARCHIVE_UNCOMPRESSED_BYTES;
const MAX_DEPTH = 8;
const MAX_RATIO = 1000;
const testcaseFile = /^(.*)\.(in|out|ans|txt)$/i;
export type ZipPair = { name: string; input: Uint8Array; output: Uint8Array };

const unsafe = (message = 'Unsafe archive') =>
  new JudgeDataError('UNSAFE_ARCHIVE', message);

function normalizedName(raw: string) {
  const name = raw.normalize('NFKC');
  if (
    !name ||
    name.length > 255 ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(name) ||
    name.split('/').some((part) => part === '..' || part === '') ||
    name.split('/').length > MAX_DEPTH ||
    name.endsWith('/')
  )
    throw unsafe('Unsafe archive path');
  return name;
}

export function parseZip(bytes: Uint8Array): ZipPair[] {
  try {
    const b = Buffer.from(bytes);
    const eocd = findEocd(b);
    const count = b.readUInt16LE(eocd + 10);
    const centralSize = b.readUInt32LE(eocd + 12);
    const centralOffset = b.readUInt32LE(eocd + 16);
    if (!count || count > MAX_ENTRIES || centralOffset + centralSize > b.length)
      throw unsafe();
    let p = centralOffset;
    let total = 0;
    let compressedTotal = 0;
    const seen = new Set<string>();
    const inputs = new Map<string, Uint8Array>();
    const outputs = new Map<string, Uint8Array[]>();
    for (let i = 0; i < count; i++) {
      if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw unsafe();
      const madeBy = b.readUInt16LE(p + 4);
      const flags = b.readUInt16LE(p + 8);
      const method = b.readUInt16LE(p + 10);
      const csize = b.readUInt32LE(p + 20);
      const usize = b.readUInt32LE(p + 24);
      const nlen = b.readUInt16LE(p + 28);
      const elen = b.readUInt16LE(p + 30);
      const clen = b.readUInt16LE(p + 32);
      const external = b.readUInt32LE(p + 38);
      const localOffset = b.readUInt32LE(p + 42);
      const rawName = b.subarray(p + 46, p + 46 + nlen).toString('utf8');
      const isDirectory = rawName.endsWith('/');
      const name = normalizedName(isDirectory ? rawName.slice(0, -1) : rawName);
      const collisionKey = name.toLocaleLowerCase('en-US');
      if (seen.has(collisionKey))
        throw new JudgeDataError('DUPLICATE', 'Duplicate archive entry');
      seen.add(collisionKey);
      const unixType = (external >>> 16) & 0xf000;
      if (
        flags & 1 ||
        (!isDirectory && external & 0x10) ||
        (madeBy >> 8 === 3 &&
          unixType !== 0x8000 &&
          !(isDirectory && unixType === 0x4000))
      )
        throw unsafe('Unsupported archive entry');
      if (csize > MAX_FILE || usize > MAX_FILE || usize > MAX_TOTAL - total)
        throw unsafe('Archive exceeds size limits');
      if (csize > MAX_ARCHIVE_COMPRESSED_BYTES - compressedTotal)
        throw unsafe('Archive exceeds compressed size limits');
      if (csize > 0 && usize > csize * MAX_RATIO)
        throw unsafe('Archive compression ratio exceeded');
      if (
        localOffset + 30 > b.length ||
        b.readUInt32LE(localOffset) !== 0x04034b50
      )
        throw unsafe('Invalid local header');
      const localNameLength = b.readUInt16LE(localOffset + 26);
      const localExtraLength = b.readUInt16LE(localOffset + 28);
      const localMethod = b.readUInt16LE(localOffset + 8);
      const localCompressedSize = b.readUInt32LE(localOffset + 18);
      const localSize = b.readUInt32LE(localOffset + 22);
      const usesDataDescriptor = Boolean(flags & 0x08);
      const localSizesMatch =
        localCompressedSize === csize && localSize === usize;
      const deferredLocalSizes =
        usesDataDescriptor && localCompressedSize === 0 && localSize === 0;
      const localNameRaw = b
        .subarray(localOffset + 30, localOffset + 30 + localNameLength)
        .toString('utf8');
      const localName = (
        isDirectory && localNameRaw.endsWith('/')
          ? localNameRaw.slice(0, -1)
          : localNameRaw
      ).normalize('NFKC');
      if (
        localName !== name ||
        localMethod !== method ||
        (!localSizesMatch && !deferredLocalSizes)
      )
        throw unsafe('Header mismatch');
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const end = start + csize;
      if (end > b.length) throw unsafe('Truncated archive');
      total += usize;
      compressedTotal += csize;
      const match = isDirectory ? null : testcaseFile.exec(name);
      if (!match) {
        p += 46 + nlen + elen + clen;
        continue;
      }
      const compressed = b.subarray(start, end);
      const data =
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed, { maxOutputLength: MAX_FILE + 1 })
            : null;
      if (!data || data.length !== usize)
        throw unsafe('Unsupported or corrupt archive');
      if (!match[1])
        throw new JudgeDataError('INVALID_PAIR', 'Invalid testcase name');
      const key = (match[1] ?? '').replace(/^0+/, '') || '0';
      if (match[2]!.toLowerCase() === 'in') {
        if (inputs.has(key))
          throw new JudgeDataError('DUPLICATE', 'Duplicate input pair');
        inputs.set(key, Uint8Array.from(data));
      } else {
        const candidates = outputs.get(key) ?? [];
        candidates.push(Uint8Array.from(data));
        outputs.set(key, candidates);
      }
      p += 46 + nlen + elen + clen;
    }
    if (p !== centralOffset + centralSize)
      throw unsafe('Invalid central directory');
    const result: ZipPair[] = [];
    for (const [name, input] of inputs) {
      const output = outputs.get(name);
      if (!output?.length)
        throw new JudgeDataError('INVALID_PAIR', 'Missing input/output pair');
      if (output.length > 1)
        throw new JudgeDataError('DUPLICATE', 'Duplicate output pair');
      result.push({ name, input, output: output[0]! });
    }
    if (!result.length)
      throw new JudgeDataError('INVALID_PAIR', 'No testcase pairs');
    return result.sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { numeric: true }),
    );
  } catch (error) {
    if (error instanceof JudgeDataError) throw error;
    throw unsafe();
  }
}

function findEocd(b: Buffer) {
  const min = Math.max(0, b.length - 0xffff - 22);
  for (let p = b.length - 22; p >= min; p--) {
    if (b.readUInt32LE(p) !== 0x06054b50) continue;
    const comment = b.readUInt16LE(p + 20);
    if (p + 22 + comment === b.length) return p;
  }
  throw unsafe('Invalid archive');
}
