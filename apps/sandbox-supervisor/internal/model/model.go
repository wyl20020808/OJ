package model

import "time"

const ContractVersion = "2B.1"
const ExecutionContractVersion = "2C.3"
const LegacyExecutionContractVersion = "2C.1"
const TestcaseContractVersion = "2C.3"
const ExecutionSetContractVersion = "2C.4"

// ExecutionState is the lifecycle vocabulary shared by the Supervisor and
// qualification harness.  It describes what happened, not an OJ verdict.
type ExecutionState string

const (
	StateAccepted         ExecutionState = "ACCEPTED"
	StateQueued           ExecutionState = "QUEUED"
	StateClaimed          ExecutionState = "CLAIMED"
	StateCompilePreparing ExecutionState = "COMPILE_PREPARING"
	StateCompiling        ExecutionState = "COMPILING"
	StateCompileSucceeded ExecutionState = "COMPILE_SUCCEEDED"
	StateCompileFailed    ExecutionState = "COMPILE_FAILED"
	StateRuntimePreparing ExecutionState = "RUNTIME_PREPARING"
	StateRunning          ExecutionState = "RUNNING"
	StateCancelRequested  ExecutionState = "CANCEL_REQUESTED"
	StateCancelled        ExecutionState = "CANCELLED"
	StateRawCompleted     ExecutionState = "RAW_COMPLETED"
	StateRawLimitEvent    ExecutionState = "RAW_LIMIT_EVENT"
	StateInfraFailed      ExecutionState = "INFRA_FAILED"
	StateCleanupPending   ExecutionState = "CLEANUP_PENDING"
	StateCleanupVerified  ExecutionState = "CLEANUP_VERIFIED"
)

// ExecutionIdentity keeps logical-job identity separate from one attempt and
// from the two sandbox lifecycles used by compilation and runtime.
type ExecutionIdentity struct {
	SubmissionID       string `json:"submission_id"`
	SnapshotID         string `json:"snapshot_id"`
	JudgeJobID         string `json:"judge_job_id"`
	ExecutionRequestID string `json:"execution_request_id"`
	ExecutionAttemptID string `json:"execution_attempt_id"`
	CompileAttemptID   string `json:"compile_attempt_id"`
	RuntimeAttemptID   string `json:"runtime_attempt_id"`
	SandboxID          string `json:"sandbox_id"`
	ArtifactID         string `json:"artifact_id"`
	ArtifactSHA256     string `json:"artifact_sha256"`
	ResultGeneration   int64  `json:"result_generation"`
}

// ResourceOwnership is persisted beside Supervisor-owned resources so startup
// recovery can prove exact ownership before removing anything.
type ResourceOwnership struct {
	Schema             string `json:"schema"`
	ResourceKind       string `json:"resource_kind"`
	SubmissionID       string `json:"submission_id"`
	JudgeJobID         string `json:"judge_job_id"`
	ExecutionRequestID string `json:"execution_request_id"`
	ExecutionAttemptID string `json:"execution_attempt_id"`
	CompileAttemptID   string `json:"compile_attempt_id,omitempty"`
	SandboxID          string `json:"sandbox_id"`
	CreatedAt          string `json:"created_at"`
}

type Request struct {
	ContractVersion        string    `json:"contract_version"`
	SandboxJobID           string    `json:"sandbox_job_id"`
	JudgeJobID             string    `json:"judge_job_id"`
	WorkerID               string    `json:"worker_id"`
	WorkerInstanceID       string    `json:"worker_instance_id"`
	TrustedProbeID         string    `json:"trusted_probe_id"`
	ProbeVersion           string    `json:"probe_version"`
	ProbeHash              string    `json:"probe_hash"`
	PolicyIDs              []string  `json:"policy_ids"`
	CPUMillis              int       `json:"cpu_millis"`
	WallTimeMS             int       `json:"wall_time_ms"`
	MemoryBytes            int64     `json:"memory_bytes"`
	OutputBytes            int       `json:"output_bytes"`
	Pids                   int       `json:"pids"`
	CancellationGeneration int64     `json:"cancellation_generation"`
	DeadlineAt             time.Time `json:"deadline_at"`
	CorrelationID          string    `json:"correlation_id"`
	ExecutionMode          string    `json:"execution_mode"`
}

type Result struct {
	ContractVersion        string           `json:"contract_version"`
	SandboxJobID           string           `json:"sandbox_job_id"`
	JudgeJobID             string           `json:"judge_job_id"`
	TrustedProbeID         string           `json:"trusted_probe_id"`
	ProbeVersion           string           `json:"probe_version"`
	Outcome                string           `json:"outcome"`
	SyntheticQualification bool             `json:"synthetic_qualification"`
	ExitCode               int              `json:"exit_code"`
	Stdout                 string           `json:"stdout"`
	Stderr                 string           `json:"stderr"`
	Diagnostic             string           `json:"diagnostic"`
	StartedAt              time.Time        `json:"started_at"`
	CompletedAt            time.Time        `json:"completed_at"`
	CorrelationID          string           `json:"correlation_id"`
	Clean                  bool             `json:"clean"`
	Evidence               *RuntimeEvidence `json:"evidence,omitempty"`
}

// RuntimeEvidence is retained only on the loopback Supervisor protocol. The
// API projects bounded qualification outcomes and never forwards cgroup paths.
type RuntimeEvidence struct {
	SupervisorUID    int    `json:"supervisor_uid"`
	SupervisorGID    int    `json:"supervisor_gid"`
	RequestedMemory  int64  `json:"requested_memory_bytes"`
	OCIMemory        int64  `json:"oci_memory_bytes"`
	SystemdMemoryMax string `json:"systemd_memory_max"`
	MemoryMax        string `json:"memory_max"`
	MemoryCurrent    string `json:"memory_current"`
	MemoryEvents     string `json:"memory_events"`
	RequestedPids    int    `json:"requested_pids"`
	OCIPids          int64  `json:"oci_pids"`
	SystemdTasksMax  string `json:"systemd_tasks_max"`
	PidsMax          string `json:"pids_max"`
	PidsCurrent      string `json:"pids_current"`
	PidsEvents       string `json:"pids_events"`
	CPUMax           string `json:"cpu_max"`
	CPUStat          string `json:"cpu_stat"`
	CPUUsageUsec     int64  `json:"cpu_usage_usec"`
	CPUUsageSource   string `json:"cpu_usage_source"`
	MemoryPeak       string `json:"memory_peak"`
	MemoryPeakSource string `json:"memory_peak_source"`
	ControlGroup     string `json:"control_group"`
}

type ExecutionLimits struct {
	CPUMillis      int   `json:"cpu_millis"`
	WallTimeMS     int   `json:"wall_time_ms"`
	MemoryBytes    int64 `json:"memory_bytes"`
	OutputBytes    int   `json:"output_bytes"`
	Pids           int   `json:"pids"`
	WorkspaceBytes int64 `json:"workspace_bytes"`
}

// TestcaseIdentity is immutable for the logical testcase. Retries may change
// ExecutionAttemptID, but must never change the other bindings.
type TestcaseIdentity struct {
	ProblemID          string `json:"problem_id"`
	ProblemRevisionID  string `json:"problem_revision_id"`
	TestdataVersionID  string `json:"testdata_version_id"`
	TestcaseID         string `json:"testcase_id"`
	InputSHA256        string `json:"input_sha256"`
	ExecutionProfileID string `json:"execution_profile_id"`
	ExecutionAttemptID string `json:"execution_attempt_id"`
}

type TestcaseInput struct {
	TestcaseID        string `json:"testcase_id"`
	TestdataVersionID string `json:"testdata_version_id"`
	Bytes             []byte `json:"bytes"`
	SHA256            string `json:"sha256"`
}

type ExecutionProfile struct {
	ID                     string          `json:"id"`
	LanguageRuntime        string          `json:"language_runtime"`
	ArtifactSHA256         string          `json:"artifact_sha256"`
	Limits                 ExecutionLimits `json:"limits"`
	FilesystemPolicyID     string          `json:"filesystem_policy_id"`
	NetworkPolicyID        string          `json:"network_policy_id"`
	SeccompPolicyID        string          `json:"seccomp_policy_id"`
	EnvironmentAllowlistID string          `json:"environment_allowlist_id"`
	StdinLimitBytes        int             `json:"stdin_limit_bytes"`
}

type Measurement struct {
	Available bool   `json:"available"`
	Value     int64  `json:"value,omitempty"`
	Source    string `json:"source"`
	Units     string `json:"units"`
	Semantics string `json:"semantics"`
}

type MemoryMeasurement struct {
	Max       Measurement `json:"max"`
	Current   Measurement `json:"current"`
	Peak      Measurement `json:"peak"`
	EventsRaw string      `json:"events_raw"`
}

type PidsMeasurement struct {
	Max       Measurement `json:"max"`
	Current   Measurement `json:"current"`
	EventsRaw string      `json:"events_raw"`
}

type OutputCapture struct {
	SHA256    string `json:"sha256"`
	ByteCount int    `json:"byte_count"`
	Truncated bool   `json:"truncated"`
}

// SingleTestcaseExecutionRecord is the immutable "what happened" record
// consumed by a future verdict engine. It intentionally contains no verdict.
type SingleTestcaseExecutionRecord struct {
	RecordVersion         string            `json:"record_version"`
	RecordID              string            `json:"record_id"`
	SubmissionID          string            `json:"submission_id"`
	SnapshotID            string            `json:"snapshot_id"`
	ArtifactSHA256        string            `json:"artifact_sha256"`
	Identity              TestcaseIdentity  `json:"identity"`
	Input                 TestcaseInput     `json:"input"`
	Profile               ExecutionProfile  `json:"profile"`
	Stdin                 OutputCapture     `json:"stdin"`
	Wall                  Measurement       `json:"wall"`
	CPU                   Measurement       `json:"cpu"`
	Memory                MemoryMeasurement `json:"memory"`
	Pids                  PidsMeasurement   `json:"pids"`
	Stdout                OutputCapture     `json:"stdout"`
	Stderr                OutputCapture     `json:"stderr"`
	Facts                 RawExecutionFacts `json:"facts"`
	PipelineOutcome       string            `json:"pipeline_outcome"`
	CleanupVerified       bool              `json:"cleanup_verified"`
	PublishedAt           time.Time         `json:"published_at"`
	Digest                string            `json:"digest"`
	ExecutionSetAttemptID string            `json:"execution_set_attempt_id,omitempty"`
	// Keep index 0 on the wire: omitempty would erase the first set member's
	// immutable binding.
	TestcaseIndex           int    `json:"testcase_index"`
	TestcaseSetManifestHash string `json:"testcase_set_manifest_hash,omitempty"`
}

type RealExecutionRequest struct {
	ProtocolVersion         string    `json:"protocol_version"`
	ExecutionRequestID      string    `json:"execution_request_id"`
	JudgeJobID              string    `json:"judge_job_id"`
	SubmissionID            string    `json:"submission_id"`
	Attempt                 int       `json:"attempt"`
	CorrelationID           string    `json:"correlation_id"`
	ProblemRevisionID       string    `json:"problem_revision_id"`
	TestdataVersionRef      string    `json:"testdata_version_ref"`
	ProblemID               string    `json:"problem_id,omitempty"`
	TestcaseID              string    `json:"testcase_id,omitempty"`
	TestcaseInput           []byte    `json:"testcase_input,omitempty"`
	TestcaseInputSHA256     string    `json:"testcase_input_sha256,omitempty"`
	ExecutionProfileID      string    `json:"execution_profile_id,omitempty"`
	LanguageProfileID       string    `json:"language_profile_id"`
	SourceSnapshotRef       string    `json:"source_snapshot_ref"`
	SourceBytes             string    `json:"source_bytes"`
	SourceSHA256            string    `json:"source_sha256"`
	ControlledInputID       string    `json:"controlled_input_id"`
	DeadlineAt              time.Time `json:"deadline_at"`
	CancellationGeneration  int64     `json:"cancellation_generation"`
	ExecutionSetAttemptID   string    `json:"execution_set_attempt_id,omitempty"`
	TestcaseIndex           int       `json:"testcase_index,omitempty"`
	TestcaseSetManifestHash string    `json:"testcase_set_manifest_hash,omitempty"`
}

type TestcaseSetEntry struct {
	Index                int    `json:"index"`
	TestcaseID           string `json:"testcase_id"`
	TestdataVersionID    string `json:"testdata_version_id"`
	Input                []byte `json:"input"`
	InputSHA256          string `json:"input_sha256"`
	ExecutionProfileID   string `json:"execution_profile_id"`
	ExpectedOutputSHA256 string `json:"expected_output_sha256,omitempty"`
}

type TestcaseSetManifest struct {
	ProblemID          string             `json:"problem_id"`
	ProblemRevisionID  string             `json:"problem_revision_id"`
	TestdataVersionID  string             `json:"testdata_version_id"`
	TestcaseSetID      string             `json:"testcase_set_id"`
	ExecutionProfileID string             `json:"execution_profile_id"`
	Entries            []TestcaseSetEntry `json:"entries"`
	ManifestHash       string             `json:"manifest_hash"`
}

type RealExecutionSetRequest struct {
	ProtocolVersion        string              `json:"protocol_version"`
	ExecutionSetRequestID  string              `json:"execution_set_request_id"`
	JudgeJobID             string              `json:"judge_job_id"`
	SubmissionID           string              `json:"submission_id"`
	Attempt                int                 `json:"attempt"`
	CorrelationID          string              `json:"correlation_id"`
	Manifest               TestcaseSetManifest `json:"manifest"`
	ExecutionPolicy        string              `json:"execution_policy"`
	LanguageProfileID      string              `json:"language_profile_id"`
	SourceSnapshotRef      string              `json:"source_snapshot_ref"`
	SourceBytes            string              `json:"source_bytes"`
	SourceSHA256           string              `json:"source_sha256"`
	DeadlineAt             time.Time           `json:"deadline_at"`
	CancellationGeneration int64               `json:"cancellation_generation"`
}

type TestcaseSetMemberResult struct {
	Index              int                            `json:"index"`
	TestcaseID         string                         `json:"testcase_id"`
	InputSHA256        string                         `json:"input_sha256"`
	TestdataVersionID  string                         `json:"testdata_version_id"`
	ExecutionProfileID string                         `json:"execution_profile_id"`
	Status             string                         `json:"status"`
	Record             *SingleTestcaseExecutionRecord `json:"record,omitempty"`
}

type AggregateExecutionSetRecord struct {
	RecordVersion            string                    `json:"record_version"`
	RecordID                 string                    `json:"record_id"`
	SubmissionID             string                    `json:"submission_id"`
	SnapshotID               string                    `json:"snapshot_id"`
	SourceSHA256             string                    `json:"source_sha256"`
	ArtifactSHA256           string                    `json:"artifact_sha256"`
	ProblemID                string                    `json:"problem_id"`
	ProblemRevisionID        string                    `json:"problem_revision_id"`
	TestdataVersionID        string                    `json:"testdata_version_id"`
	TestcaseSetID            string                    `json:"testcase_set_id"`
	ManifestHash             string                    `json:"manifest_hash"`
	ExecutionSetRequestID    string                    `json:"execution_set_request_id"`
	ExecutionSetAttemptID    string                    `json:"execution_set_attempt_id"`
	ExecutionProfileID       string                    `json:"execution_profile_id"`
	ExecutionPolicy          string                    `json:"execution_policy"`
	TotalTestcaseCount       int                       `json:"total_testcase_count"`
	StartedTestcaseCount     int                       `json:"started_testcase_count"`
	CompletedTestcaseCount   int                       `json:"completed_testcase_count"`
	Testcases                []TestcaseSetMemberResult `json:"testcases"`
	SetCancelled             bool                      `json:"set_cancelled"`
	SetInfrastructureFailure bool                      `json:"set_infrastructure_failure"`
	StopReason               string                    `json:"stop_reason"`
	CleanupVerified          bool                      `json:"cleanup_verified"`
	Digest                   string                    `json:"digest"`
}

type RealExecutionSetResult struct {
	ProtocolVersion          string                       `json:"protocol_version"`
	ExecutionSetRequestID    string                       `json:"execution_set_request_id"`
	ExecutionSetAttemptID    string                       `json:"execution_set_attempt_id"`
	JudgeJobID               string                       `json:"judge_job_id"`
	SubmissionID             string                       `json:"submission_id"`
	Attempt                  int                          `json:"attempt"`
	ResultGeneration         int64                        `json:"result_generation"`
	CorrelationID            string                       `json:"correlation_id"`
	LanguageProfileID        string                       `json:"language_profile_id"`
	SourceSHA256             string                       `json:"source_sha256"`
	ProblemID                string                       `json:"problem_id"`
	ProblemRevisionID        string                       `json:"problem_revision_id"`
	TestdataVersionID        string                       `json:"testdata_version_id"`
	TestcaseSetID            string                       `json:"testcase_set_id"`
	TestcaseSetManifestHash  string                       `json:"testcase_set_manifest_hash"`
	ExecutionProfileID       string                       `json:"execution_profile_id"`
	ExecutionSetPolicy       string                       `json:"execution_set_policy"`
	PipelineOutcome          string                       `json:"pipeline_outcome"`
	Compile                  StageResult                  `json:"compile"`
	Artifact                 *ArtifactResult              `json:"artifact,omitempty"`
	AggregateExecutionRecord *AggregateExecutionSetRecord `json:"aggregate_execution_set_record,omitempty"`
	StartedAt                time.Time                    `json:"started_at"`
	CompletedAt              time.Time                    `json:"completed_at"`
	Clean                    bool                         `json:"clean"`
}

type ArtifactResult struct {
	ArtifactID         string `json:"artifact_id"`
	CompileAttemptID   string `json:"compile_attempt_id"`
	SandboxID          string `json:"sandbox_id"`
	SHA256             string `json:"sha256"`
	SizeBytes          int64  `json:"size_bytes"`
	LanguageProfileID  string `json:"language_profile_id"`
	CompilerVersion    string `json:"compiler_version"`
	CompilerRootfsID   string `json:"compiler_rootfs_identity"`
	CommandTemplateSHA string `json:"command_template_sha256"`
	SourceSHA256       string `json:"source_sha256"`
}

type StageResult struct {
	Outcome           string            `json:"outcome"`
	State             ExecutionState    `json:"state,omitempty"`
	ExitCode          int               `json:"exit_code"`
	TerminationSignal string            `json:"termination_signal,omitempty"`
	Stdout            string            `json:"stdout"`
	Stderr            string            `json:"stderr"`
	StdoutBytes       int               `json:"stdout_bytes"`
	StderrBytes       int               `json:"stderr_bytes"`
	StdoutSHA256      string            `json:"stdout_sha256"`
	StderrSHA256      string            `json:"stderr_sha256"`
	StdoutTruncated   bool              `json:"stdout_truncated"`
	StderrTruncated   bool              `json:"stderr_truncated"`
	WallTimeMS        int64             `json:"wall_time_ms"`
	SetupTimeMS       int64             `json:"setup_time_ms,omitempty"`
	CPUTimeUsec       int64             `json:"cpu_time_usec,omitempty"`
	CPUTimeSource     string            `json:"cpu_time_source,omitempty"`
	MemoryPeakBytes   int64             `json:"memory_peak_bytes,omitempty"`
	MemoryPeakSource  string            `json:"memory_peak_source,omitempty"`
	DiagnosticCode    string            `json:"diagnostic_code,omitempty"`
	Clean             bool              `json:"clean"`
	Evidence          *RuntimeEvidence  `json:"resource_evidence,omitempty"`
	Facts             RawExecutionFacts `json:"raw_facts"`
}

type RawExecutionFacts struct {
	ProcessExited      bool   `json:"process_exited"`
	ExitCode           int    `json:"exit_code"`
	TerminationSignal  string `json:"termination_signal,omitempty"`
	WallLimitReached   bool   `json:"wall_limit_reached"`
	MemoryLimitEvent   bool   `json:"memory_limit_event"`
	PidsLimitEvent     bool   `json:"pids_limit_event"`
	StdoutTruncated    bool   `json:"stdout_truncated"`
	StderrTruncated    bool   `json:"stderr_truncated"`
	Cancelled          bool   `json:"cancelled"`
	SandboxSetupFailed bool   `json:"sandbox_setup_failed"`
	RuntimeInfraFailed bool   `json:"runtime_infra_failed"`
	CleanupVerified    bool   `json:"cleanup_verified"`
}

type RealExecutionResult struct {
	ProtocolVersion     string                         `json:"protocol_version"`
	ExecutionRequestID  string                         `json:"execution_request_id"`
	JudgeJobID          string                         `json:"judge_job_id"`
	SubmissionID        string                         `json:"submission_id"`
	Attempt             int                            `json:"attempt"`
	ExecutionAttemptID  string                         `json:"execution_attempt_id"`
	CompileAttemptID    string                         `json:"compile_attempt_id"`
	RuntimeAttemptID    string                         `json:"runtime_attempt_id"`
	CompileSandboxID    string                         `json:"compile_sandbox_id"`
	RuntimeSandboxID    string                         `json:"runtime_sandbox_id"`
	ResultGeneration    int64                          `json:"result_generation"`
	CorrelationID       string                         `json:"correlation_id"`
	LanguageProfileID   string                         `json:"language_profile_id"`
	SourceSHA256        string                         `json:"source_sha256"`
	ProblemID           string                         `json:"problem_id,omitempty"`
	ProblemRevisionID   string                         `json:"problem_revision_id,omitempty"`
	TestdataVersionID   string                         `json:"testdata_version_id,omitempty"`
	TestcaseID          string                         `json:"testcase_id,omitempty"`
	TestcaseInputSHA256 string                         `json:"testcase_input_sha256,omitempty"`
	ExecutionProfileID  string                         `json:"execution_profile_id,omitempty"`
	PipelineOutcome     string                         `json:"pipeline_outcome"`
	Compile             StageResult                    `json:"compile"`
	Artifact            *ArtifactResult                `json:"artifact,omitempty"`
	Runtime             *StageResult                   `json:"runtime,omitempty"`
	StartedAt           time.Time                      `json:"started_at"`
	CompletedAt         time.Time                      `json:"completed_at"`
	Clean               bool                           `json:"clean"`
	ExecutionRecord     *SingleTestcaseExecutionRecord `json:"single_testcase_record,omitempty"`
}
