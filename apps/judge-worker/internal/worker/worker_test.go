package worker

import (
	"bytes"
	"context"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/judge-worker/internal/config"
	"github.com/ojplatform/judge-worker/internal/protocol"
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
