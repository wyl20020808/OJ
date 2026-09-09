// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProblemStatementRenderer } from '../apps/web/src/components/ProblemStatementRenderer.js';

describe('ProblemStatementRenderer security contract', () => {
  it('renders canonical sections once, with samples between output and constraints', () => {
    const { container } = render(<ProblemStatementRenderer showTitle={false} content={{ statement: 'D', inputDescription: 'I', outputDescription: 'O', samples: [{ input: '1', output: '2' }], constraints: 'C', notes: 'N' }} />);
    const sections = [...container.querySelectorAll('[data-section]')].map((node) => node.getAttribute('data-section'));
    expect(sections).toEqual(['statement', 'inputDescription', 'outputDescription', 'samples', 'constraints', 'notes']);
    expect(container.querySelectorAll('[data-section="notes"]')).toHaveLength(1);
    expect(container.querySelector('.problem-content-surface')).toBeNull();
  });

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

  it('renders canonical content order and samples inside one surface', () => {
    const { container } = render(<ProblemStatementRenderer content={{ statement: 'D', inputDescription: 'I', outputDescription: 'O', constraints: 'C', notes: 'H', examples: [{ input: '1', output: '2' }] }} showTitle={false} />);
    const sections = [...container.querySelectorAll('[data-section]')].map((node) => node.getAttribute('data-section'));
    expect(sections).toEqual(['statement', 'inputDescription', 'outputDescription', 'samples', 'constraints', 'notes']);
    expect(container.querySelector('.problem-samples')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-section="notes"]')).toHaveLength(1);
  });

  it('omits empty optional sections and keeps sample pairs grouped', () => {
    const { container } = render(<ProblemStatementRenderer content={{ statement: 'D', inputDescription: '', outputDescription: '', constraints: '', notes: '', samples: [{ input: 'a', output: 'b' }, { input: 'c', output: 'd' }] }} showTitle={false} />);
    expect(container.querySelector('[data-section="constraints"]')).toBeNull();
    expect(container.querySelectorAll('.sample-block')).toHaveLength(2);
    expect(container.querySelector('[aria-label="样例 2 输入"]')).toHaveTextContent('c');
    expect(container.querySelector('[aria-label="样例 2 输出"]')).toHaveTextContent('d');
  });
});
