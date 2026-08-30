package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
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
