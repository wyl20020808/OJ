package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

func TestQualificationFaultProbeIsExplicitlyGated(t *testing.T) {
	if _, found := definitions(false)[cleanupFailureID]; found {
		t.Fatal("cleanup failure fixture must be disabled by default")
	}
	if _, found := definitions(true)[cleanupFailureID]; !found {
		t.Fatal("cleanup failure fixture missing in explicit qualification mode")
	}
}

func TestStartRejectsUnknownHashBeforeRuntime(t *testing.T) {
	server := &protocolServer{
		root: t.TempDir(), probeHash: strings.Repeat("a", 64),
		definitions: definitions(false),
	}
	body := bytes.NewBufferString(`{"probe_id":"SANDBOX_PROBE_QUALIFICATION","version":"1","hash":"forged","correlation_id":"test"}`)
	request := httptest.NewRequest(http.MethodPost, "/v1/probes/start", body)
	recorder := httptest.NewRecorder()
	server.start(recorder, request)
	if recorder.Code != http.StatusBadRequest || server.run != nil {
		t.Fatalf("forged hash reached runtime: status=%d", recorder.Code)
	}
}

func TestCleanupFaultVerificationAndRecovery(t *testing.T) {
	root := t.TempDir()
	marker := filepath.Join(root, cleanupFaultName)
	if err := os.WriteFile(marker, []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	server := &protocolServer{root: root}
	verify := httptest.NewRecorder()
	server.cleanup(verify, httptest.NewRequest(http.MethodPost, "/v1/cleanup/verify", nil))
	var failed map[string]any
	if err := json.Unmarshal(verify.Body.Bytes(), &failed); err != nil {
		t.Fatal(err)
	}
	if failed["clean"] != false || failed["status"] != "FAILED" {
		t.Fatalf("cleanup fault reported as verified: %v", failed)
	}
	recoverResult := httptest.NewRecorder()
	server.recoverCleanup(recoverResult, httptest.NewRequest(http.MethodPost, "/v1/cleanup/recover", nil))
	if recoverResult.Code != http.StatusOK || !cleanRoot(root) {
		t.Fatalf("fixed cleanup recovery failed: status=%d body=%s", recoverResult.Code, recoverResult.Body.String())
	}
}

func TestResourceQualificationRequiresFiniteKernelEvidence(t *testing.T) {
	memory := definitions(false)[memoryProbeID]
	memoryResult := model.Result{Clean: true, Evidence: &model.RuntimeEvidence{MemoryMax: "33554432", MemoryEvents: "max 1\noom 0\noom_kill 0"}}
	if !expectedPass(memory, memoryResult) {
		t.Fatal("finite memory.max with kernel max event was rejected")
	}
	memoryResult.Evidence.MemoryMax = "max"
	if expectedPass(memory, memoryResult) {
		t.Fatal("memory.max=max was accepted")
	}
	pids := definitions(false)[pidsProbeID]
	pidsResult := model.Result{Clean: true, Evidence: &model.RuntimeEvidence{PidsMax: "16", PidsEvents: "max 1"}}
	if !expectedPass(pids, pidsResult) {
		t.Fatal("finite pids.max with kernel max event was rejected")
	}
	pidsResult.Evidence.PidsEvents = "max 0"
	if expectedPass(pids, pidsResult) {
		t.Fatal("pids profile without kernel event was accepted")
	}
}

func TestRealExecutionIsDisabledByDefault(t *testing.T) {
	server := &protocolServer{}
	recorder := httptest.NewRecorder()
	server.startExecution(recorder, httptest.NewRequest(http.MethodPost, "/v1/executions/start", bytes.NewBufferString(`{}`)))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("disabled real execution returned %d", recorder.Code)
	}
}

func TestRealExecutionIdempotencyRejectsDifferentSnapshot(t *testing.T) {
	source := "int main(){}"
	digest := sha256.Sum256([]byte(source))
	request := model.RealExecutionRequest{ProtocolVersion: model.ExecutionContractVersion, ExecutionRequestID: "execution-1", JudgeJobID: "job", SubmissionID: "submission", Attempt: 1, CorrelationID: "correlation", ProblemRevisionID: "revision", TestdataVersionRef: "testdata", LanguageProfileID: supervisor.CPP20ProfileID, SourceSnapshotRef: "submission:submission", SourceBytes: source, SourceSHA256: hex.EncodeToString(digest[:]), ControlledInputID: "stdin-empty-v1", DeadlineAt: time.Now().Add(time.Minute)}
	server := &protocolServer{realExecutionEnabled: true, executions: map[string]*executionRecord{"execution-1": {requestIdentity: realExecutionRequestIdentity(request), active: true}}}
	request.SourceBytes += " "
	tamperedDigest := sha256.Sum256([]byte(request.SourceBytes))
	request.SourceSHA256 = hex.EncodeToString(tamperedDigest[:])
	body, _ := json.Marshal(request)
	recorder := httptest.NewRecorder()
	server.startExecution(recorder, httptest.NewRequest(http.MethodPost, "/v1/executions/start", bytes.NewReader(body)))
	if recorder.Code != http.StatusConflict {
		t.Fatalf("different idempotent request returned %d", recorder.Code)
	}
}

func TestExecutionRecordsAreBoundedAndExpiredRecordsArePruned(t *testing.T) {
	now := time.Now().UTC()
	server := &protocolServer{executions: map[string]*executionRecord{
		"active": {active: true},
		"fresh": {
			result: model.RealExecutionResult{CompletedAt: now.Add(-time.Minute)},
		},
		"expired": {
			result: model.RealExecutionResult{CompletedAt: now.Add(-executionRetention)},
		},
	}}
	server.pruneExecutionRecords(now)
	if server.executions["active"] == nil || server.executions["fresh"] == nil {
		t.Fatal("active or retained execution record was removed")
	}
	if server.executions["expired"] != nil {
		t.Fatal("expired execution record was retained")
	}
}
