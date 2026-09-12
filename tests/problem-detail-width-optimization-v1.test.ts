import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync('apps/web/src/app/App.tsx', 'utf8');
const layoutCss = readFileSync(
  'apps/web/src/features/problem-detail/ProblemDetailLayout.css',
  'utf8',
);

describe('problem detail width optimization', () => {
  it('keeps page-specific width rules in the problem detail feature', () => {
    expect(appSource).toContain(
      "import '../features/problem-detail/ProblemDetailLayout.css';",
    );
  });

  it('uses one desktop width system for detail and editor content', () => {
    expect(layoutCss).toMatch(/width:\s*min\(80vw, 1560px\)/);
    expect(layoutCss).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\) clamp\(292px, 22vw, 340px\)/,
    );
    expect(layoutCss).toMatch(/\.problem-editor-slot[\s\S]*?width:\s*100%/);
  });

  it('stacks the detail columns at the existing small-screen breakpoint', () => {
    expect(layoutCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.problem-detail-v4\s*{[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });
});
