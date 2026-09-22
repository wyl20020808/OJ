import { useEffect, useRef } from 'react';
import editorPlugin, {
  type EditorSlotContext,
} from '@ojplatform/online-code-editor';
import type { EditorHostContext } from '@ojplatform/online-code-editor/host/EditorHostContext';
import type { ProblemSolveEditorContext } from '@ojplatform/plugin-sdk';
import '@ojplatform/online-code-editor/app.css';
import { HttpDraftAdapter } from '@ojplatform/online-code-editor/draft/DraftAdapter';

export { editorPlugin as default };

type HostedProblemContext = ProblemSolveEditorContext & {
  problemRevisionId: string;
  checker?: EditorHostContext['checker'];
  codeRunAdapter: EditorHostContext['codeRunAdapter'];
  submissionAdapter?: EditorHostContext['submissionAdapter'];
  onViewSubmission?: (submissionId: string) => void;
};

export function OnlineCodeEditorContribution({
  context,
}: {
  context: HostedProblemContext;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const draftAdapterRef = useRef(
    new HttpDraftAdapter(import.meta.env.VITE_API_URL ?? ''),
  );
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const hostContext: EditorHostContext = {
      problemId: context.problemId,
      problemRevisionId: context.problemRevisionId,
      language: 'cpp20',
      draftAdapter: draftAdapterRef.current,
      codeRunAdapter: context.codeRunAdapter,
      sampleProvider: { getSamples: () => context.samples },
      ...(context.submissionAdapter
        ? { submissionAdapter: context.submissionAdapter }
        : {}),
      ...(context.checker ? { checker: context.checker } : {}),
      ...(context.onViewSubmission
        ? { onViewSubmission: context.onViewSubmission }
        : {}),
    };
    const mountContext: EditorSlotContext = { element, hostContext };
    return editorPlugin.mount(mountContext);
  }, [context]);
  return <div ref={elementRef} className="online-code-editor-host" />;
}
