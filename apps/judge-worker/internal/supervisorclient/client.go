package supervisorclient

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	ProtocolVersion       = "2C.3"
	LegacyProtocolVersion = "2C.1"
	CPP20ProfileID        = "cpp20-gcc-13-v1"
	maxResponseSize       = 8 << 20
)

type Request struct {
	ProtocolVersion        string    `json:"protocol_version"`
	ExecutionRequestID     string    `json:"execution_request_id"`
	JudgeJobID             string    `json:"judge_job_id"`
	SubmissionID           string    `json:"submission_id"`
	Attempt                int       `json:"attempt"`
	CorrelationID          string    `json:"correlation_id"`
	ProblemRevisionID      string    `json:"problem_revision_id"`
	TestdataVersionRef     string    `json:"testdata_version_ref"`
	ProblemID              string    `json:"problem_id,omitempty"`
	TestcaseID             string    `json:"testcase_id,omitempty"`
	TestcaseInput          []byte    `json:"testcase_input,omitempty"`
	TestcaseInputSHA256    string    `json:"testcase_input_sha256,omitempty"`
	ExecutionProfileID     string    `json:"execution_profile_id,omitempty"`
	LanguageProfileID      string    `json:"language_profile_id"`
	SourceSnapshotRef      string    `json:"source_snapshot_ref"`
	SourceBytes            string    `json:"source_bytes"`
	SourceSHA256           string    `json:"source_sha256"`
	ControlledInputID      string    `json:"controlled_input_id"`
	DeadlineAt             time.Time `json:"deadline_at"`
	CancellationGeneration int64     `json:"cancellation_generation"`
}

type Result struct {
	ProtocolVersion     string          `json:"protocol_version"`
	ExecutionRequestID  string          `json:"execution_request_id"`
	JudgeJobID          string          `json:"judge_job_id"`
	SubmissionID        string          `json:"submission_id"`
	Attempt             int             `json:"attempt"`
	ExecutionAttemptID  string          `json:"execution_attempt_id"`
	CompileAttemptID    string          `json:"compile_attempt_id"`
	RuntimeAttemptID    string          `json:"runtime_attempt_id"`
	ResultGeneration    int64           `json:"result_generation"`
	SourceSHA256        string          `json:"source_sha256"`
	ProblemID           string          `json:"problem_id,omitempty"`
	ProblemRevisionID   string          `json:"problem_revision_id,omitempty"`
	TestdataVersionID   string          `json:"testdata_version_id,omitempty"`
	TestcaseID          string          `json:"testcase_id,omitempty"`
	TestcaseInputSHA256 string          `json:"testcase_input_sha256,omitempty"`
	ExecutionProfileID  string          `json:"execution_profile_id,omitempty"`
	ExecutionRecord     json.RawMessage `json:"single_testcase_record,omitempty"`
	PipelineOutcome     string          `json:"pipeline_outcome"`
	Compile             json.RawMessage `json:"compile"`
	StartedAt           time.Time       `json:"started_at"`
	CompletedAt         time.Time       `json:"completed_at"`
	Clean               bool            `json:"clean"`
}

type Execution struct {
	Result Result
	Raw    json.RawMessage
}

type Client struct {
	base string
	http *http.Client
}

func New(rawURL string) (*Client, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "http" || parsed.Host == "" {
		return nil, errors.New("invalid Supervisor URL")
	}
	return &Client{base: strings.TrimRight(rawURL, "/"), http: &http.Client{Timeout: 3 * time.Second}}, nil
}

func (c *Client) Preflight(ctx context.Context) error {
	var health struct {
		ExecutionContractVersion string `json:"execution_contract_version"`
		RealSubmissionExecution  bool   `json:"real_submission_execution"`
		SupervisorUID            int    `json:"supervisor_uid"`
	}
	if err := c.do(ctx, http.MethodGet, "/v1/health", nil, &health); err != nil {
		return fmt.Errorf("Supervisor health preflight: %w", err)
	}
	if health.ExecutionContractVersion != ProtocolVersion && health.ExecutionContractVersion != LegacyProtocolVersion || !health.RealSubmissionExecution || health.SupervisorUID == 0 {
		return errors.New("Supervisor real execution capability rejected")
	}
	var capabilities struct {
		ProtocolVersion         string   `json:"protocol_version"`
		RealSubmissionExecution bool     `json:"real_submission_execution"`
		LanguageProfiles        []string `json:"language_profiles"`
		CompilerRootfsIdentity  string   `json:"compiler_rootfs_identity"`
		CompilerVersion         string   `json:"compiler_version"`
		CommandTemplateSHA256   string   `json:"command_template_sha256"`
	}
	if err := c.do(ctx, http.MethodGet, "/v1/executions/capabilities", nil, &capabilities); err != nil {
		return fmt.Errorf("Supervisor capability preflight: %w", err)
	}
	if capabilities.ProtocolVersion != ProtocolVersion && capabilities.ProtocolVersion != LegacyProtocolVersion || !capabilities.RealSubmissionExecution || len(capabilities.LanguageProfiles) != 1 || capabilities.LanguageProfiles[0] != CPP20ProfileID || capabilities.CompilerRootfsIdentity == "" || capabilities.CompilerVersion == "" || capabilities.CommandTemplateSHA256 == "" {
		return errors.New("Supervisor compiler capability rejected")
	}
	return nil
}

func (c *Client) Execute(ctx context.Context, request Request) (Execution, error) {
	if err := validateRequest(request); err != nil {
		return Execution{}, err
	}
	var started struct {
		Status             string `json:"status"`
		ExecutionRequestID string `json:"execution_request_id"`
	}
	if err := c.do(ctx, http.MethodPost, "/v1/executions/start", request, &started); err != nil {
		return Execution{}, err
	}
	if started.ExecutionRequestID != request.ExecutionRequestID || (started.Status != "ACTIVE" && started.Status != "COMPLETED") {
		return Execution{}, errors.New("Supervisor start response rejected")
	}
	pollCtx := ctx
	cancellationSent := false
	for {
		if ctx.Err() != nil && !cancellationSent {
			cancelCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_ = c.do(cancelCtx, http.MethodPost, "/v1/executions/cancel", map[string]string{"execution_request_id": request.ExecutionRequestID}, nil)
			cancel()
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cleanupCancel()
			pollCtx = cleanupCtx
			cancellationSent = true
		}
		var raw json.RawMessage
		path := "/v1/executions/status?execution_request_id=" + url.QueryEscape(request.ExecutionRequestID)
		if err := c.do(pollCtx, http.MethodGet, path, nil, &raw); err != nil {
			if ctx.Err() != nil && !cancellationSent {
				continue
			}
			return Execution{}, err
		}
		var state struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(raw, &state); err != nil {
			return Execution{}, errors.New("malformed Supervisor status")
		}
		if state.Status == "ACTIVE" {
			select {
			case <-pollCtx.Done():
				continue
			case <-time.After(25 * time.Millisecond):
			}
			continue
		}
		var result Result
		if err := json.Unmarshal(raw, &result); err != nil || validateResult(request, result) != nil {
			return Execution{}, errors.New("Supervisor result rejected")
		}
		return Execution{Result: result, Raw: raw}, nil
	}
}

func validateRequest(request Request) error {
	source := []byte(request.SourceBytes)
	digest := sha256.Sum256(source)
	if request.ProtocolVersion != ProtocolVersion && request.ProtocolVersion != LegacyProtocolVersion || request.ExecutionRequestID == "" || request.JudgeJobID == "" || request.SubmissionID == "" || request.CorrelationID == "" || request.ProblemRevisionID == "" || request.TestdataVersionRef == "" || strings.EqualFold(request.TestdataVersionRef, "latest") || request.Attempt < 1 || request.LanguageProfileID != CPP20ProfileID || len(source) == 0 || len(source) > 256<<10 || !utf8.Valid(source) || request.SourceSHA256 != hex.EncodeToString(digest[:]) || request.DeadlineAt.IsZero() || !request.DeadlineAt.After(time.Now()) {
		return errors.New("invalid real execution request")
	}
	hasTestcase := request.TestcaseID != "" || len(request.TestcaseInput) > 0 || request.TestcaseInputSHA256 != "" || request.ExecutionProfileID != ""
	if request.ProtocolVersion == ProtocolVersion && !hasTestcase {
		return errors.New("2C.3 testcase identity is required")
	}
	if hasTestcase {
		h := sha256.Sum256(request.TestcaseInput)
		if request.ProblemID == "" || request.TestcaseID == "" || len(request.TestcaseID) > 128 || strings.ContainsAny(request.TestcaseID, "/\\\x00") || request.ExecutionProfileID != CPP20ProfileID || request.TestcaseInputSHA256 != hex.EncodeToString(h[:]) || len(request.TestcaseInput) > 100<<20 {
			return errors.New("invalid testcase input contract")
		}
	}
	return nil
}

func validateResult(request Request, result Result) error {
	allowed := map[string]bool{"PIPELINE_COMPLETED": true, "PIPELINE_COMPILE_FAILED": true, "PIPELINE_LIMIT_HIT": true, "PIPELINE_CANCELLED": true, "PIPELINE_INFRA_FAILURE": true}
	if result.ProtocolVersion != ProtocolVersion && result.ProtocolVersion != LegacyProtocolVersion || result.ExecutionRequestID != request.ExecutionRequestID || result.JudgeJobID != request.JudgeJobID || result.SubmissionID != request.SubmissionID || result.Attempt != request.Attempt || result.ExecutionAttemptID != request.ExecutionRequestID+":attempt" || result.CompileAttemptID != request.ExecutionRequestID+":compile" || result.RuntimeAttemptID != request.ExecutionRequestID+":runtime" || result.ResultGeneration != int64(request.Attempt) || result.SourceSHA256 != request.SourceSHA256 || !allowed[result.PipelineOutcome] || len(result.Compile) == 0 || result.StartedAt.IsZero() || result.CompletedAt.Before(result.StartedAt) {
		return errors.New("invalid real execution result")
	}
	if request.TestcaseID != "" && (result.TestcaseID != request.TestcaseID || result.TestcaseInputSHA256 != request.TestcaseInputSHA256 || result.ExecutionProfileID != request.ExecutionProfileID) {
		return errors.New("invalid testcase result identity")
	}
	if request.ProtocolVersion == ProtocolVersion {
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
		}
		if json.Unmarshal(result.ExecutionRecord, &record) != nil || record.RecordVersion != ProtocolVersion || record.RecordID != request.ExecutionRequestID+":"+request.TestcaseID || len(record.Digest) != 64 || record.Identity.ProblemID != request.ProblemID || record.Identity.ProblemRevisionID != request.ProblemRevisionID || record.Identity.TestdataVersionID != request.TestdataVersionRef || record.Identity.TestcaseID != request.TestcaseID || record.Identity.InputSHA256 != request.TestcaseInputSHA256 || record.Identity.ExecutionProfileID != request.ExecutionProfileID || record.Identity.ExecutionAttemptID != result.ExecutionAttemptID {
			return errors.New("invalid immutable testcase execution record")
		}
	}
	return nil
}

func (c *Client) do(ctx context.Context, method, path string, input any, output any) error {
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.base+path, body)
	if err != nil {
		return err
	}
	if input != nil {
		request.Header.Set("content-type", "application/json")
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, maxResponseSize+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return err
	}
	if len(data) > maxResponseSize {
		return errors.New("Supervisor response exceeded limit")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Supervisor HTTP status %d", response.StatusCode)
	}
	if output == nil {
		return nil
	}
	if raw, ok := output.(*json.RawMessage); ok {
		*raw = append((*raw)[:0], data...)
		return nil
	}
	return json.Unmarshal(data, output)
}
