package supervisorclient

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/ojplatform/judge-worker/internal/artifact"
)

type ArtifactInput struct {
	Index            int    `json:"index"`
	Handle           string `json:"handle"`
	SizeBytes        int64  `json:"size_bytes"`
	SHA256           string `json:"sha256"`
	TimeLimitMs      int64  `json:"time_limit_ms"`
	MemoryLimitBytes int64  `json:"memory_limit_bytes"`
	OutputLimitBytes int64  `json:"output_limit_bytes"`
}

func (c *Client) ReleaseArtifactInputs(ctx context.Context, artifactID, executionID string) error {
	return c.do(ctx, http.MethodPost, "/v1/artifact-inputs/release", map[string]string{"artifact_id": artifactID, "execution_request_id": executionID}, nil)
}

func (c *Client) EnableArtifacts(ctx context.Context, token string) error {
	if token == "" {
		return errors.New("Supervisor artifact credential required")
	}
	var health struct {
		Version string `json:"artifact_execution_contract_version"`
	}
	if err := c.do(ctx, http.MethodGet, "/v1/health", nil, &health); err != nil {
		return err
	}
	if health.Version != artifact.ExecutionContract {
		return errors.New("Supervisor artifact protocol mismatch")
	}
	c.artifactToken = token
	c.http.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return nil
}

func (c *Client) StageArtifactInput(ctx context.Context, artifactID, executionID string, input *artifact.Materialized, entry artifact.Testcase) (ArtifactInput, error) {
	if c.artifactToken == "" || input.Bytes != entry.Input.SizeBytes {
		return ArtifactInput{}, errors.New("artifact staging unavailable")
	}
	file, err := os.Open(input.Path)
	if err != nil {
		return ArtifactInput{}, err
	}
	defer file.Close()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/v1/artifact-inputs", io.LimitReader(file, input.Bytes))
	if err != nil {
		return ArtifactInput{}, err
	}
	request.ContentLength = input.Bytes
	if input.Bytes == 0 {
		request.Body = http.NoBody
	}
	request.Header.Set("x-supervisor-artifact-token", c.artifactToken)
	request.Header.Set("x-judge-artifact-id", artifactID)
	request.Header.Set("x-execution-request-id", executionID)
	request.Header.Set("x-input-size", strconv.FormatInt(input.Bytes, 10))
	request.Header.Set("x-input-sha256", entry.Input.SHA256)
	client := *c.http
	client.Timeout = 2 * time.Minute
	response, err := client.Do(request)
	if err != nil {
		return ArtifactInput{}, errors.New("artifact staging unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return ArtifactInput{}, errors.New("artifact staging rejected")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 4097))
	if err != nil || len(data) > 4096 {
		return ArtifactInput{}, errors.New("artifact staging response rejected")
	}
	var staged struct {
		Handle    string `json:"handle"`
		SizeBytes int64  `json:"size_bytes"`
		SHA256    string `json:"sha256"`
	}
	if json.Unmarshal(data, &staged) != nil || !sha256Hex(staged.Handle) || staged.SizeBytes != input.Bytes || staged.SHA256 != entry.Input.SHA256 {
		return ArtifactInput{}, errors.New("artifact staging response rejected")
	}
	return ArtifactInput{Index: entry.Index, Handle: staged.Handle, SizeBytes: staged.SizeBytes, SHA256: staged.SHA256, TimeLimitMs: entry.TimeLimitMs, MemoryLimitBytes: entry.MemoryLimitBytes, OutputLimitBytes: entry.OutputLimitBytes}, nil
}

func validateArtifactSetRequest(request SetRequest) error {
	if request.ProtocolVersion != artifact.ExecutionContract || !sha256Hex(request.JudgeArtifactID) || request.ExecutionSetRequestID == "" || request.JudgeJobID == "" || request.SubmissionID == "" || request.Attempt < 1 || request.CorrelationID == "" || request.LanguageProfileID != CPP20ProfileID || request.SourceSnapshotRef == "" || len(request.SourceBytes) == 0 || len(request.SourceBytes) > 256<<10 || digestString(request.SourceBytes) != request.SourceSHA256 || !request.DeadlineAt.After(time.Now()) || request.ExecutionPolicy != "RUN_ALL" && request.ExecutionPolicy != "STOP_ON_EXECUTION_BLOCKING_EVENT" || len(request.Inputs) != len(request.Manifest.Entries) || len(request.Inputs) < 1 || len(request.Inputs) > 64 || TestcaseSetManifestHash(request.Manifest) != request.Manifest.ManifestHash {
		return errors.New("invalid artifact execution contract")
	}
	var total int64
	for index, input := range request.Inputs {
		entry := request.Manifest.Entries[index]
		if input.Index != index || entry.Index != index || len(entry.Input) != 0 || !sha256Hex(input.Handle) || input.SHA256 != entry.InputSHA256 || input.SizeBytes < 0 || input.SizeBytes > artifact.MaxFileBytes || input.TimeLimitMs < 1 || input.TimeLimitMs > 600000 || input.MemoryLimitBytes < 1 || input.MemoryLimitBytes > 4<<30 || input.OutputLimitBytes < 1 || input.OutputLimitBytes > 64<<10 {
			return errors.New("invalid artifact execution input")
		}
		total += input.SizeBytes
	}
	if total > artifact.MaxTotalBytes {
		return errors.New("artifact total input exceeded")
	}
	return nil
}
