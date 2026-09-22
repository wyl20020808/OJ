import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webSource = join(process.cwd(), 'apps/web/src');
const appCss = readFileSync(join(webSource, 'app/app.css'), 'utf8');

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(target);
    return entry.name.endsWith('.css') ? [target] : [];
  });
}

describe('web typography contract', () => {
  it('defines canonical UI, heading, and code font tokens without remote fonts', () => {
    expect(appCss).toMatch(/--font-ui:\s*[\s\S]*?system-ui[\s\S]*?'Segoe UI'/);
    expect(appCss).toMatch(
      /--font-ui:[\s\S]*?'Microsoft YaHei UI'[\s\S]*?'PingFang SC'/,
    );
    expect(appCss).toMatch(
      /--font-code:[\s\S]*?'Cascadia Code'[\s\S]*?Consolas/,
    );
    expect(appCss).toContain('--font-heading: var(--font-ui)');
    expect(appCss).not.toMatch(
      /@import\s+url|fonts\.googleapis\.com|use\.typekit\.net/,
    );
  });

  it('keeps all local font-family declarations on canonical tokens', () => {
    for (const file of cssFiles(webSource)) {
      const css = readFileSync(file, 'utf8');
      const declarations = [...css.matchAll(/font-family\s*:\s*([^;]+);/g)].map(
        (match) => match[1]!.trim(),
      );
      expect(declarations, file).toEqual(
        declarations.filter((value) =>
          /^(?:inherit|var\(--font-(?:ui|code|heading)\))$/.test(value),
        ),
      );
    }
  });

  it('provides tabular lining numerals for data and preserves UI form inheritance', () => {
    expect(appCss).toMatch(
      /\.tabular-number,[\s\S]*?font-variant-numeric:\s*tabular-nums lining-nums/,
    );
    expect(appCss).toMatch(/button,[\s\S]*?option\s*\{\s*font:\s*inherit/);
  });

  it('keeps code surfaces on the code token without leaking mono into ordinary IDs', () => {
    const editorCss = readFileSync(
      join(webSource, 'components/problem-editor.css'),
      'utf8',
    );
    expect(appCss).toMatch(
      /code,[\s\S]*?pre\s*\{\s*font-family:\s*var\(--font-code\)/,
    );
    expect(editorCss).toMatch(
      /\.markdown-editor-pane textarea[\s\S]*?font-family:\s*var\(--font-code\)/,
    );
    expect(editorCss).toMatch(
      /\.testcase-content-field textarea[\s\S]*?font-family:\s*var\(--font-code\)/,
    );
    expect(appCss).toMatch(
      /\.online-code-editor-host \.online-code-editor\.oj-editor-page[\s\S]*?font-family:\s*var\(--font-ui\)/,
    );
    expect(appCss).toMatch(
      /\.online-code-editor-host[\s\S]*?\.cm-content[\s\S]*?font-family:\s*var\(--font-code\)/,
    );
    expect(appCss).toMatch(
      /\.problem-list-modern \.problem-id[\s\S]*?font-family:\s*var\(--font-ui\)/,
    );
  });
});
