import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import 'katex/dist/katex.min.css';

export function DiscussionRenderer({ content }: { content: string }) {
  return <div className="discussion-renderer"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeSanitize, rehypeKatex]} skipHtml>{content}</ReactMarkdown></div>;
}
