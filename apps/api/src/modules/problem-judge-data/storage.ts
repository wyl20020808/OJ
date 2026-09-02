import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { id, sha256, JudgeDataError, type ObjectRef } from './model.js';

const storageFailure = (error: unknown): JudgeDataError => {
  if (error instanceof JudgeDataError) return error;
  return new JudgeDataError('STORAGE_UNAVAILABLE', 'Storage unavailable', 503);
};
export type ByteStorage = {
  put(
    bytes: Uint8Array,
    key: string,
    fileName: string,
    problemId: string,
  ): Promise<ObjectRef>;
  verify(ref: ObjectRef): Promise<void>;
  remove?(ref: ObjectRef): Promise<void>;
  get?(ref: ObjectRef): Promise<Uint8Array>;
};
export class S3ByteStorage implements ByteStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}
  async put(
    bytes: Uint8Array,
    key: string,
    fileName: string,
    problemId: string,
  ) {
    const digest = sha256(bytes);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'application/octet-stream',
          Metadata: { sha256: digest, problemid: problemId },
        }),
      );
    } catch (error) {
      throw storageFailure(error);
    }
    return {
      objectId: id(),
      key,
      fileName,
      sizeBytes: bytes.byteLength,
      sha256: digest,
    };
  }
  async verify(ref: ObjectRef) {
    let h;
    try {
      h = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: ref.key }),
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404)
        throw new JudgeDataError(
          'INTEGRITY_MISMATCH',
          'Object unavailable',
          409,
        );
      throw storageFailure(error);
    }
    if (
      Number(h.ContentLength) !== ref.sizeBytes ||
      h.Metadata?.sha256 !== ref.sha256
    )
      throw new JudgeDataError(
        'INTEGRITY_MISMATCH',
        'Object integrity mismatch',
        409,
      );
  }
  async remove(ref: ObjectRef) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: ref.key }),
      );
    } catch (error) {
      throw storageFailure(error);
    }
  }
  async get(ref: ObjectRef) {
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: ref.key }),
      );
      return new Uint8Array(await out.Body!.transformToByteArray());
    } catch (error) {
      throw storageFailure(error);
    }
  }
}
export class MemoryByteStorage implements ByteStorage {
  readonly objects = new Map<string, Uint8Array>();
  constructor(readonly unavailable = false) {}
  async put(
    bytes: Uint8Array,
    key: string,
    fileName: string,
    problemId: string,
  ) {
    void problemId;
    if (this.unavailable)
      throw new JudgeDataError(
        'STORAGE_UNAVAILABLE',
        'Storage unavailable',
        503,
      );
    const objectId = id();
    this.objects.set(objectId, bytes.slice());
    return {
      objectId,
      key,
      fileName,
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
    };
  }
  async verify(ref: ObjectRef) {
    const b = this.objects.get(ref.objectId);
    if (!b)
      throw new JudgeDataError('INTEGRITY_MISMATCH', 'Object missing', 409);
    if (sha256(b) !== ref.sha256 || b.byteLength !== ref.sizeBytes)
      throw new JudgeDataError(
        'INTEGRITY_MISMATCH',
        'Object integrity mismatch',
        409,
      );
  }
  async remove(ref: ObjectRef) {
    this.objects.delete(ref.objectId);
  }
  async get(ref: ObjectRef) {
    const b = this.objects.get(ref.objectId);
    if (!b)
      throw new JudgeDataError('INTEGRITY_MISMATCH', 'Object missing', 409);
    return b.slice();
  }
}
