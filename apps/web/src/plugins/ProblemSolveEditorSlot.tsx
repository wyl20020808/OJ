import { Component, useMemo, type ErrorInfo, type ReactNode } from 'react';
import {
  PluginHost,
  PROBLEM_SOLVE_EDITOR_SLOT,
  type ProblemSolveEditorContext,
} from '@ojplatform/plugin-sdk';
import editorPlugin from './OnlineCodeEditorContribution.js';
import { OnlineCodeEditorContribution } from './OnlineCodeEditorContribution.js';
export const problemPluginHost = new PluginHost();
const registration = problemPluginHost.register(editorPlugin.manifest, {
  id: editorPlugin.id,
  version: editorPlugin.manifest.version,
  apiVersion: editorPlugin.manifest.apiVersion,
  activate: () => ({
    slot: PROBLEM_SOLVE_EDITOR_SLOT,
    render: (context: unknown) => (
      <OnlineCodeEditorContribution
        context={
          context as Parameters<
            typeof OnlineCodeEditorContribution
          >[0]['context']
        }
      />
    ),
  }),
});

function PluginUnavailable({ reason }: { reason: 'unavailable' | 'failed' }) {
  const message =
    reason === 'failed'
      ? 'Online Code Editor load failed.'
      : 'Online Code Editor unavailable.';
  return (
    <div className="plugin-slot-fallback" role="alert">
      <strong>{message}</strong>
      <span>Please reload or use the standalone submission page.</span>
    </div>
  );
}

class ContributionErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[PluginHost] problem.solve.editor contribution failed', {
      pluginId: editorPlugin.id,
      error,
      componentStack: info.componentStack,
    });
  }

  override render() {
    return this.state.failed ? (
      <PluginUnavailable reason="failed" />
    ) : (
      this.props.children
    );
  }
}

export function ProblemSolveEditorSlot({
  context,
  host = problemPluginHost,
}: {
  context: ProblemSolveEditorContext;
  host?: PluginHost;
}) {
  const contributions = useMemo(
    () => host.contributions(PROBLEM_SOLVE_EDITOR_SLOT),
    [host],
  );
  if (!registration || !contributions.length)
    return <PluginUnavailable reason="unavailable" />;
  return (
    <>
      {contributions.map((contribution, index) => {
        try {
          return (
            <ContributionErrorBoundary key={`${contribution.slot}-${index}`}>
              <div className="plugin-contribution">
                {contribution.render(context) as ReactNode}
              </div>
            </ContributionErrorBoundary>
          );
        } catch (error) {
          console.error('[PluginHost] problem.solve.editor render failed', {
            pluginId: editorPlugin.id,
            error,
          });
          return (
            <PluginUnavailable
              key={`${contribution.slot}-${index}`}
              reason="failed"
            />
          );
        }
      })}
    </>
  );
}
