package protocol

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

const Version = "2A.1"

type ExecutionMode string

const (
	SafeFixtureQualification ExecutionMode = "SAFE_FIXTURE_QUALIFICATION"
	RealSandboxedExecution   ExecutionMode = "REAL_SANDBOXED_EXECUTION"
)

type Limits struct {
	TimeMS      int `json:"time_ms"`
	MemoryMB    int `json:"memory_mb"`
	OutputBytes int `json:"output_bytes"`
	Processes   int `json:"processes"`
}

type ExecutionRequest struct {
	ProtocolVersion        string        `json:"protocol_version"`
	JudgeJobID             string        `json:"judge_job_id"`
	SubmissionID           string        `json:"submission_id"`
	Attempt                int           `json:"attempt"`
	CorrelationID          string        `json:"correlation_id"`
	ProblemRevisionID      string        `json:"problem_revision_id"`
	TestdataVersionRef     string        `json:"testdata_version_ref"`
	LanguageID             string        `json:"language_id"`
	SourceSnapshotRef      string        `json:"source_snapshot_ref"`
	SourceSHA256           string        `json:"source_sha256"`
	Limits                 Limits        `json:"limits"`
	ExecutionMode          ExecutionMode `json:"execution_mode"`
	FixtureID              string        `json:"fixture_id"`
	DeadlineAt             time.Time     `json:"deadline_at"`
	CancellationGeneration int64         `json:"cancellation_generation"`
}

type Outcome string

const (
	SafeFixtureSucceeded       Outcome = "SAFE_FIXTURE_SUCCEEDED"
	SafeFixtureFailedRetryable Outcome = "SAFE_FIXTURE_FAILED_RETRYABLE"
	SafeFixtureFailedTerminal  Outcome = "SAFE_FIXTURE_FAILED_TERMINAL"
	Cancelled                  Outcome = "CANCELLED"
	WorkerProtocolError        Outcome = "WORKER_PROTOCOL_ERROR"
	WorkerCapabilityMismatch   Outcome = "WORKER_CAPABILITY_MISMATCH"
)

type ExecutionResult struct {
	ProtocolVersion        string    `json:"protocol_version"`
	JudgeJobID             string    `json:"judge_job_id"`
	WorkerID               string    `json:"worker_id"`
	WorkerInstanceID       string    `json:"worker_instance_id"`
	Attempt                int       `json:"attempt"`
	StartedAt              time.Time `json:"started_at"`
	CompletedAt            time.Time `json:"completed_at"`
	ExecutionStage         string    `json:"execution_stage"`
	SyntheticQualification bool      `json:"synthetic_qualification"`
	Outcome                Outcome   `json:"outcome"`
	DiagnosticCode         string    `json:"diagnostic_code"`
	SafeDiagnosticMessage  string    `json:"safe_diagnostic_message"`
	CorrelationID          string    `json:"correlation_id"`
}

type Capabilities struct {
	ProtocolVersion        string   `json:"protocol_version"`
	WorkerID               string   `json:"worker_id"`
	WorkerInstanceID       string   `json:"worker_instance_id"`
	BuildVersion           string   `json:"build_version"`
	ExecutionModes         []string `json:"execution_modes"`
	SafeFixture            bool     `json:"safe_fixture"`
	RealSandboxedExecution bool     `json:"real_sandboxed_execution"`
	SandboxQualified       bool     `json:"sandbox_qualified"`
	LanguageCapabilities   []string `json:"language_capabilities"`
	MaxConcurrency         int      `json:"max_concurrency"`
}

var refPattern = regexp.MustCompile(`^[A-Za-z0-9._:/-]{1,256}$`)
var shaPattern = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)

func (r ExecutionRequest) Validate(now time.Time, c Capabilities) error {
	if r.ProtocolVersion != Version {
		return fmt.Errorf("unsupported protocol version")
	}
	for name, value := range map[string]string{"judge_job_id": r.JudgeJobID, "submission_id": r.SubmissionID, "correlation_id": r.CorrelationID, "problem_revision_id": r.ProblemRevisionID, "testdata_version_ref": r.TestdataVersionRef, "language_id": r.LanguageID, "source_snapshot_ref": r.SourceSnapshotRef} {
		if !refPattern.MatchString(value) {
			return fmt.Errorf("invalid %s", name)
		}
	}
	if r.Attempt < 1 {
		return errors.New("attempt must be positive")
	}
	if !shaPattern.MatchString(r.SourceSHA256) {
		return errors.New("source_sha256 must be sha256")
	}
	if r.Limits.TimeMS < 1 || r.Limits.MemoryMB < 1 || r.Limits.OutputBytes < 1 || r.Limits.Processes < 1 {
		return errors.New("invalid limits")
	}
	if r.ExecutionMode != SafeFixtureQualification {
		return fmt.Errorf("execution mode rejected: %s", r.ExecutionMode)
	}
	if _, ok := FixtureIDs[r.FixtureID]; !ok {
		return errors.New("unknown fixture")
	}
	if r.DeadlineAt.IsZero() || !r.DeadlineAt.After(now) {
		return errors.New("deadline expired")
	}
	if r.CancellationGeneration < 0 {
		return errors.New("invalid cancellation generation")
	}
	if !c.Supports(SafeFixtureQualification) {
		return errors.New("capability mismatch")
	}
	return nil
}

func (c Capabilities) Supports(mode ExecutionMode) bool {
	if mode != SafeFixtureQualification || !c.SafeFixture || c.RealSandboxedExecution || c.MaxConcurrency < 1 {
		return false
	}
	for _, m := range c.ExecutionModes {
		if m == string(mode) {
			return true
		}
	}
	return false
}

func NewCapabilities(workerID, instanceID, build string, max int) Capabilities {
	return Capabilities{ProtocolVersion: Version, WorkerID: workerID, WorkerInstanceID: instanceID, BuildVersion: build, ExecutionModes: []string{string(SafeFixtureQualification)}, SafeFixture: true, RealSandboxedExecution: false, SandboxQualified: false, LanguageCapabilities: []string{}, MaxConcurrency: max}
}

func SourceDigest(source []byte) string { h := sha256.Sum256(source); return hex.EncodeToString(h[:]) }
func DecodeRequest(data []byte) (ExecutionRequest, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var request ExecutionRequest
	if err := dec.Decode(&request); err != nil {
		return ExecutionRequest{}, fmt.Errorf("malformed execution request: %w", err)
	}
	return request, nil
}
func SafeOutcome(o Outcome) bool {
	return o == SafeFixtureSucceeded || o == SafeFixtureFailedRetryable || o == SafeFixtureFailedTerminal || o == Cancelled || o == WorkerProtocolError || o == WorkerCapabilityMismatch
}
func (r ExecutionResult) Validate() error {
	if r.ProtocolVersion != Version || r.JudgeJobID == "" || r.WorkerID == "" || r.WorkerInstanceID == "" || r.Attempt < 1 || r.CorrelationID == "" {
		return errors.New("invalid result identity")
	}
	if r.StartedAt.IsZero() || r.CompletedAt.Before(r.StartedAt) || !SafeOutcome(r.Outcome) || !r.SyntheticQualification {
		return errors.New("invalid result envelope")
	}
	if strings.Contains(strings.Join([]string{string(r.Outcome), r.DiagnosticCode, r.SafeDiagnosticMessage}, " "), "AC") {
		return errors.New("real verdict prohibited")
	}
	return nil
}

var FixtureIDs = map[string]struct{}{"FX-SUCCESS": {}, "FX-RETRYABLE": {}, "FX-TERMINAL": {}, "FX-SLOW": {}, "FX-CANCEL": {}}
