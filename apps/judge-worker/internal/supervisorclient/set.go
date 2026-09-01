package supervisorclient

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const SetProtocolVersion = "2C.4"

const (
	pipelineCompleted     = "PIPELINE_COMPLETED"
	pipelineCompileFailed = "PIPELINE_COMPILE_FAILED"
	pipelineLimitHit      = "PIPELINE_LIMIT_HIT"
	pipelineCancelled     = "PIPELINE_CANCELLED"
	pipelineInfraFailure  = "PIPELINE_INFRA_FAILURE"
)

type TestcaseSetEntry struct {
	Index                int    `json:"index"`
	TestcaseID           string `json:"testcase_id"`
	TestdataVersionID    string `json:"testdata_version_id"`
	Input                []byte `json:"input"`
	InputSHA256          string `json:"input_sha256"`
	ExecutionProfileID   string `json:"execution_profile_id"`
	ExpectedOutputSHA256 string `json:"expected_output_sha256,omitempty"`
	CheckerType          string `json:"checker_type,omitempty"`
	CheckerVersion       string `json:"checker_version,omitempty"`
	CheckerConfigSHA256  string `json:"checker_config_sha256,omitempty"`
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

type SetRequest struct {
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
	ExecutionSetAttemptID  string              `json:"-"`
}

type SetResult struct {
	ProtocolVersion          string          `json:"protocol_version"`
	ExecutionSetRequestID    string          `json:"execution_set_request_id"`
	ExecutionSetAttemptID    string          `json:"execution_set_attempt_id"`
	JudgeJobID               string          `json:"judge_job_id"`
	SubmissionID             string          `json:"submission_id"`
	Attempt                  int             `json:"attempt"`
	ResultGeneration         int64           `json:"result_generation"`
	CorrelationID            string          `json:"correlation_id"`
	LanguageProfileID        string          `json:"language_profile_id"`
	SourceSHA256             string          `json:"source_sha256"`
	ProblemID                string          `json:"problem_id"`
	ProblemRevisionID        string          `json:"problem_revision_id"`
	TestdataVersionID        string          `json:"testdata_version_id"`
	TestcaseSetID            string          `json:"testcase_set_id"`
	TestcaseSetManifestHash  string          `json:"testcase_set_manifest_hash"`
	ExecutionProfileID       string          `json:"execution_profile_id"`
	ExecutionSetPolicy       string          `json:"execution_set_policy"`
	PipelineOutcome          string          `json:"pipeline_outcome"`
	Compile                  json.RawMessage `json:"compile"`
	Artifact                 json.RawMessage `json:"artifact,omitempty"`
	AggregateExecutionRecord json.RawMessage `json:"aggregate_execution_set_record"`
	StartedAt                time.Time       `json:"started_at"`
	CompletedAt              time.Time       `json:"completed_at"`
	Clean                    bool            `json:"clean"`
}

type SetExecution struct {
	Result SetResult
	Raw    json.RawMessage
}

type setAggregate struct {
	RecordVersion          string      `json:"record_version"`
	RecordID               string      `json:"record_id"`
	SubmissionID           string      `json:"submission_id"`
	SnapshotID             string      `json:"snapshot_id"`
	SourceSHA256           string      `json:"source_sha256"`
	ArtifactSHA256         string      `json:"artifact_sha256"`
	ProblemID              string      `json:"problem_id"`
	ProblemRevisionID      string      `json:"problem_revision_id"`
	TestdataVersionID      string      `json:"testdata_version_id"`
	TestcaseSetID          string      `json:"testcase_set_id"`
	ManifestHash           string      `json:"manifest_hash"`
	ExecutionSetRequestID  string      `json:"execution_set_request_id"`
	ExecutionSetAttemptID  string      `json:"execution_set_attempt_id"`
	ExecutionProfileID     string      `json:"execution_profile_id"`
	ExecutionPolicy        string      `json:"execution_policy"`
	TotalTestcaseCount     int         `json:"total_testcase_count"`
	StartedTestcaseCount   int         `json:"started_testcase_count"`
	CompletedTestcaseCount int         `json:"completed_testcase_count"`
	Testcases              []setMember `json:"testcases"`
	SetCancelled           bool        `json:"set_cancelled"`
	SetInfrastructure      bool        `json:"set_infrastructure_failure"`
	StopReason             string      `json:"stop_reason"`
	CleanupVerified        bool        `json:"cleanup_verified"`
	Digest                 string      `json:"digest"`
}

type setMember struct {
	Index                 int             `json:"index"`
	TestcaseID            string          `json:"testcase_id"`
	InputSHA256           string          `json:"input_sha256"`
	TestdataVersionID     string          `json:"testdata_version_id"`
	ExecutionProfileID    string          `json:"execution_profile_id"`
	Status                string          `json:"status"`
	Record                json.RawMessage `json:"record,omitempty"`
	ActualStdout          []byte          `json:"actual_stdout"`
	ActualStdoutSHA256    string          `json:"actual_stdout_sha256"`
	ActualStdoutBytes     int             `json:"actual_stdout_bytes"`
	ActualStdoutTruncated bool            `json:"actual_stdout_truncated"`
}

func TestcaseSetManifestHash(manifest TestcaseSetManifest) string {
	parts := []string{SetProtocolVersion, manifest.ProblemID, manifest.ProblemRevisionID, manifest.TestdataVersionID, manifest.TestcaseSetID, manifest.ExecutionProfileID, strconv.Itoa(len(manifest.Entries))}
	for _, entry := range manifest.Entries {
		parts = append(parts, strconv.Itoa(entry.Index), entry.TestcaseID, entry.TestdataVersionID, entry.InputSHA256, entry.ExecutionProfileID, entry.ExpectedOutputSHA256)
		if entry.CheckerType != "" || entry.CheckerVersion != "" || entry.CheckerConfigSHA256 != "" {
			parts = append(parts, "2C.5", entry.CheckerType, entry.CheckerVersion, entry.CheckerConfigSHA256)
		}
	}
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:])
}

func validateSetRequest(request SetRequest) error {
	if request.ExecutionSetAttemptID == "" {
		request.ExecutionSetAttemptID = request.ExecutionSetRequestID + ":attempt"
	}
	if request.ProtocolVersion != SetProtocolVersion || request.ExecutionSetRequestID == "" || request.JudgeJobID == "" || request.SubmissionID == "" || request.CorrelationID == "" || request.Attempt < 1 || request.LanguageProfileID != CPP20ProfileID || request.ExecutionPolicy != "RUN_ALL" && request.ExecutionPolicy != "STOP_ON_EXECUTION_BLOCKING_EVENT" || request.DeadlineAt.IsZero() || !request.DeadlineAt.After(time.Now()) {
		return errors.New("invalid testcase-set request")
	}
	if len(request.SourceBytes) == 0 || len(request.SourceBytes) > 256<<10 || digestString(request.SourceBytes) != request.SourceSHA256 || request.SourceSnapshotRef == "" || request.Manifest.ExecutionProfileID != CPP20ProfileID || request.Manifest.TestdataVersionID == "" || strings.EqualFold(request.Manifest.TestdataVersionID, "latest") || request.Manifest.ProblemID == "" || request.Manifest.ProblemRevisionID == "" || request.Manifest.TestcaseSetID == "" || len(request.Manifest.Entries) == 0 || len(request.Manifest.Entries) > 64 || request.Manifest.ManifestHash != TestcaseSetManifestHash(request.Manifest) {
		return errors.New("invalid testcase-set manifest")
	}
	seen := make(map[string]struct{}, len(request.Manifest.Entries))
	for index, entry := range request.Manifest.Entries {
		verdictBinding := entry.CheckerType != "" || entry.CheckerVersion != "" || entry.CheckerConfigSHA256 != ""
		if entry.Index != index || entry.TestcaseID == "" || entry.TestcaseID == "." || entry.TestcaseID == ".." || strings.ContainsAny(entry.TestcaseID, "/\\\x00") || entry.TestdataVersionID != request.Manifest.TestdataVersionID || entry.ExecutionProfileID != request.Manifest.ExecutionProfileID || len(entry.Input) > 64<<10 || entry.InputSHA256 != digestBytes(entry.Input) || !sha256Hex(entry.InputSHA256) || verdictBinding && (!sha256Hex(entry.ExpectedOutputSHA256) || (entry.CheckerType != "EXACT_BYTES" && entry.CheckerType != "TOKEN_WHITESPACE") || entry.CheckerVersion != "builtin-v1" || entry.CheckerConfigSHA256 != digestString(entry.CheckerType+"\x00"+entry.CheckerVersion)) {
			return errors.New("invalid testcase-set entry")
		}
		if _, exists := seen[entry.TestcaseID]; exists {
			return errors.New("duplicate testcase-set entry")
		}
		seen[entry.TestcaseID] = struct{}{}
	}
	return nil
}

func (c *Client) ExecuteSet(ctx context.Context, request SetRequest) (SetExecution, error) {
	if request.ExecutionSetAttemptID == "" {
		request.ExecutionSetAttemptID = request.ExecutionSetRequestID + ":attempt"
	}
	if err := validateSetRequest(request); err != nil {
		return SetExecution{}, err
	}
	var started struct {
		Status                string `json:"status"`
		ExecutionSetRequestID string `json:"execution_set_request_id"`
	}
	if err := c.do(ctx, http.MethodPost, "/v1/execution-sets/start", request, &started); err != nil {
		return SetExecution{}, err
	}
	if started.ExecutionSetRequestID != request.ExecutionSetRequestID || started.Status != "ACTIVE" && started.Status != "COMPLETED" {
		return SetExecution{}, errors.New("Supervisor set start response rejected")
	}
	pollCtx := ctx
	cancellationSent := false
	for {
		if ctx.Err() != nil && !cancellationSent {
			cancelCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_ = c.do(cancelCtx, http.MethodPost, "/v1/execution-sets/cancel", map[string]string{"execution_set_request_id": request.ExecutionSetRequestID}, nil)
			cancel()
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cleanupCancel()
			pollCtx, cancellationSent = cleanupCtx, true
		}
		var raw json.RawMessage
		path := "/v1/execution-sets/status?execution_set_request_id=" + url.QueryEscape(request.ExecutionSetRequestID)
		if err := c.do(pollCtx, http.MethodGet, path, nil, &raw); err != nil {
			if ctx.Err() != nil && !cancellationSent {
				continue
			}
			return SetExecution{}, err
		}
		var state struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(raw, &state); err != nil {
			return SetExecution{}, errors.New("malformed Supervisor set status")
		}
		if state.Status == "ACTIVE" {
			select {
			case <-pollCtx.Done():
				continue
			case <-time.After(25 * time.Millisecond):
			}
			continue
		}
		var result SetResult
		if err := json.Unmarshal(raw, &result); err != nil || validateSetResult(request, result) != nil {
			return SetExecution{}, errors.New("Supervisor set result rejected")
		}
		return SetExecution{Result: result, Raw: raw}, nil
	}
}

func validateSetResult(request SetRequest, result SetResult) error {
	if result.ProtocolVersion != SetProtocolVersion || result.ExecutionSetRequestID != request.ExecutionSetRequestID || result.ExecutionSetAttemptID != request.ExecutionSetAttemptID || result.JudgeJobID != request.JudgeJobID || result.SubmissionID != request.SubmissionID || result.Attempt != request.Attempt || result.ResultGeneration != int64(request.Attempt) || result.CorrelationID != request.CorrelationID || result.LanguageProfileID != request.LanguageProfileID || result.SourceSHA256 != request.SourceSHA256 || result.ProblemID != request.Manifest.ProblemID || result.ProblemRevisionID != request.Manifest.ProblemRevisionID || result.TestdataVersionID != request.Manifest.TestdataVersionID || result.TestcaseSetID != request.Manifest.TestcaseSetID || result.TestcaseSetManifestHash != request.Manifest.ManifestHash || result.ExecutionProfileID != request.Manifest.ExecutionProfileID || result.ExecutionSetPolicy != request.ExecutionPolicy || !validSetPipelineOutcome(result.PipelineOutcome) || len(result.Compile) == 0 || result.StartedAt.IsZero() || result.CompletedAt.Before(result.StartedAt) {
		return errors.New("invalid testcase-set result identity")
	}
	var aggregate setAggregate
	if json.Unmarshal(result.AggregateExecutionRecord, &aggregate) != nil || !verifyRecordDigest(result.AggregateExecutionRecord) || aggregate.RecordVersion != SetProtocolVersion || aggregate.RecordID != request.ExecutionSetRequestID+":record" || aggregate.SubmissionID != request.SubmissionID || aggregate.SnapshotID != request.SourceSnapshotRef || aggregate.SourceSHA256 != request.SourceSHA256 || aggregate.ProblemID != request.Manifest.ProblemID || aggregate.ProblemRevisionID != request.Manifest.ProblemRevisionID || aggregate.TestdataVersionID != request.Manifest.TestdataVersionID || aggregate.TestcaseSetID != request.Manifest.TestcaseSetID || aggregate.ManifestHash != request.Manifest.ManifestHash || aggregate.ExecutionSetRequestID != request.ExecutionSetRequestID || aggregate.ExecutionSetAttemptID != request.ExecutionSetAttemptID || aggregate.ExecutionProfileID != request.Manifest.ExecutionProfileID || aggregate.ExecutionPolicy != request.ExecutionPolicy || aggregate.TotalTestcaseCount != len(request.Manifest.Entries) || len(aggregate.Testcases) != len(request.Manifest.Entries) || !sha256Hex(aggregate.Digest) {
		return errors.New("invalid testcase-set aggregate")
	}
	started, completed := 0, 0
	for index, member := range aggregate.Testcases {
		entry := request.Manifest.Entries[index]
		if member.Index != entry.Index || member.TestcaseID != entry.TestcaseID || member.InputSHA256 != entry.InputSHA256 || member.TestdataVersionID != entry.TestdataVersionID || member.ExecutionProfileID != entry.ExecutionProfileID || !validSetMemberStatus(member.Status) {
			return errors.New("testcase-set aggregate membership mismatch")
		}
		if member.Status != "CANCELLED_BEFORE_START" && member.Status != "SKIPPED_BY_SET_POLICY" && member.Status != "NOT_STARTED" {
			started++
		}
		if member.Status == "RAW_COMPLETED" {
			completed++
			if len(member.Record) == 0 || string(member.Record) == "null" {
				return errors.New("completed testcase is missing immutable record")
			}
		}
		if member.Status == "RAW_COMPLETED" && entry.CheckerType != "" && (member.ActualStdoutBytes < 0 || member.ActualStdoutBytes > 64<<10 || len(member.ActualStdout) > 64<<10 || !sha256Hex(member.ActualStdoutSHA256) || member.ActualStdoutBytes != len(member.ActualStdout) || member.ActualStdoutSHA256 != digestBytes(member.ActualStdout)) {
			return errors.New("invalid testcase stdout evidence")
		}
		if len(member.Record) > 0 && string(member.Record) != "null" {
			var record struct {
				RecordVersion string `json:"record_version"`
				RecordID      string `json:"record_id"`
				Digest        string `json:"digest"`
				Identity      struct {
					ProblemID          string `json:"problem_id"`
					ProblemRevisionID  string `json:"problem_revision_id"`
					TestdataVersionID  string `json:"testdata_version_id"`
					TestcaseID         string `json:"testcase_id"`
					InputSHA256        string `json:"input_sha256"`
					ExecutionProfileID string `json:"execution_profile_id"`
					ExecutionAttemptID string `json:"execution_attempt_id"`
				} `json:"identity"`
				ExecutionSetAttemptID   string `json:"execution_set_attempt_id"`
				TestcaseIndex           int    `json:"testcase_index"`
				TestcaseSetManifestHash string `json:"testcase_set_manifest_hash"`
			}
			if json.Unmarshal(member.Record, &record) != nil || !verifyRecordDigest(member.Record) || record.RecordVersion != "2C.3" || !sha256Hex(record.Digest) || record.RecordID == "" || record.Identity.ProblemID != request.Manifest.ProblemID || record.Identity.ProblemRevisionID != request.Manifest.ProblemRevisionID || record.Identity.TestdataVersionID != entry.TestdataVersionID || record.Identity.TestcaseID != entry.TestcaseID || record.Identity.InputSHA256 != entry.InputSHA256 || record.Identity.ExecutionProfileID != entry.ExecutionProfileID || record.ExecutionSetAttemptID != request.ExecutionSetAttemptID || record.TestcaseIndex != entry.Index || record.TestcaseSetManifestHash != request.Manifest.ManifestHash {
				return errors.New("invalid testcase execution record binding")
			}
		}
	}
	if aggregate.StartedTestcaseCount != started || aggregate.CompletedTestcaseCount != completed || aggregate.StartedTestcaseCount < 0 || aggregate.CompletedTestcaseCount < 0 || aggregate.CompletedTestcaseCount > aggregate.StartedTestcaseCount || !validSetStopReason(aggregate.StopReason) || aggregate.SetCancelled != (aggregate.StopReason == "CANCELLED") || aggregate.SetInfrastructure != (aggregate.StopReason == "INFRASTRUCTURE_FAILURE") || result.Clean != aggregate.CleanupVerified && result.PipelineOutcome == pipelineCompleted {
		return errors.New("invalid testcase-set aggregate counts")
	}
	if result.PipelineOutcome != pipelineInfraFailure && !validRawStageOutput(result.Compile) {
		return errors.New("invalid testcase-set compile output")
	}
	return nil
}

func validSetPipelineOutcome(outcome string) bool {
	switch outcome {
	case pipelineCompleted, pipelineCompileFailed, pipelineLimitHit, pipelineCancelled, pipelineInfraFailure:
		return true
	default:
		return false
	}
}

func validSetStopReason(reason string) bool {
	switch reason {
	case "COMPLETED", "CANCELLED", "RAW_EXECUTION_BLOCKING_EVENT", "INFRASTRUCTURE_FAILURE":
		return true
	default:
		return false
	}
}

func validSetMemberStatus(status string) bool {
	switch status {
	case "RAW_COMPLETED", "CANCELLED", "CANCELLED_BEFORE_START", "INFRA_FAILED", "SKIPPED_BY_SET_POLICY", "NOT_STARTED":
		return true
	default:
		return false
	}
}

func validRawStageOutput(raw json.RawMessage) bool {
	var stage struct {
		Stdout          string `json:"stdout"`
		Stderr          string `json:"stderr"`
		StdoutBytes     int    `json:"stdout_bytes"`
		StderrBytes     int    `json:"stderr_bytes"`
		StdoutSHA256    string `json:"stdout_sha256"`
		StderrSHA256    string `json:"stderr_sha256"`
		StdoutTruncated bool   `json:"stdout_truncated"`
		StderrTruncated bool   `json:"stderr_truncated"`
	}
	if len(raw) == 0 || string(raw) == "null" || json.Unmarshal(raw, &stage) != nil {
		return false
	}
	return len([]byte(stage.Stdout)) <= 64<<10 && len([]byte(stage.Stderr)) <= 64<<10 && stage.StdoutBytes == len([]byte(stage.Stdout)) && stage.StdoutBytes >= 0 && stage.StdoutBytes <= 64<<10 && stage.StderrBytes == len([]byte(stage.Stderr)) && stage.StderrBytes >= 0 && stage.StderrBytes <= 64<<10 && sha256Hex(stage.StdoutSHA256) && stage.StdoutSHA256 == digestString(stage.Stdout) && sha256Hex(stage.StderrSHA256) && stage.StderrSHA256 == digestString(stage.Stderr)
}

func digestBytes(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}

func digestString(value string) string { return digestBytes([]byte(value)) }

func sha256Hex(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && value == strings.ToLower(value)
}

func verifyRecordDigest(raw json.RawMessage) bool {
	var value map[string]json.RawMessage
	if json.Unmarshal(raw, &value) != nil {
		return false
	}
	claimedRaw, ok := value["digest"]
	if !ok {
		return false
	}
	var claimed string
	if json.Unmarshal(claimedRaw, &claimed) != nil || !sha256Hex(claimed) {
		return false
	}
	delete(value, "digest")
	encoded, err := json.Marshal(value)
	if err != nil {
		return false
	}
	var normalized any
	if json.Unmarshal(encoded, &normalized) != nil {
		return false
	}
	canonical, err := json.Marshal(normalized)
	return err == nil && digestBytes(canonical) == claimed
}
