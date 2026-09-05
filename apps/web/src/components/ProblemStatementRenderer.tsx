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
};

const sections = [
  ['background', '题目背景'],
  ['statement', '题目描述'],
  ['inputDescription', '输入格式'],
  ['outputDescription', '输出格式'],
  ['constraints', '数据范围'],
  ['notes', '说明与提示'],
] as const;

export function ProblemStatementRenderer({ content, showTitle = true }: { content: ProblemStatementContent; showTitle?: boolean }) {
  return <div className="problem-statement-renderer">
    {showTitle && content.title?.trim() ? <h2>{content.title}</h2> : null}
    {sections.map(([key, heading]) => {
      const value = content[key];
      if (!value?.trim()) return null;
      return <section key={key}><h3>{heading}</h3><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeSanitize, rehypeKatex]} skipHtml>{value}</ReactMarkdown></section>;
    })}
  </div>;
}
