package worker

import (
	"bytes"
	"context"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/judge-worker/internal/config"
	"github.com/ojplatform/judge-worker/internal/nodeclient"
	"github.com/ojplatform/judge-worker/internal/protocol"
	"github.com/ojplatform/judge-worker/internal/queueadapter"
)

func testWorker() *Worker {
	c, _ := config.Load(map[string]string{"HEARTBEAT_INTERVAL_MS": "100", "SHUTDOWN_TIMEOUT_MS": "500"})
	return New(c, nil, log.New(&bytes.Buffer{}, "", 0))
}
func request(id, fixture string) protocol.ExecutionRequest {
	return protocol.ExecutionRequest{ProtocolVersion: protocol.Version, JudgeJobID: id, SubmissionID: "sub-" + id, Attempt: 1, CorrelationID: "corr-" + id, ProblemRevisionID: "rev", TestdataVersionRef: "td", LanguageID: "qualification", SourceSnapshotRef: "opaque:" + id, SourceSHA256: protocol.SourceDigest([]byte("inert marker system eval <script>")), Limits: protocol.Limits{TimeMS: 1000, MemoryMB: 64, OutputBytes: 1024, Processes: 1}, ExecutionMode: protocol.SafeFixtureQualification, FixtureID: fixture, DeadlineAt: time.Now().Add(time.Minute)}
}
func TestIdentityAndCapabilities(t *testing.T) {
	a, b := testWorker(), testWorker()
	if a.InstanceID == b.InstanceID || a.WorkerID != b.WorkerID {
		t.Fatal("identity collision")
	}
	if !a.Capabilities.Supports(protocol.SafeFixtureQualification) || a.Capabilities.RealSandboxedExecution {
		t.Fatal("capability manifest")
	}
}

func TestHostAgentIncarnationIsUsedWhenConfigured(t *testing.T) {
	c, _ := config.Load(map[string]string{"OJ_JUDGE_NODE_INCARNATION": "host-incarnation-a"})
	w := New(c, nil, log.New(&bytes.Buffer{}, "", 0))
	if w.InstanceID != "host-incarnation-a" {
		t.Fatalf("instance id = %q", w.InstanceID)
	}
}
func TestDependencyReadinessFailsClosed(t *testing.T) {
	w := testWorker()
	w.controlPlaneReady.Store(true)
	w.redisReady.Store(true)
	w.supervisorReady.Store(true)
	if !w.dependenciesReady() {
		t.Fatal("healthy dependencies reported unavailable")
	}
	w.controlPlaneReady.Store(false)
	w.refreshDependencyState()
	if w.dependenciesReady() || w.State() != Degraded {
		t.Fatalf("control-plane loss did not degrade Worker: readiness=%+v state=%s", w.Readiness(), w.State())
	}
	w.controlPlaneReady.Store(true)
	w.redisReady.Store(false)
	w.refreshDependencyState()
	if w.dependenciesReady() || w.State() != Degraded {
		t.Fatalf("Redis loss did not degrade Worker: readiness=%+v state=%s", w.Readiness(), w.State())
	}
	w.redisReady.Store(true)
	w.supervisorReady.Store(false)
	w.refreshDependencyState()
	if w.dependenciesReady() || w.State() != Degraded {
		t.Fatalf("Supervisor loss did not degrade Worker: readiness=%+v state=%s", w.Readiness(), w.State())
	}
}

func TestHeartbeatRechecksSupervisorWithoutExecutionFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, request *http.Request) {
		rw.Header().Set("content-type", "application/json")
		switch request.URL.Path {
		case "/v1/health":
			_, _ = rw.Write([]byte(`{"execution_contract_version":"2C.3","real_submission_execution":true,"supervisor_uid":1000}`))
		case "/v1/executions/capabilities":
			_, _ = rw.Write([]byte(`{"protocol_version":"2C.3","real_submission_execution":true,"language_profiles":["cpp20-gcc-13-v1"],"compiler_rootfs_identity":"test-rootfs","compiler_version":"test-compiler","command_template_sha256":"test-template"}`))
		default:
			http.NotFound(rw, request)
		}
	}))
	cfg, err := config.Load(map[string]string{"REAL_SUBMISSION_EXECUTION": "true", "OJPLATFORM_SANDBOX_SUPERVISOR_URL": server.URL})
	if err != nil {
		t.Fatal(err)
	}
	w := New(cfg, nil, log.New(&bytes.Buffer{}, "", 0))
	w.emitHeartbeat()
	if !w.supervisorReady.Load() {
		t.Fatal("Supervisor protocol preflight did not become ready")
	}
	server.Close()
	w.emitHeartbeat()
	if w.supervisorReady.Load() || w.State() != Degraded {
		t.Fatalf("Supervisor loss did not fail closed: readiness=%+v state=%s", w.Readiness(), w.State())
	}
}

func TestHeartbeatSafePayload(t *testing.T) {
	var output bytes.Buffer
	c, _ := config.Load(map[string]string{})
	w := New(c, nil, log.New(&output, "", 0))
	w.emitHeartbeat()
	text := output.String()
	for _, forbidden := range []string{"source", "leaseToken", "redis://", "postgres://", "session"} {
		if strings.Contains(strings.ToLower(text), strings.ToLower(forbidden)) {
			t.Fatalf("heartbeat leaked %q: %s", forbidden, text)
		}
	}
	if !strings.Contains(text, "worker_instance_id") || !strings.Contains(text, "safe_fixture") {
		t.Fatal("heartbeat missing safe metadata")
	}
}
func TestRequestAndFixtures(t *testing.T) {
	w := testWorker()
	result, err := w.ProcessRequest(context.Background(), request("one", "FX-SUCCESS"))
	if err != nil || result.Outcome != protocol.SafeFixtureSucceeded || !result.SyntheticQualification {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	denied := request("two", "FX-SUCCESS")
	denied.ExecutionMode = protocol.RealSandboxedExecution
	if _, err = w.ProcessRequest(context.Background(), denied); err == nil {
		t.Fatal("real mode accepted")
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	result, err = w.ProcessRequest(cancelled, request("three", "FX-SLOW"))
	if result.Outcome != protocol.Cancelled || err == nil {
		t.Fatalf("cancel result=%+v err=%v", result, err)
	}
}
func TestDecodeRejectsInjection(t *testing.T) {
	if _, err := protocol.DecodeRequest([]byte(`{"protocol_version":"2A.1","command":"/bin/sh"}`)); err == nil {
		t.Fatal("injection accepted")
	}
}

func TestCancellationObservationErrorsAreObservableAndRateLimited(t *testing.T) {
	responses := []string{`{}`, `{}`, `{"cancelRequested":false}`, `{}`}
	index := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(responses[index]))
		if index < len(responses)-1 {
			index++
		}
	}))
	defer server.Close()

	var output bytes.Buffer
	w := testWorker()
	w.logger = log.New(&output, "", 0)
	w.WorkerID = "node-a"
	w.InstanceID = "inc-a"
	w.NodeClient = &nodeclient.Client{BaseURL: server.URL, Token: "node-token", HTTP: server.Client()}
	lease := queueadapter.Lease{AssignmentID: "assignment-a", Job: queueadapter.Job{ID: "job-a"}}

	if w.cancelRequested(context.Background(), lease) || w.cancelRequested(context.Background(), lease) {
		t.Fatal("malformed cancellation response reported as requested")
	}
	if w.cancelRequested(context.Background(), lease) {
		t.Fatal("explicit cancellation=false reported as requested")
	}
	if w.cancelRequested(context.Background(), lease) {
		t.Fatal("malformed cancellation response reported as requested after recovery")
	}

	if got := strings.Count(output.String(), "worker_cancellation_observation_error"); got != 2 {
		t.Fatalf("observation error count = %d, want 2: %s", got, output.String())
	}
	for _, forbidden := range []string{"leaseToken", "source", "postgres://"} {
		if strings.Contains(strings.ToLower(output.String()), strings.ToLower(forbidden)) {
			t.Fatalf("observation log leaked %q: %s", forbidden, output.String())
		}
	}
}
