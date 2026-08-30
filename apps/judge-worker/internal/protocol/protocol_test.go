package protocol

import (
	"testing"
	"time"
)

func validRequest() ExecutionRequest {
	return ExecutionRequest{ProtocolVersion: Version, JudgeJobID: "job", SubmissionID: "sub", Attempt: 1, CorrelationID: "corr", ProblemRevisionID: "rev", TestdataVersionRef: "td", LanguageID: "go", SourceSnapshotRef: "opaque:sub", SourceSHA256: SourceDigest([]byte("inert")), Limits: Limits{TimeMS: 1, MemoryMB: 1, OutputBytes: 1, Processes: 1}, ExecutionMode: SafeFixtureQualification, FixtureID: "FX-SUCCESS", DeadlineAt: time.Now().Add(time.Minute)}
}
func TestRequestValidationRejectsRealAndInjection(t *testing.T) {
	c := NewCapabilities("w", "i", "v", 1)
	r := validRequest()
	if err := r.Validate(time.Now(), c); err != nil {
		t.Fatal(err)
	}
	r.ExecutionMode = RealSandboxedExecution
	if err := r.Validate(time.Now(), c); err == nil {
		t.Fatal("real mode accepted")
	}
	r = validRequest()
	r.FixtureID = "/bin/sh"
	if err := r.Validate(time.Now(), c); err == nil {
		t.Fatal("arbitrary fixture accepted")
	}
}
func TestResultEnvelope(t *testing.T) {
	now := time.Now()
	r := ExecutionResult{ProtocolVersion: Version, JudgeJobID: "j", WorkerID: "w", WorkerInstanceID: "i", Attempt: 1, StartedAt: now, CompletedAt: now.Add(time.Millisecond), ExecutionStage: "SAFE_FIXTURE", SyntheticQualification: true, Outcome: SafeFixtureSucceeded, DiagnosticCode: "OK", SafeDiagnosticMessage: "qualification-only", CorrelationID: "c"}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestRealCapabilityIsExplicit(t *testing.T) {
	disabled := NewCapabilities("w", "i", "v", 1)
	if disabled.Supports(RealSandboxedExecution) {
		t.Fatal("default capability enabled real execution")
	}
	enabled := NewCapabilities("w", "i", "v", 1, true)
	if !enabled.Supports(RealSandboxedExecution) || enabled.RealProtocolVersion != RealVersion {
		t.Fatal("explicit real capability missing")
	}
}
