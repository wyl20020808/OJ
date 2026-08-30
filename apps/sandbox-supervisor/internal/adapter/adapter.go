package adapter

import (
	"context"
	"errors"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/probe"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

// Execute is the typed Worker -> Supervisor boundary. It intentionally exposes
// only synthetic qualification; submission execution is not a supported mode.
func Execute(ctx context.Context, s *supervisor.Supervisor, request model.Request) (model.Result, error) {
	if request.ExecutionMode != "SANDBOX_PROBE_QUALIFICATION" || request.TrustedProbeID != probe.ID {
		return model.Result{ContractVersion: model.ContractVersion, SandboxJobID: request.SandboxJobID, JudgeJobID: request.JudgeJobID, CorrelationID: request.CorrelationID, SyntheticQualification: true, Outcome: supervisor.RejectedOutcome}, errors.New("sandbox adapter accepts qualification probe only")
	}
	return s.Run(ctx, request)
}
