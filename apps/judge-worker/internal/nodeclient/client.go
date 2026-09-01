package nodeclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ojplatform/judge-worker/internal/queueadapter"
)

type Client struct {
	BaseURL, Token string
	HTTP           *http.Client
}
type Registration struct {
	NodeID, Incarnation, RuntimeVersion string
	MaxConcurrentJobs                   int
	RealExecution                       bool
}
type Assignment struct {
	AssignmentID      string    `json:"assignmentId"`
	JudgeJobID        string    `json:"judgeJobId"`
	NodeID            string    `json:"nodeId"`
	Incarnation       string    `json:"incarnation"`
	AttemptGeneration int       `json:"attemptGeneration"`
	Status            string    `json:"status"`
	AssignedAt        time.Time `json:"assignedAt"`
}
type Claim struct {
	Assignment *Assignment      `json:"assignment"`
	Job        queueadapter.Job `json:"job"`
	LeaseToken string           `json:"leaseToken"`
	Reason     string           `json:"reason"`
}

const maxResponseSize = 8 << 20

func (c Client) request(ctx context.Context, method, path string, body any, output any) error {
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("x-judge-node-token", c.Token)
	if body != nil {
		req.Header.Set("content-type", "application/json")
	}
	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 5 * time.Second}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("judge node service %s", resp.Status)
	}
	limited := io.LimitReader(resp.Body, maxResponseSize+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return err
	}
	if len(data) > maxResponseSize {
		return errors.New("judge node service response exceeded limit")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(output); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("judge node service response contains multiple values")
	}
	return nil
}

func (c Client) Register(ctx context.Context, value Registration) error {
	modes := []string{"SAFE_FIXTURE_QUALIFICATION"}
	if value.RealExecution {
		modes = append(modes, "REAL_SANDBOXED_EXECUTION")
	}
	var ignored map[string]any
	return c.request(ctx, http.MethodPost, "/v1/nodes/register", map[string]any{
		"nodeId": value.NodeID, "incarnation": value.Incarnation, "runtimeVersion": value.RuntimeVersion, "maxConcurrentJobs": value.MaxConcurrentJobs,
		"capabilities": map[string]any{"languageProfiles": []string{"cpp20-gcc-13-v1"}, "checkers": []string{"EXACT_BYTES", "TOKEN_WHITESPACE"}, "executionModes": modes, "sandboxContractVersion": "2C.3", "architecture": "amd64", "resourceClass": "standard-v1"},
	}, &ignored)
}
func (c Client) Heartbeat(ctx context.Context, nodeID, incarnation string, active int) error {
	var ignored map[string]any
	return c.request(ctx, http.MethodPost, "/v1/nodes/"+nodeID+"/heartbeat", map[string]any{"incarnation": incarnation, "activeJobs": active}, &ignored)
}
func (c Client) Claim(ctx context.Context, nodeID, incarnation string) (*Claim, error) {
	var value Claim
	err := c.request(ctx, http.MethodPost, "/v1/nodes/"+nodeID+"/assignments/claim", map[string]any{"incarnation": incarnation}, &value)
	if err != nil {
		return nil, err
	}
	if value.Assignment == nil {
		if value.Reason != "NO_COMPATIBLE_JUDGE_NODE" {
			return nil, errors.New("invalid judge node no-assignment response")
		}
		return nil, nil
	}
	if value.Reason != "" || value.Assignment.AssignmentID == "" || value.Assignment.JudgeJobID == "" ||
		value.Assignment.NodeID != nodeID || value.Assignment.Incarnation != incarnation ||
		value.Assignment.AttemptGeneration < 1 || value.Assignment.Status != "LEASED" ||
		value.Assignment.AssignedAt.IsZero() || value.Job.ID == "" ||
		value.Job.ID != value.Assignment.JudgeJobID || value.Job.SubmissionID == "" ||
		value.Job.EvaluationGeneration < 1 ||
		value.Job.Status != "LEASED" && value.Job.Status != "LEASED_FAKE" ||
		value.Job.ExecutionMode != "REAL_SANDBOXED_EXECUTION" && value.Job.ExecutionMode != "SAFE_FIXTURE_QUALIFICATION" ||
		value.Job.ExecutionMode == "REAL_SANDBOXED_EXECUTION" && value.Job.Status != "LEASED" ||
		value.Job.ExecutionMode == "SAFE_FIXTURE_QUALIFICATION" && value.Job.Status != "LEASED_FAKE" ||
		value.Job.Attempt < 1 || value.Job.Attempt != value.Assignment.AttemptGeneration ||
		value.Job.LeaseOwner != nodeID+":"+incarnation || value.Job.LeaseToken != value.LeaseToken ||
		value.Job.LeaseExpiresAt.IsZero() || !value.Job.LeaseExpiresAt.After(time.Now()) ||
		value.LeaseToken == "" {
		return nil, errors.New("invalid judge node claim response")
	}
	return &value, nil
}
func (c Client) Complete(ctx context.Context, nodeID, assignmentID, incarnation, leaseToken string, result json.RawMessage) error {
	var ignored map[string]any
	return c.request(ctx, http.MethodPost, "/v1/nodes/"+nodeID+"/assignments/"+assignmentID+"/complete", map[string]any{"incarnation": incarnation, "leaseToken": leaseToken, "result": json.RawMessage(result)}, &ignored)
}

func (c Client) Resolve(ctx context.Context, nodeID, assignmentID, incarnation, leaseToken, action, reason, fixtureID string) error {
	var ignored map[string]any
	return c.request(ctx, http.MethodPost, "/v1/nodes/"+nodeID+"/assignments/"+assignmentID+"/resolve", map[string]any{
		"incarnation": incarnation, "leaseToken": leaseToken, "action": action, "reason": reason, "fixtureId": fixtureID,
	}, &ignored)
}

func (c Client) CancellationRequested(ctx context.Context, nodeID, assignmentID, incarnation string) (bool, error) {
	var response struct {
		CancelRequested *bool `json:"cancelRequested"`
	}
	err := c.request(ctx, http.MethodPost, "/v1/nodes/"+nodeID+"/assignments/"+assignmentID+"/cancellation-status", map[string]string{
		"incarnation": incarnation,
	}, &response)
	if err != nil {
		return false, err
	}
	if response.CancelRequested == nil {
		return false, errors.New("invalid judge node cancellation-status response")
	}
	return *response.CancelRequested, nil
}
