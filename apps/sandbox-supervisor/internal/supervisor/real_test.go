package supervisor

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
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
	testRoot := os.Getenv("OJPLATFORM_SANDBOX_TEST_ROOT")
	if testRoot == "" {
		testRoot = "/tmp"
	}
	linuxTemp, err := os.MkdirTemp(testRoot, "ojp-2b-real-")
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
	t.Logf("qualification evidence: %s", result.Stdout)
	checks := payload["checks"].(map[string]any)
	if checks["/mnt/c"] == true || checks["/mnt/d"] == true || checks["/host"] == true {
		t.Fatalf("host path visible: %+v", checks)
	}
	if checks["/workspace/marker"] != true {
		t.Fatalf("workspace marker missing: %+v", checks)
	}
	if payload["uid"] != float64(0) || payload["gid"] != float64(0) || payload["pid_is_init"] != true {
		t.Fatalf("namespace identity not isolated: %+v", payload)
	}
	if payload["seccomp_mode"] != float64(2) || payload["cap_eff"] != "0000000000000000" || payload["default_route"] == true {
		t.Fatalf("privilege/network policy not qualified: %+v", payload)
	}
}

func TestRealRuncCgroupAttachment(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-2b-cgroup-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(root)
	probeBinary := filepath.Join(root, "trusted-probe")
	build := exec.CommandContext(ctx, "go", "build", "-o", probeBinary, "../../cmd/trusted-probe")
	build.Dir, _ = os.Getwd()
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("probe build: %v %s", err, out)
	}
	hash, err := probe.ArtifactHash(probeBinary)
	if err != nil {
		t.Fatal(err)
	}
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "cgroup-job", JudgeJobID: "cgroup-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default"}, CPUMillis: 100, WallTimeMS: 5000, MemoryBytes: 32 << 20, OutputBytes: 64 << 10, Pids: 16, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "cgroup-correlation", ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := New(root, "/usr/bin/runc", probeBinary)
	results := make(chan model.Result, 1)
	go func() { got, _ := s.Run(ctx, r); results <- got }()
	deadline := time.Now().Add(4 * time.Second)
	var found string
	for time.Now().Before(deadline) && found == "" {
		entries, _ := filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
		for _, entry := range entries {
			if _, err := os.Stat(filepath.Join(entry, "cpu.max")); err == nil {
				found = entry
				break
			}
		}
		if found == "" {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if found == "" {
		t.Fatal("no phase2b cgroup observed while probe was running")
	}
	expected := map[string]string{"cpu.max": "100000 100000", "memory.max": "33554432", "pids.max": "16"}
	for _, file := range []string{"cpu.max", "memory.max", "pids.max"} {
		data, err := os.ReadFile(filepath.Join(found, file))
		if err != nil {
			t.Fatal(err)
		}
		value := strings.TrimSpace(string(data))
		t.Logf("%s=%s", file, value)
		if value != expected[file] {
			t.Fatalf("controller limit mismatch for %s: got %q want %q", file, value, expected[file])
		}
	}
	got := <-results
	if got.Outcome != ProbeOutcome || !got.Clean {
		t.Fatalf("cgroup qualification failed: %+v", got)
	}
}

func TestRealRuncConcurrentQualification(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-2b-concurrent-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(root)
	probeBinary := filepath.Join(root, "trusted-probe")
	build := exec.CommandContext(ctx, "go", "build", "-o", probeBinary, "../../cmd/trusted-probe")
	build.Dir, _ = os.Getwd()
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("probe build: %v %s", err, out)
	}
	hash, err := probe.ArtifactHash(probeBinary)
	if err != nil {
		t.Fatal(err)
	}
	s := New(root, "/usr/bin/runc", probeBinary)
	base := model.Request{ContractVersion: model.ContractVersion, JudgeJobID: "concurrent-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default-seccomp-no-privilege"}, CPUMillis: 100, WallTimeMS: 5000, MemoryBytes: 32 << 20, OutputBytes: 64 << 10, Pids: 16, DeadlineAt: time.Now().Add(time.Minute), ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	results := make(chan model.Result, 2)
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func(i int) {
			r := base
			r.SandboxJobID = "concurrent-" + strconv.Itoa(i)
			r.CorrelationID = r.SandboxJobID
			got, runErr := s.Run(ctx, r)
			results <- got
			errs <- runErr
		}(i)
	}
	for i := 0; i < 2; i++ {
		got, runErr := <-results, <-errs
		if runErr != nil || got.Outcome != ProbeOutcome || !got.Clean {
			t.Fatalf("concurrent qualification failed: %+v %v", got, runErr)
		}
	}
}
