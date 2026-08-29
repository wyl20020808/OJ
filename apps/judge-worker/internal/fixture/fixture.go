package fixture

import (
	"context"
	"errors"
	"time"

	"github.com/ojplatform/judge-worker/internal/protocol"
)

type Executor struct{ Step time.Duration }

func (e Executor) Run(ctx context.Context, id string) (protocol.Outcome, string, error) {
	if _, ok := protocol.FixtureIDs[id]; !ok {
		return protocol.WorkerProtocolError, "UNKNOWN_FIXTURE", errors.New("unknown fixture")
	}
	if id == "FX-RETRYABLE" {
		return protocol.SafeFixtureFailedRetryable, "FIXTURE_RETRYABLE", nil
	}
	if id == "FX-TERMINAL" {
		return protocol.SafeFixtureFailedTerminal, "FIXTURE_TERMINAL", nil
	}
	step := e.Step
	if step <= 0 {
		step = 10 * time.Millisecond
	}
	steps := 1
	if id == "FX-SLOW" || id == "FX-CANCEL" {
		// Keep cancellation/crash qualification observable while remaining bounded.
		steps = 100
	}
	for i := 0; i < steps; i++ {
		select {
		case <-ctx.Done():
			return protocol.Cancelled, "CANCELLED", ctx.Err()
		case <-time.After(step):
		}
	}
	return protocol.SafeFixtureSucceeded, "FIXTURE_SUCCEEDED", nil
}
