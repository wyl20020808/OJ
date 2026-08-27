import {
  ProblemValidationError,
  type ProblemCreateInput,
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

export function validateCreate(input: unknown): ProblemCreateInput {
  if (!input || typeof input !== 'object')
    throw new ProblemValidationError({ body: 'must be an object' });
  const value = input as Record<string, unknown>;
  const slug = text(value.slug, 'slug', 120);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new ProblemValidationError({ slug: 'must be lowercase kebab-case' });
  const examples = value.examples;
  if (
    !Array.isArray(examples) ||
    examples.length > 100 ||
    examples.some(
      (e) =>
        !e ||
        typeof e !== 'object' ||
        typeof (e as Record<string, unknown>).input !== 'string' ||
        typeof (e as Record<string, unknown>).output !== 'string',
    )
  )
    throw new ProblemValidationError({
      examples: 'must contain input/output records',
    });
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
  const result: ProblemCreateInput = {
    slug,
    title: text(value.title, 'title', 300),
    statement: text(value.statement, 'statement'),
    inputDescription: text(value.inputDescription, 'inputDescription'),
    outputDescription: text(value.outputDescription, 'outputDescription'),
    examples: examples as ProblemCreateInput['examples'],
    constraints: text(value.constraints, 'constraints'),
    notes:
      value.notes === undefined || value.notes === ''
        ? ''
        : text(value.notes, 'notes'),
    timeLimitMs: numberField('timeLimitMs', 1),
    memoryLimitBytes: numberField('memoryLimitBytes', 1),
    visibility,
    status,
    testdataVersion,
    authorId:
      value.authorId === null || value.authorId === undefined
        ? null
        : text(value.authorId, 'authorId', 128),
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
    'statement',
    'inputDescription',
    'outputDescription',
    'examples',
    'constraints',
    'notes',
    'timeLimitMs',
    'memoryLimitBytes',
    'testdataVersion',
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
  for (const field of [
    'title',
    'statement',
    'inputDescription',
    'outputDescription',
    'constraints',
  ])
    if (field in source) result[field] = text(source[field], field);
  if ('notes' in source)
    result.notes = source.notes === '' ? '' : text(source.notes, 'notes');
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
  if (
    'examples' in source &&
    (!Array.isArray(source.examples) || source.examples.length > 100)
  )
    throw new ProblemValidationError({
      examples: 'must be an array of at most 100 records',
    });
  return result as ProblemUpdateInput;
}
