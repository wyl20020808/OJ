import { MAX_SOURCE_BYTES } from '../submission/languages.js';
import { type CodeRunCreateRequest } from './model.js';
const MAX_STDIN_BYTES = 64 * 1024;
export class CodeRunValidationError extends Error {
  constructor(public readonly details: Record<string, string>) {
    super('Invalid code run request');
  }
}
export function validateCodeRun(input: unknown): CodeRunCreateRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new CodeRunValidationError({ body: 'must be an object' });
  const value = input as Record<string, unknown>;
  if (value.language !== 'cpp20')
    throw new CodeRunValidationError({ language: 'only cpp20 is supported' });
  if (typeof value.source !== 'string' || value.source.trim() === '')
    throw new CodeRunValidationError({ source: 'must be non-empty' });
  if (Buffer.byteLength(value.source, 'utf8') > MAX_SOURCE_BYTES)
    throw new CodeRunValidationError({ source: 'source exceeds size limit' });
  if (typeof value.stdin !== 'string')
    throw new CodeRunValidationError({ stdin: 'must be a string' });
  if (Buffer.byteLength(value.stdin, 'utf8') > MAX_STDIN_BYTES)
    throw new CodeRunValidationError({ stdin: 'stdin exceeds size limit' });
  return { language: 'cpp20', source: value.source, stdin: value.stdin };
}
