package adapter

import (
	"context"
	"testing"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

func TestRejectsRealSubmissionMode(t *testing.T) {
	r, err := Execute(context.Background(), supervisor.New(t.TempDir(), "runc", "missing"), model.Request{ExecutionMode: "REAL_SUBMISSION_EXECUTION", SandboxJobID: "job", JudgeJobID: "judge"})
	if err == nil || r.Outcome != supervisor.RejectedOutcome || !r.SyntheticQualification {
		t.Fatalf("expected fail-closed rejection: %+v %v", r, err)
	}
}
