import {
  ProblemValidationError,
  problemDifficulties,
  problemProviders,
  type ProblemCreateInput,
  type ProblemSample,
  type ProblemUpdateInput,
} from './model.js';

const text = (value: unknown, field: string, max = 50_000): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > max
  )
    throw new ProblemValidationError({
      [field]: 'must be a non-empty bounded string',
    });
  return value;
};

const optionalText = (value: unknown, field: string, max = 50_000) =>
  value === undefined || value === null || value === ''
    ? ''
    : text(value, field, max);

const normalizeSamples = (value: unknown): ProblemSample[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new ProblemValidationError({
      samples: 'must be an array of at most 100 records',
    });
  let total = 0;
  return value.map((item, index) => {
    if (!item || typeof item !== 'object')
      throw new ProblemValidationError({
        samples: 'must contain input/output records',
      });
    const sample = item as Record<string, unknown>;
    if (typeof sample.input !== 'string' || typeof sample.output !== 'string')
      throw new ProblemValidationError({
        samples: 'must contain input/output records',
      });
    const explanation =
      sample.explanation === undefined
        ? typeof sample.note === 'string'
          ? sample.note
          : undefined
        : optionalText(sample.explanation, `samples.${index}.explanation`);
    total +=
      sample.input.length + sample.output.length + (explanation?.length ?? 0);
    if (
      sample.input.length > 50_000 ||
      sample.output.length > 50_000 ||
      total > 250_000
    )
      throw new ProblemValidationError({
        samples: 'must contain bounded text with a bounded total payload',
      });
    return {
      ordinal: index + 1,
      input: sample.input,
      output: sample.output,
      ...(explanation === undefined ? {} : { explanation }),
    };
  });
};

const difficulty = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (
    !problemDifficulties.includes(value as (typeof problemDifficulties)[number])
  )
    throw new ProblemValidationError({ difficulty: 'invalid value' });
  return value as (typeof problemDifficulties)[number];
};

const examples = (samples: ProblemSample[]) =>
  samples.map(({ input, output, explanation }) => ({
    input,
    output,
    ...(explanation ? { note: explanation } : {}),
  }));

const tags = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50)
    throw new ProblemValidationError({
      tags: 'must be an array of at most 50 strings',
    });
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (
      typeof item !== 'string' ||
      item.trim().length === 0 ||
      item.length > 64
    )
      throw new ProblemValidationError({
        [`tags.${index}`]: 'must be a bounded non-empty string',
      });
    const normalized = item.trim().replace(/\s+/g, ' ');
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key))
      throw new ProblemValidationError({
        tags: 'must not contain duplicate tags',
      });
    seen.add(key);
    return normalized;
  });
};

const tagIds = (value: unknown): number[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50)
    throw new ProblemValidationError({
      tagIds: 'must be an array of at most 50 ids',
    });
  const seen = new Set<number>();
  return value.map((item, index) => {
    const id =
      typeof item === 'number' && Number.isSafeInteger(item)
        ? item
        : Number(item);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ProblemValidationError({
        [`tagIds.${index}`]: 'must be a positive integer id',
      });
    if (seen.has(id))
      throw new ProblemValidationError({
        tagIds: 'must not contain duplicate tag ids',
      });
    seen.add(id);
    return id;
  });
};

export function validateCreate(input: unknown): ProblemCreateInput {
  if (!input || typeof input !== 'object')
    throw new ProblemValidationError({ body: 'must be an object' });
  const value = input as Record<string, unknown>;
  const slug = text(value.slug, 'slug', 120);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new ProblemValidationError({ slug: 'must be lowercase kebab-case' });
  const normalizedSamples = normalizeSamples(value.samples ?? value.examples);
  const numberField = (name: string, min: number) => {
    const n = value[name];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min)
      throw new ProblemValidationError({
        [name]: 'must be a positive integer',
      });
    return n;
  };
  const visibility = value.visibility ?? 'private';
  const status = value.status ?? 'draft';
  if (visibility !== 'private' && visibility !== 'public')
    throw new ProblemValidationError({ visibility: 'invalid value' });
  if (status !== 'draft' && status !== 'published' && status !== 'archived')
    throw new ProblemValidationError({ status: 'invalid value' });
  const testdataVersion =
    value.testdataVersion === null || value.testdataVersion === undefined
      ? null
      : text(value.testdataVersion, 'testdataVersion', 512);
  const sourceType = value.sourceType ?? 'CREATOR';
  if (
    ![
      'CREATOR',
      'EXTERNAL',
      'IMPORT',
      'TEST_FIXTURE',
      'API_AUTOMATION',
    ].includes(String(sourceType))
  )
    throw new ProblemValidationError({ sourceType: 'invalid value' });
  const provider = value.provider ?? 'OTHER';
  if (!problemProviders.includes(provider as never))
    throw new ProblemValidationError({ provider: 'invalid value' });
  const parsedTagIds = tagIds(value.tagIds);
  const result: ProblemCreateInput = {
    slug,
    title: text(value.title, 'title', 300),
    background: optionalText(value.background, 'background'),
    statement: text(value.statement, 'statement'),
    inputDescription: optionalText(value.inputDescription, 'inputDescription'),
    outputDescription: optionalText(
      value.outputDescription,
      'outputDescription',
    ),
    examples: examples(normalizedSamples),
    samples: normalizedSamples,
    constraints: optionalText(value.constraints, 'constraints'),
    notes: optionalText(value.notes, 'notes'),
    timeLimitMs: numberField('timeLimitMs', 1),
    memoryLimitBytes: numberField('memoryLimitBytes', 1),
    visibility,
    difficulty: difficulty(value.difficulty),
    status,
    testdataVersion,
    authorId:
      value.authorId === null || value.authorId === undefined
        ? null
        : text(value.authorId, 'authorId', 128),
    tags: tags(value.tags),
    ...(parsedTagIds === undefined ? {} : { tagIds: parsedTagIds }),
    sourceType: sourceType as NonNullable<ProblemCreateInput['sourceType']>,
    provider: provider as NonNullable<ProblemCreateInput['provider']>,
    providerProblemId:
      value.providerProblemId === undefined ||
      value.providerProblemId === null ||
      value.providerProblemId === ''
        ? null
        : text(value.providerProblemId, 'providerProblemId', 64),
    provenance:
      value.provenance && typeof value.provenance === 'object'
        ? (value.provenance as Record<string, unknown>)
        : null,
  };
  if (value.id !== undefined) result.id = text(value.id, 'id', 128);
  return result;
}

export function validateUpdate(input: unknown): ProblemUpdateInput {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ProblemValidationError({ body: 'must be an object' });
  const source = input as Record<string, unknown>;
  const allowed = [
    'slug',
    'title',
    'background',
    'statement',
    'inputDescription',
    'outputDescription',
    'examples',
    'constraints',
    'notes',
    'samples',
    'difficulty',
    'visibility',
    'timeLimitMs',
    'memoryLimitBytes',
    'testdataVersion',
    'tags',
    'tagIds',
    'provider',
    'providerProblemId',
  ];
  const unknown = Object.keys(source).find((key) => !allowed.includes(key));
  if (unknown)
    throw new ProblemValidationError({ [unknown]: 'field cannot be updated' });
  const result: Record<string, unknown> = { ...source };
  if ('slug' in source) {
    const slug = text(source.slug, 'slug', 120);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new ProblemValidationError({
        slug: 'must be lowercase kebab-case',
      });
    result.slug = slug;
  }
  for (const field of ['title', 'statement'])
    if (field in source) result[field] = text(source[field], field);
  for (const field of [
    'background',
    'inputDescription',
    'outputDescription',
    'constraints',
    'notes',
  ])
    if (field in source) result[field] = optionalText(source[field], field);
  for (const field of ['timeLimitMs', 'memoryLimitBytes'])
    if (field in source) {
      const n = source[field];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1)
        throw new ProblemValidationError({
          [field]: 'must be a positive integer',
        });
    }
  if ('testdataVersion' in source && source.testdataVersion !== null)
    result.testdataVersion = text(
      source.testdataVersion,
      'testdataVersion',
      512,
    );
  if ('samples' in source || 'examples' in source) {
    const normalized = normalizeSamples(source.samples ?? source.examples);
    result.samples = normalized;
    result.examples = examples(normalized);
  }
  if ('difficulty' in source) result.difficulty = difficulty(source.difficulty);
  if ('provider' in source) {
    if (!problemProviders.includes(source.provider as never))
      throw new ProblemValidationError({ provider: 'invalid value' });
    result.provider = source.provider;
  }
  if ('providerProblemId' in source)
    result.providerProblemId =
      source.providerProblemId === null || source.providerProblemId === ''
        ? null
        : text(source.providerProblemId, 'providerProblemId', 64);
  if ('tags' in source) result.tags = tags(source.tags);
  if ('tagIds' in source) result.tagIds = tagIds(source.tagIds);
  if (
    'visibility' in source &&
    source.visibility !== 'private' &&
    source.visibility !== 'public'
  )
    throw new ProblemValidationError({ visibility: 'invalid value' });
  return result as ProblemUpdateInput;
}
