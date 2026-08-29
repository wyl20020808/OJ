package supervisor

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/probe"
)

func TestRealRuncTrustedProbeIsolation(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, _ := os.Getwd()
	linuxTemp, err := os.MkdirTemp("/tmp", "ojp-2b-real-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(linuxTemp)
	probeBinary := filepath.Join(linuxTemp, "trusted-probe")
	build := exec.CommandContext(ctx, "go", "build", "-o", probeBinary, "../../cmd/trusted-probe")
	build.Dir = root
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("probe build: %v %s", err, out)
	}
	hash, err := probe.ArtifactHash(probeBinary)
	if err != nil {
		t.Fatal(err)
	}
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "real-sandbox", JudgeJobID: "real-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default-seccomp-no-privilege"}, CPUMillis: 100, WallTimeMS: 3000, MemoryBytes: 32 << 20, OutputBytes: 64 << 10, Pids: 16, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "real-correlation", ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := New(linuxTemp, "/usr/bin/runc", probeBinary)
	result, err := s.Run(ctx, r)
	if err != nil {
		if strings.Contains(result.Diagnostic, "remount-private") || strings.Contains(result.Diagnostic, "permission denied") {
			t.Skipf("environment cannot qualify user namespace with runc: %s", result.Diagnostic)
		}
		t.Fatalf("sandbox run: %v result=%+v", err, result)
	}
	if result.Outcome == "SANDBOX_RUNTIME_ERROR" && (strings.Contains(result.Diagnostic, "remount-private") || strings.Contains(result.Diagnostic, "permission denied")) {
		t.Skipf("environment cannot qualify user namespace with runc: %s", result.Diagnostic)
	}
	if result.Outcome != ProbeOutcome || !result.Clean {
		t.Fatalf("unexpected result: %+v", result)
	}
	var payload map[string]any
	if err = json.Unmarshal([]byte(result.Stdout), &payload); err != nil {
		t.Fatal(err)
	}
	checks := payload["checks"].(map[string]any)
	if checks["/mnt/c"] == true || checks["/mnt/d"] == true || checks["/host"] == true {
		t.Fatalf("host path visible: %+v", checks)
	}
	if checks["/workspace/marker"] != true {
		t.Fatalf("workspace marker missing: %+v", checks)
	}
}
