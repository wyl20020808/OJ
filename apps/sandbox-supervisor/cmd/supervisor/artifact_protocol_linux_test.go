package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

func TestArtifactHTTPAuthorizationAndStaging(t *testing.T) {
	staging, err := supervisor.NewArtifactStaging(filepath.Join(t.TempDir(), "staging"))
	if err != nil {
		t.Fatal(err)
	}
	s := &protocolServer{artifactToken: "test-only-token", artifactStaging: staging, realExecutionEnabled: true, executionSets: make(map[string]*executionSetRecord)}
	mux := http.NewServeMux()
	mux.HandleFunc("/stage", s.stageArtifactInput)
	mux.HandleFunc("/release", s.releaseArtifactInputs)
	mux.HandleFunc("/start", s.startArtifactExecution)
	mux.HandleFunc("/legacy-status", s.executionSetStatus)
	server := httptest.NewServer(mux)
	defer server.Close()
	artifactID := strings.Repeat("a", 64)
	hash := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	call := func(path, method, body, token string) (int, []byte) {
		t.Helper()
		r, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		r.Header.Set("x-supervisor-artifact-token", token)
		r.Header.Set("x-input-size", "0")
		r.Header.Set("x-input-sha256", hash)
		r.Header.Set("x-judge-artifact-id", artifactID)
		r.Header.Set("x-execution-request-id", "execution-1")
		response, err := server.Client().Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		return response.StatusCode, data
	}
	for _, path := range []string{"/stage", "/release", "/start"} {
		if status, _ := call(path, "POST", "", ""); status != 401 {
			t.Fatalf("%s unauthenticated status %d", path, status)
		}
	}
	status, body := call("/stage", "POST", "", s.artifactToken)
	if status != 200 {
		t.Fatalf("empty upload: %d %s", status, body)
	}
	var input supervisor.StagedInput
	if err := json.Unmarshal(body, &input); err != nil || input.SizeBytes != 0 || input.SHA256 != hash || len(input.Handle) != 64 {
		t.Fatalf("bad staging response: %s", body)
	}
	if status, _ := call("/start", "POST", `{"protocol_version":"2C.4"}`, s.artifactToken); status != 400 {
		t.Fatalf("old protocol accepted: %d", status)
	}
	s.executionSets["execution-1"] = &executionSetRecord{Active: true, Result: model.RealExecutionSetResult{JudgeArtifactID: artifactID}}
	if status, _ := call("/legacy-status?execution_set_request_id=execution-1", "GET", "", ""); status != 401 {
		t.Fatalf("legacy auth bypass: %d", status)
	}
	release := `{"artifact_id":"` + artifactID + `","execution_request_id":"execution-1"}`
	if status, _ := call("/release", "POST", release, s.artifactToken); status != 409 {
		t.Fatalf("active release: %d", status)
	}
	s.executionSets["execution-1"].Active = false
	if status, _ := call("/release", "POST", release, s.artifactToken); status != 200 {
		t.Fatalf("release failed: %d", status)
	}
	if f, err := staging.Acquire(input.Handle, artifactID, "execution-1", 0, hash); err == nil {
		f.Close()
		t.Fatal("released handle reused")
	}
	s.executionSets["execution-1"].PersistenceFailed = true
	if status, _ := call("/legacy-status?execution_set_request_id=execution-1", "GET", "", s.artifactToken); status != 503 {
		t.Fatalf("persistence failure hidden: %d", status)
	}
}
