package model

import "time"

const ContractVersion = "2B.1"

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
	ContractVersion        string    `json:"contract_version"`
	SandboxJobID           string    `json:"sandbox_job_id"`
	JudgeJobID             string    `json:"judge_job_id"`
	TrustedProbeID         string    `json:"trusted_probe_id"`
	ProbeVersion           string    `json:"probe_version"`
	Outcome                string    `json:"outcome"`
	SyntheticQualification bool      `json:"synthetic_qualification"`
	ExitCode               int       `json:"exit_code"`
	Stdout                 string    `json:"stdout"`
	Stderr                 string    `json:"stderr"`
	Diagnostic             string    `json:"diagnostic"`
	StartedAt              time.Time `json:"started_at"`
	CompletedAt            time.Time `json:"completed_at"`
	CorrelationID          string    `json:"correlation_id"`
	Clean                  bool      `json:"clean"`
}
