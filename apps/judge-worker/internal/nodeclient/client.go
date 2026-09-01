package nodeclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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
type Claim struct {
	Assignment struct {
		AssignmentID string `json:"assignmentId"`
	} `json:"assignment"`
	Job        queueadapter.Job `json:"job"`
	LeaseToken string           `json:"leaseToken"`
}

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
	return json.NewDecoder(resp.Body).Decode(output)
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
	if value.Assignment.AssignmentID == "" {
		return nil, nil
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
