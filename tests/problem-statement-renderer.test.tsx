// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProblemStatementRenderer } from '../apps/web/src/components/ProblemStatementRenderer.js';

describe('ProblemStatementRenderer security contract', () => {
  it('sanitizes raw HTML and dangerous javascript URLs', () => {
    const { container } = render(
      <ProblemStatementRenderer
        showTitle={false}
        content={{
          statement:
            '<script>alert(1)</script><iframe src="https://evil.test"></iframe> [run](javascript:alert(1)) ![x](javascript:alert(2))',
          inputDescription: '',
          outputDescription: '',
          constraints: '',
        }}
      />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
