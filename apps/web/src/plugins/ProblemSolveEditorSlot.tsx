import { useMemo, type ReactNode } from 'react';
import { PluginHost, PROBLEM_SOLVE_EDITOR_SLOT, type ProblemSolveEditorContext } from '@ojplatform/plugin-sdk';
import editorPlugin from './OnlineCodeEditorContribution.js';
import { OnlineCodeEditorContribution } from './OnlineCodeEditorContribution.js';
export const problemPluginHost = new PluginHost();
problemPluginHost.register(editorPlugin.manifest, {
  id: editorPlugin.id,
  version: editorPlugin.manifest.version,
  apiVersion: editorPlugin.manifest.apiVersion,
  activate: () => ({
    slot: PROBLEM_SOLVE_EDITOR_SLOT,
    render: (context: unknown) => <OnlineCodeEditorContribution context={context as Parameters<typeof OnlineCodeEditorContribution>[0]['context']} />,
  }),
});
export function ProblemSolveEditorSlot({ context, host = problemPluginHost }: { context: ProblemSolveEditorContext; host?: PluginHost }) {
  const contributions = useMemo(() => host.contributions(PROBLEM_SOLVE_EDITOR_SLOT), [host]);
  if (!contributions.length) return null;
  return <>{contributions.map((contribution, index) => { try { return <div key={`${contribution.slot}-${index}`} className="plugin-contribution">{contribution.render(context) as ReactNode}</div>; } catch { return null; } })}</>;
}
