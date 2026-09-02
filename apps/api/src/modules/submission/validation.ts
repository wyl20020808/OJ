import { LANGUAGE_CATALOG, MAX_SOURCE_BYTES } from './languages.js';
import {
  SubmissionValidationError,
  type SubmissionCreateRequest,
} from './model.js';

const required = (value: unknown, field: string, max = 512): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > max
  )
    throw new SubmissionValidationError({
      [field]: 'must be a non-empty bounded string',
    });
  return value;
};

export function validateCreate(input: unknown): SubmissionCreateRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new SubmissionValidationError({ body: 'must be an object' });
  const value = input as Record<string, unknown>;
  const languageId = required(value.languageId, 'languageId', 64);
  const language = LANGUAGE_CATALOG.get(languageId);
  if (!language)
    throw new SubmissionValidationError({ languageId: 'unsupported language' });
  const source = required(value.source, 'source', MAX_SOURCE_BYTES);
  const sourceBytes = Buffer.byteLength(source, 'utf8');
  if (sourceBytes > language.maxSourceBytes)
    throw new SubmissionValidationError({
      source: 'source exceeds language size limit',
    });
  return {
    problemId: required(value.problemId, 'problemId', 128),
    problemRevisionId: required(
      value.problemRevisionId,
      'problemRevisionId',
      128,
    ),
    ...(value.testdataVersionRef === undefined || value.testdataVersionRef === null
      ? {}
      : {
          testdataVersionRef: required(
            value.testdataVersionRef,
            'testdataVersionRef',
            512,
          ),
        }),
    languageId,
    source,
  };
}
