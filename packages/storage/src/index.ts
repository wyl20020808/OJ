import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export type StorageConfig = {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  timeoutMs?: number;
};

export function createStorage(config: StorageConfig) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });
  return { client, bucket: config.bucket };
}

export async function ensureBucket(
  storage: ReturnType<typeof createStorage>,
): Promise<void> {
  try {
    await storage.client.send(
      new HeadBucketCommand({ Bucket: storage.bucket }),
    );
  } catch {
    await storage.client.send(
      new CreateBucketCommand({ Bucket: storage.bucket }),
    );
  }
}

export async function checkStorage(
  storage: ReturnType<typeof createStorage>,
): Promise<void> {
  await storage.client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
}
