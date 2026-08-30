package model

import "time"

const ContractVersion = "2B.1"
const ExecutionContractVersion = "2C.1"

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

type RealExecutionRequest struct {
	ProtocolVersion        string    `json:"protocol_version"`
	ExecutionRequestID     string    `json:"execution_request_id"`
	JudgeJobID             string    `json:"judge_job_id"`
	SubmissionID           string    `json:"submission_id"`
	Attempt                int       `json:"attempt"`
	CorrelationID          string    `json:"correlation_id"`
	ProblemRevisionID      string    `json:"problem_revision_id"`
	TestdataVersionRef     string    `json:"testdata_version_ref"`
	LanguageProfileID      string    `json:"language_profile_id"`
	SourceSnapshotRef      string    `json:"source_snapshot_ref"`
	SourceBytes            string    `json:"source_bytes"`
	SourceSHA256           string    `json:"source_sha256"`
	ControlledInputID      string    `json:"controlled_input_id"`
	DeadlineAt             time.Time `json:"deadline_at"`
	CancellationGeneration int64     `json:"cancellation_generation"`
}

type ArtifactResult struct {
	SHA256             string `json:"sha256"`
	SizeBytes          int64  `json:"size_bytes"`
	LanguageProfileID  string `json:"language_profile_id"`
	CompilerVersion    string `json:"compiler_version"`
	CompilerRootfsID   string `json:"compiler_rootfs_identity"`
	CommandTemplateSHA string `json:"command_template_sha256"`
	SourceSHA256       string `json:"source_sha256"`
}

type StageResult struct {
	Outcome           string           `json:"outcome"`
	ExitCode          int              `json:"exit_code"`
	TerminationSignal string           `json:"termination_signal,omitempty"`
	Stdout            string           `json:"stdout"`
	Stderr            string           `json:"stderr"`
	StdoutTruncated   bool             `json:"stdout_truncated"`
	StderrTruncated   bool             `json:"stderr_truncated"`
	WallTimeMS        int64            `json:"wall_time_ms"`
	DiagnosticCode    string           `json:"diagnostic_code,omitempty"`
	Clean             bool             `json:"clean"`
	Evidence          *RuntimeEvidence `json:"resource_evidence,omitempty"`
}

type RealExecutionResult struct {
	ProtocolVersion    string          `json:"protocol_version"`
	ExecutionRequestID string          `json:"execution_request_id"`
	JudgeJobID         string          `json:"judge_job_id"`
	SubmissionID       string          `json:"submission_id"`
	Attempt            int             `json:"attempt"`
	CorrelationID      string          `json:"correlation_id"`
	LanguageProfileID  string          `json:"language_profile_id"`
	SourceSHA256       string          `json:"source_sha256"`
	PipelineOutcome    string          `json:"pipeline_outcome"`
	Compile            StageResult     `json:"compile"`
	Artifact           *ArtifactResult `json:"artifact,omitempty"`
	Runtime            *StageResult    `json:"runtime,omitempty"`
	StartedAt          time.Time       `json:"started_at"`
	CompletedAt        time.Time       `json:"completed_at"`
	Clean              bool            `json:"clean"`
}
