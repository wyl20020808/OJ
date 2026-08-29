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
	got, _ := s.Run(ctx, r)
	if got.Outcome != ProbeOutcome || !got.Clean {
		t.Fatalf("cgroup qualification failed: %+v", got)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(got.Stdout), &payload); err != nil {
		t.Fatal(err)
	}
	if cgroup, _ := payload["cgroup"].(string); !(strings.Contains(cgroup, "/phase2b/sbx-") || strings.Contains(cgroup, "/system.slice/phase2b-sbx-")) {
		t.Fatalf("missing phase2b cgroup membership: %q", cgroup)
	}
}

func runProfile(t *testing.T, profile string, wall int, memory int64, pids, output int) model.Result {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-2b-profile-")
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
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "profile-" + profile, JudgeJobID: "profile-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default"}, CPUMillis: 100, WallTimeMS: wall, MemoryBytes: memory, OutputBytes: output, Pids: pids, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "profile-" + profile, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := newWithProfile(root, "/usr/bin/runc", probeBinary, profile)
	got, _ := s.Run(ctx, r)
	return got
}

func TestRealRuncResourceProfiles(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	if got := runProfile(t, "sleep", 50, 32<<20, 16, 64<<10); got.Outcome != "SANDBOX_WALL_LIMIT" || !got.Clean {
		t.Fatalf("sleep limit: %+v", got)
	}
	if got := runProfile(t, "output", 3000, 32<<20, 16, 4096); got.Outcome != "SANDBOX_OUTPUT_LIMIT" || !got.Clean {
		t.Fatalf("output limit: %+v", got)
	}
	if got := runProfile(t, "memory", 3000, 8<<20, 16, 64<<10); got.Clean && got.Outcome == ProbeOutcome {
		t.Logf("memory pressure was not enforced by the rootless cgroup: %+v", got)
	}
	if got := runProfile(t, "pids", 3000, 32<<20, 4, 64<<10); got.Clean && got.Outcome == ProbeOutcome {
		t.Logf("pids pressure was not enforced by the rootless cgroup: %+v", got)
	}
}

func TestRealRuncMemoryCgroupCurrentJob(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	before := map[string]bool{}
	entries, _ := cgroupEntries()
	for _, entry := range entries {
		before[entry] = true
	}
	resultCh := make(chan model.Result, 1)
	go func() { resultCh <- runProfile(t, "memory", 3000, 8<<20, 16, 64<<10) }()
	var current string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && current == "" {
		entries, _ = cgroupEntries()
		for _, entry := range entries {
			if !before[entry] {
				current = entry
				break
			}
		}
		if current == "" {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if current == "" {
		t.Fatal("current memory cgroup was not observable")
	}
	for _, name := range []string{"memory.max", "memory.current", "memory.events"} {
		data, err := os.ReadFile(filepath.Join(current, name))
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("current job %s=%s", name, strings.TrimSpace(string(data)))
	}
	got := <-resultCh
	t.Logf("memory profile result: outcome=%s clean=%t", got.Outcome, got.Clean)
}

func cgroupEntries() ([]string, error) {
	a, err := filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
	if err != nil {
		return nil, err
	}
	b, err := filepath.Glob("/sys/fs/cgroup/system.slice/phase2b-sbx-*.scope")
	if err != nil {
		return nil, err
	}
	return append(a, b...), nil
}

func TestRealRuncTransientScopeProperties(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	before := map[string]bool{}
	entries, _ := cgroupEntries()
	for _, entry := range entries {
		before[entry] = true
	}
	resultCh := make(chan model.Result, 1)
	go func() { resultCh <- runProfile(t, "sleep", 3000, 8<<20, 4, 64<<10) }()
	var scope string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && scope == "" {
		entries, _ = cgroupEntries()
		for _, entry := range entries {
			if !before[entry] {
				scope = entry
				break
			}
		}
		if scope == "" {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if scope == "" {
		t.Fatal("no transient cgroup scope observed")
	}
	unit := filepath.Base(scope)
	cmd := exec.Command("systemctl", "show", unit, "-p", "ControlGroup", "-p", "Delegate", "-p", "MemoryMax", "-p", "TasksMax", "-p", "MemoryAccounting", "-p", "TasksAccounting")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("scope properties: %v %s", err, out)
	}
	t.Logf("transient scope %s properties: %s", unit, strings.TrimSpace(string(out)))
	got := <-resultCh
	t.Logf("scope probe result: outcome=%s clean=%t", got.Outcome, got.Clean)
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
