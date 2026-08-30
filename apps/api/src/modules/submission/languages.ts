export type LanguageDefinition = {
  id: string;
  displayName: string;
  maxSourceBytes: number;
};

export const LANGUAGE_CATALOG: ReadonlyMap<string, LanguageDefinition> =
  new Map([
    [
      'typescript',
      {
        id: 'typescript',
        displayName: 'TypeScript',
        maxSourceBytes: 256 * 1024,
      },
    ],
    [
      'javascript',
      {
        id: 'javascript',
        displayName: 'JavaScript',
        maxSourceBytes: 256 * 1024,
      },
    ],
    [
      'python',
      { id: 'python', displayName: 'Python', maxSourceBytes: 256 * 1024 },
    ],
    ['go', { id: 'go', displayName: 'Go', maxSourceBytes: 256 * 1024 }],
    [
      'cpp20',
      {
        id: 'cpp20',
        displayName: 'C++20 (GCC 13)',
        maxSourceBytes: 256 * 1024,
      },
    ],
  ]);

export const MAX_SOURCE_BYTES = 256 * 1024;
