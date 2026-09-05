import { describe, expect, it } from 'vitest';
import { Readable, PassThrough } from 'node:stream';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { crc32, deflateRawSync } from 'node:zlib';
import Fastify from 'fastify';
import { withStreamingZip } from '../apps/api/src/modules/problem-judge-data/streaming-zip.js';
import {
  InMemoryJudgeDataRepository,
  MemoryByteStorage,
  ProblemJudgeDataService,
  registerProblemJudgeDataRoutes,
} from '../apps/api/src/modules/problem-judge-data/index.js';

type ZipItem = {
  name: string;
  data: Buffer;
  declaredSize?: number;
  symlink?: boolean;
  compressed?: boolean;
};
function zip(items: ZipItem[]) {
  const locals: Buffer[] = [];
  const entries: Buffer[] = [];
  let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name);
    const data = item.compressed ? deflateRawSync(item.data) : item.data;
    const method = item.compressed ? 8 : 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(item.data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(item.declaredSize ?? item.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const entry = Buffer.alloc(46 + name.length);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(item.symlink ? 3 << 8 : 20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc32(item.data), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(item.declaredSize ?? item.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    if (item.symlink) entry.writeUInt32LE(0xa0000000, 38);
    entry.writeUInt32LE(offset, 42);
    name.copy(entry, 46);
    locals.push(local, data);
    entries.push(entry);
    offset += local.length + data.length;
  }
  const central = Buffer.concat(entries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
const pair = [
  { name: '1.in', data: Buffer.from('1 2\n') },
  { name: '1.out', data: Buffer.from('3\n') },
];
const source = (data: Buffer) =>
  Readable.from(
    (function* () {
      for (let i = 0; i < data.length; i += 97) yield data.subarray(i, i + 97);
    })(),
  );

describe('file-backed ZIP ingestion', () => {
  it('rejects a third ingestion and restores capacity after cancellation', async () => {
    const controllers = [new AbortController(), new AbortController()];
    const pending = controllers.map((controller) =>
      withStreamingZip(
        new PassThrough(),
        async () => {
          throw new Error('cancelled consumer must not run');
        },
        controller.signal,
      ).then(
        () => undefined,
        (error) => error,
      ),
    );
    try {
      await expect(
        withStreamingZip(source(zip(pair)), async () => undefined),
      ).rejects.toMatchObject({
        code: 'JUDGE_DATA_CAPACITY_UNAVAILABLE',
        status: 503,
      });
    } finally {
      controllers.forEach((controller) => controller.abort());
      const results = await Promise.all(pending);
      expect(results.every((error) => error?.name === 'AbortError')).toBe(true);
    }
    await expect(
      withStreamingZip(source(zip(pair)), async (pairs) => pairs.length),
    ).resolves.toBe(1);
  });

  it('processes chunked ZIPs and removes its private files after consumption', async () => {
    let root = '';
    await withStreamingZip(source(zip(pair)), async (pairs) => {
      expect(pairs).toHaveLength(1);
      root = dirname(pairs[0]!.input.path);
      expect(await readFile(pairs[0]!.input.path)).toEqual(pair[0]!.data);
      expect(pairs[0]!.input.sizeBytes).toBe(4);
      expect(pairs[0]!.input.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
    await expect(access(root)).rejects.toThrow();
  });
  it('cleans temporary files if the consumer fails', async () => {
    let root = '';
    await expect(
      withStreamingZip(source(zip(pair)), async (pairs) => {
        root = dirname(pairs[0]!.input.path);
        throw new Error('storage failed');
      }),
    ).rejects.toThrow('storage failed');
    await expect(access(root)).rejects.toThrow();
  });
  it.each(['../1.in', '/1.in', 'C:/1.in', 'dir\\1.in', './1.in'])(
    'rejects unsafe path %s',
    async (name) => {
      await expect(
        withStreamingZip(
          source(zip([{ ...pair[0]!, name }, pair[1]!])),
          async () => {},
        ),
      ).rejects.toThrow();
    },
  );
  it('rejects symlinks and case-insensitive duplicate entries', async () => {
    for (const items of [
      [{ ...pair[0]!, symlink: true }, pair[1]!],
      [...pair, { ...pair[0]!, name: '1.IN' }],
    ])
      await expect(
        withStreamingZip(source(zip(items)), async () => {}),
      ).rejects.toThrow();
  });
  it('rejects truncated or CRC-corrupted ZIP content before consumption', async () => {
    const data = zip(pair);
    const corrupt = Buffer.from(data);
    corrupt[34] = corrupt[34]! ^ 1;
    for (const value of [data.subarray(0, data.length - 1), corrupt])
      await expect(
        withStreamingZip(source(value), async () => {
          throw new Error('consumer must not run');
        }),
      ).rejects.not.toThrow('consumer must not run');
  });
  it('rejects oversized entries and compression bombs', async () => {
    await expect(
      withStreamingZip(
        source(
          zip([{ ...pair[0]!, declaredSize: 101 * 1024 * 1024 }, pair[1]!]),
        ),
        async () => {},
      ),
    ).rejects.toThrow();
    await expect(
      withStreamingZip(
        source(
          zip([
            {
              name: '1.in',
              data: Buffer.alloc(4 * 1024 * 1024),
              compressed: true,
            },
            pair[1]!,
          ]),
        ),
        async () => {},
      ),
    ).rejects.toThrow('compression ratio');
  });
  it('cleans interrupted ingestion without invoking the consumer', async () => {
    const before = (await readdir(tmpdir())).filter((name) =>
      name.startsWith('oj-judgedata-ingest-'),
    );
    const stream = Readable.from(
      (async function* () {
        yield Buffer.from('PK');
        throw new Error('upload aborted');
      })(),
    );
    await expect(
      withStreamingZip(stream, async () => {
        throw new Error('consumer must not run');
      }),
    ).rejects.toThrow('upload aborted');
    expect(
      (await readdir(tmpdir())).filter((name) =>
        name.startsWith('oj-judgedata-ingest-'),
      ),
    ).toEqual(before);
  });
  it('uses the real raw HTTP route and leaves no objects after failed draft persistence', async () => {
    const repo = new InMemoryJudgeDataRepository();
    const storage = new MemoryByteStorage();
    const service = new ProblemJudgeDataService(
      repo,
      storage,
      async () => true,
      async () => true,
      async () => ({
        problemRevisionId: 'r1',
        testdataVersionId: 'v1',
        testcaseSetId: 's1',
        executionProfileId: 'cpp20-gcc-13-v1',
      }),
    );
    const app = Fastify();
    await registerProblemJudgeDataRoutes(app, {
      service,
      getAuth: async () => ({ userId: 'author', strength: 'password' }),
    });
    const request = {
      method: 'POST' as const,
      url: '/api/problems/p1/judge-data/draft/upload-zip',
      headers: {
        'content-type': 'application/zip',
        'x-csrf-token': 'token',
        cookie: 'oj_csrf=token',
      },
      payload: zip(pair),
    };
    try {
      expect((await app.inject(request)).statusCode).toBe(200);
      expect((await repo.getDraft('p1'))?.testcases).toHaveLength(1);
      const existing = [...storage.objects.keys()];
      repo.saveDraft = async () => {
        throw new Error('persist failed');
      };
      expect((await app.inject(request)).statusCode).toBe(500);
      expect([...storage.objects.keys()]).toEqual(existing);
    } finally {
      await app.close();
    }
  });
});
