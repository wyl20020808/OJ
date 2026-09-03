import { useMemo, type ReactNode } from 'react';
import { PluginHost, PROBLEM_SOLVE_EDITOR_SLOT, type ProblemSolveEditorContext } from '@ojplatform/plugin-sdk';
export const problemPluginHost = new PluginHost();
export function ProblemSolveEditorSlot({ context, host = problemPluginHost }: { context: ProblemSolveEditorContext; host?: PluginHost }) {
  const contributions = useMemo(() => host.contributions(PROBLEM_SOLVE_EDITOR_SLOT), [host]);
  if (!contributions.length) return null;
  return <>{contributions.map((contribution, index) => { try { return <div key={`${contribution.slot}-${index}`} className="plugin-contribution">{contribution.render(context) as ReactNode}</div>; } catch { return null; } })}</>;
}
