import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
export type ProblemStatementContent = {
  title?: string;
  background?: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  constraints: string;
  notes?: string;
  examples?: Array<{ input: string; output: string; note?: string }>;
  samples?: Array<{
    input: string;
    output: string;
    explanation?: string | null;
  }>;
};
const markdown = (value: string) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeSanitize, rehypeKatex]}
    skipHtml
  >
    {value}
  </ReactMarkdown>
);
export function ProblemStatementRenderer({
  content,
  showTitle = true,
  onCopySample,
}: {
  content: ProblemStatementContent;
  showTitle?: boolean;
  onCopySample?: (input: string) => void;
}) {
  const samples: Array<{
    input: string;
    output: string;
    note?: string;
    explanation?: string | null;
  }> = content.samples ?? content.examples ?? [];
  const sections = [
    ['statement', '题目描述'],
    ['inputDescription', '输入格式'],
    ['outputDescription', '输出格式'],
  ] as const;
  return (
    <div className="problem-statement-renderer">
      {showTitle && content.title?.trim() ? <h2>{content.title}</h2> : null}
      {content.background?.trim() ? (
        <section data-section="background">
          <h3>题目背景</h3>
          {markdown(content.background)}
        </section>
      ) : null}
      {sections.map(([key, heading]) => {
        const value = content[key];
        return value?.trim() ? (
          <section data-section={key} key={key}>
            <h3>{heading}</h3>
            {markdown(value)}
          </section>
        ) : null;
      })}
      {samples.length > 0 ? (
        <section className="problem-samples" data-section="samples">
          <h3>样例</h3>
          {samples.map((sample, index) => (
            <div className="sample-block" key={index}>
              <div className="sample-heading section-heading-inline">
                <h4>样例 {index + 1}</h4>
                {onCopySample ? (
                  <button
                    type="button"
                    className="secondary sample-copy"
                    onClick={() => onCopySample(sample.input)}
                  >
                    复制样例
                  </button>
                ) : null}
              </div>
              <div className="sample-grid">
                <div>
                  <h5>输入</h5>
                  <pre
                    className="sample-code sample-input"
                    aria-label={`样例 ${index + 1} 输入`}
                  >
                    {sample.input}
                  </pre>
                </div>
                <div>
                  <h5>输出</h5>
                  <pre
                    className="sample-code sample-output"
                    aria-label={`样例 ${index + 1} 输出`}
                  >
                    {sample.output}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      {content.constraints?.trim() ? (
        <section data-section="constraints">
          <h3>数据范围</h3>
          {markdown(content.constraints)}
        </section>
      ) : null}
      {content.notes?.trim() ? (
        <section data-section="notes">
          <h3>说明与提示</h3>
          {markdown(content.notes)}
        </section>
      ) : null}
    </div>
  );
}
