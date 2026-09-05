import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32 } from 'node:zlib';
import { open, type Entry, type ZipFile } from 'yauzl';
import { JudgeDataError } from './model.js';
import {
  MAX_ARCHIVE_COMPRESSED_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_TESTCASE_PAYLOAD_BYTES,
} from './limits.js';

export type FileContent = { path: string; sizeBytes: number; sha256: string };
export type FileZipPair = {
  name: string;
  input: FileContent;
  output: FileContent;
};
const unsafe = (message: string) =>
  new JudgeDataError('UNSAFE_ARCHIVE', message);
let activeIngestions = 0;
const MAX_CONCURRENT_INGESTIONS = 2;

export function byteLimit(max: number, onChunk?: (chunk: Buffer) => void) {
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > max) return callback(unsafe('Archive exceeds size limits'));
      onChunk?.(chunk);
      callback(null, chunk);
    },
  });
}

function nextEntry(zip: ZipFile): Promise<Entry | undefined> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      zip.off('entry', entry);
      zip.off('end', end);
      zip.off('error', error);
    };
    const entry = (value: Entry) => {
      cleanup();
      resolve(value);
    };
    const end = () => {
      cleanup();
      resolve(undefined);
    };
    const error = (value: Error) => {
      cleanup();
      reject(value);
    };
    zip.once('entry', entry).once('end', end).once('error', error);
    zip.readEntry();
  });
}

function entryName(raw: string) {
  const directory = raw.endsWith('/');
  const name = (directory ? raw.slice(0, -1) : raw).normalize('NFKC');
  if (
    !name ||
    name.length > 255 ||
    // eslint-disable-next-line no-control-regex -- Archive paths must reject control bytes.
    /[\\\x00-\x1f:]/.test(name) ||
    name.startsWith('/') ||
    name.split('/').length > 8 ||
    name.split('/').some((part) => !part || part === '..' || part === '.')
  )
    throw unsafe('Unsafe archive path');
  return { name, directory };
}

async function extract(
  path: string,
  root: string,
  signal?: AbortSignal,
): Promise<FileZipPair[]> {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    open(
      path,
      {
        lazyEntries: true,
        autoClose: false,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, value) => (error ? reject(error) : resolve(value!)),
    );
  });
  const inputs = new Map<string, FileContent>();
  const outputs = new Map<string, FileContent>();
  const names = new Set<string>();
  let expanded = 0;
  let compressed = 0;
  let count = 0;
  try {
    if (!zip.entryCount || zip.entryCount > MAX_ARCHIVE_ENTRIES)
      throw unsafe('Too many archive entries');
    for (
      let entry = await nextEntry(zip);
      entry;
      entry = await nextEntry(zip)
    ) {
      signal?.throwIfAborted();
      if (++count > MAX_ARCHIVE_ENTRIES)
        throw unsafe('Too many archive entries');
      const { name, directory } = entryName(entry.fileName);
      const collision = name.toLowerCase();
      if (names.has(collision))
        throw new JudgeDataError('DUPLICATE', 'Duplicate archive entry');
      names.add(collision);
      const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (
        entry.isEncrypted() ||
        ![0, 8].includes(entry.compressionMethod) ||
        (!directory && entry.externalFileAttributes & 0x10) ||
        (entry.versionMadeBy >>> 8 === 3 &&
          unixType !== 0x8000 &&
          !(directory && unixType === 0x4000))
      )
        throw unsafe('Unsupported archive entry');
      expanded += entry.uncompressedSize;
      compressed += entry.compressedSize;
      if (
        entry.uncompressedSize > MAX_TESTCASE_PAYLOAD_BYTES ||
        entry.compressedSize > MAX_TESTCASE_PAYLOAD_BYTES ||
        expanded > MAX_ARCHIVE_UNCOMPRESSED_BYTES ||
        compressed > MAX_ARCHIVE_COMPRESSED_BYTES ||
        entry.uncompressedSize > Math.max(1, entry.compressedSize) * 1000
      )
        throw unsafe('Archive exceeds size or compression ratio limits');
      const local = await zip.readLocalFileHeaderPromise(entry);
      const descriptor = Boolean(entry.generalPurposeBitFlag & 8);
      if (
        local.fileName.toString('utf8').normalize('NFKC') !==
          entry.fileName.normalize('NFKC') ||
        local.compressionMethod !== entry.compressionMethod ||
        local.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
        (!descriptor &&
          (local.compressedSize !== entry.compressedSize ||
            local.uncompressedSize !== entry.uncompressedSize ||
            local.crc32 !== entry.crc32))
      )
        throw unsafe('Header mismatch');
      const match = directory ? null : /^(.*)\.(in|out|ans|txt)$/i.exec(name);
      const key = match ? match[1]!.replace(/^0+/, '') || '0' : undefined;
      const target = match?.[2]!.toLowerCase() === 'in' ? inputs : outputs;
      if (key !== undefined && target.has(key))
        throw new JudgeDataError('DUPLICATE', 'Duplicate testcase pair');
      const file = join(root, `entry-${count}`);
      const hash = createHash('sha256');
      let size = 0;
      let crc = 0;
      const stream = await zip.openReadStreamPromise(entry);
      await pipeline(
        stream,
        byteLimit(entry.uncompressedSize, (chunk) => {
          size += chunk.length;
          hash.update(chunk);
          crc = crc32(chunk, crc);
        }),
        match
          ? createWriteStream(file, { flags: 'wx', mode: 0o600 })
          : new Writable({
              write(_chunk, _encoding, callback) {
                callback();
              },
            }),
        { signal },
      );
      if (size !== entry.uncompressedSize || crc !== entry.crc32)
        throw unsafe('Archive checksum or length mismatch');
      if (key !== undefined)
        target.set(key, {
          path: file,
          sizeBytes: size,
          sha256: hash.digest('hex'),
        });
    }
    if (!inputs.size || inputs.size > 64 || inputs.size !== outputs.size)
      throw new JudgeDataError(
        'INVALID_PAIR',
        'Invalid testcase pairs or count',
      );
    return [...inputs]
      .map(([name, input]) => {
        const output = outputs.get(name);
        if (!output)
          throw new JudgeDataError('INVALID_PAIR', 'Missing input/output pair');
        return { name, input, output };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  } finally {
    zip.close();
  }
}

/** All disk names are generated here; archive paths never become filesystem paths. */
export async function withStreamingZip<T>(
  source: Readable,
  consume: (pairs: FileZipPair[]) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (activeIngestions >= MAX_CONCURRENT_INGESTIONS)
    throw new JudgeDataError('JUDGE_DATA_CAPACITY_UNAVAILABLE', 'Upload capacity unavailable', 503);
  activeIngestions += 1;
  let root: string | undefined;
  try {
    root = await mkdtemp(join(tmpdir(), 'oj-judgedata-ingest-'));
    const path = join(root, 'upload.zip');
    await pipeline(
      source,
      byteLimit(MAX_ARCHIVE_COMPRESSED_BYTES),
      createWriteStream(path, { flags: 'wx', mode: 0o600 }),
      { signal },
    );
    let pairs: FileZipPair[];
    try {
      pairs = await extract(path, root, signal);
    } catch (error) {
      if (error instanceof JudgeDataError || signal?.aborted) throw error;
      throw unsafe('Invalid archive');
    }
    signal?.throwIfAborted();
    return await consume(pairs);
  } finally {
    try { if (root) await rm(root, { recursive: true, force: true }); }
    finally { activeIngestions -= 1; }
  }
}
