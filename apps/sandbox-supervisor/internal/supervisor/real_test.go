package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
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

func TestRealR31PropagationForensics(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-r31-forensics-")
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
	capturedConfig := filepath.Join(root, "captured-config.json")
	capturedArgs := filepath.Join(root, "captured-args.txt")
	wrapper := filepath.Join(root, "runc-wrapper")
	wrapperScript := fmt.Sprintf(`#!/bin/sh
set -eu
capture_config=%s
capture_args=%s
printf '%%s\n' '--- invocation ---' >> "$capture_args"
printf '%%s\n' "$@" >> "$capture_args"
bundle=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--bundle" ]; then
    bundle="$argument"
    break
  fi
  previous="$argument"
done
if [ -n "$bundle" ]; then
  cp "$bundle/config.json" "$capture_config"
fi
exec /usr/bin/runc "$@"
`, capturedConfig, capturedArgs)
	if err := os.WriteFile(wrapper, []byte(wrapperScript), 0700); err != nil {
		t.Fatal(err)
	}
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "r31-memory-8m-pids-16", JudgeJobID: "r31-forensics-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default"}, CPUMillis: 100, WallTimeMS: 3000, MemoryBytes: 8 << 20, OutputBytes: 64 << 10, Pids: 16, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "r31-memory-8m-pids-16", ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := newWithProfile(root, wrapper, probeBinary, "sleep")
	got, runErr := s.Run(ctx, r)
	if runErr != nil && !got.Clean {
		t.Fatalf("forensics run failed with dirty cleanup: %v result=%+v", runErr, got)
	}
	configData, err := os.ReadFile(capturedConfig)
	if err != nil {
		t.Fatalf("captured config missing: %v; result=%+v", err, got)
	}
	var config bundleConfig
	if err := json.Unmarshal(configData, &config); err != nil {
		t.Fatal(err)
	}
	argsData, err := os.ReadFile(capturedArgs)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("R3.1 request: memory=%d pids=%d sandbox_id=%s correlation_id=%s", r.MemoryBytes, r.Pids, r.SandboxJobID, r.CorrelationID)
	t.Logf("R3.1 OCI config: cgroupsPath=%s memory.limit=%d pids.limit=%d unified=%v", config.Linux.CgroupsPath, config.Linux.Resources.Memory.Limit, config.Linux.Resources.Pids.Limit, config.Linux.Resources.Unified)
	t.Logf("R3.1 runc argv:\n%s", strings.TrimSpace(string(argsData)))
	t.Logf("R3.1 result: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
	if config.Linux.Resources.Memory.Limit != r.MemoryBytes || config.Linux.Resources.Pids.Limit != int64(r.Pids) {
		t.Fatalf("finite limits lost in captured real config: %+v", config.Linux.Resources)
	}
}

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
	return runProfileWithSupervisor(t, profile, wall, memory, pids, output, true)
}

func runProfileWithSupervisor(t *testing.T, profile string, wall int, memory int64, pids, output int, systemd bool) model.Result {
	return runProfileWithSupervisorOptions(t, profile, wall, memory, pids, output, systemd, "")
}

func runProfileWithSupervisorOptions(t *testing.T, profile string, wall int, memory int64, pids, output int, systemd bool, cgroupfsParent string) model.Result {
	return runProfileWithSupervisorOptionsAndUserBus(t, profile, wall, memory, pids, output, systemd, cgroupfsParent, false)
}

func runProfileWithSupervisorOptionsAndUserBus(t *testing.T, profile string, wall int, memory int64, pids, output int, systemd bool, cgroupfsParent string, userBus bool) model.Result {
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
	if userBus {
		s = newWithUserBusProfile(root, "/usr/bin/runc", probeBinary, profile)
	}
	if !systemd {
		s = newWithCgroupfsProfile(root, "/usr/bin/runc", probeBinary, profile)
		if cgroupfsParent != "" {
			s = newWithCgroupfsParentProfile(root, "/usr/bin/runc", probeBinary, profile, cgroupfsParent)
		}
	}
	got, _ := s.Run(ctx, r)
	return got
}

func TestRealRuncUserBusSystemdDiagnostic(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	got := runProfileWithSupervisorOptionsAndUserBus(t, "memory", 3000, 8<<20, 16, 64<<10, true, "", true)
	t.Logf("user-bus systemd diagnostic result: %+v", got)
}

func TestRealRuncUserBusSystemdEvidence(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	base := "/sys/fs/cgroup"
	resultCh := make(chan model.Result, 1)
	go func() {
		resultCh <- runProfileWithSupervisorOptionsAndUserBus(t, "sleep", 3000, 8<<20, 16, 64<<10, true, "", true)
	}()
	var current string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && current == "" {
		_ = filepath.WalkDir(base, func(path string, entry os.DirEntry, err error) error {
			if err == nil && entry.IsDir() && strings.Contains(entry.Name(), "phase2b-sbx-") {
				current = path
				return filepath.SkipDir
			}
			return nil
		})
		if current == "" {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if current == "" {
		got := <-resultCh
		t.Logf("user-bus systemd scope was not observable: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
		return
	}
	t.Logf("user-bus systemd observed cgroup=%s", current)
	for _, name := range []string{"memory.max", "pids.max", "memory.current", "memory.events", "pids.events"} {
		data, err := os.ReadFile(filepath.Join(current, name))
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("user-bus systemd %s=%s", name, strings.TrimSpace(string(data)))
	}
	got := <-resultCh
	t.Logf("user-bus systemd evidence result: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
}

func TestRealRuncExplicitRootlessUserBusEvidence(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	before := map[string]bool{}
	_ = filepath.WalkDir("/sys/fs/cgroup", func(path string, entry os.DirEntry, err error) error {
		if err == nil && entry.IsDir() {
			before[path] = true
		}
		return nil
	})
	resultCh := make(chan model.Result, 1)
	go func() { resultCh <- runProfileWithRootlessUserBus(t, "sleep", 3000, 8<<20, 4, 64<<10) }()
	var current string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && current == "" {
		_ = filepath.WalkDir("/sys/fs/cgroup", func(path string, entry os.DirEntry, err error) error {
			if err == nil && entry.IsDir() && !before[path] && strings.Contains(entry.Name(), "phase2b-sbx-") {
				current = path
				return filepath.SkipDir
			}
			return nil
		})
		if current == "" {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if current == "" {
		got := <-resultCh
		t.Logf("explicit rootless user-bus scope was not observable: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
		return
	}
	t.Logf("explicit rootless user-bus observed cgroup=%s", current)
	for _, name := range []string{"memory.max", "pids.max", "memory.current", "memory.events", "pids.events"} {
		data, err := os.ReadFile(filepath.Join(current, name))
		if err != nil {
			t.Logf("explicit rootless user-bus %s unavailable: %v", name, err)
			continue
		}
		t.Logf("explicit rootless user-bus %s=%s", name, strings.TrimSpace(string(data)))
	}
	got := <-resultCh
	t.Logf("explicit rootless user-bus evidence result: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
}

func runProfileWithRootlessUserBus(t *testing.T, profile string, wall int, memory int64, pids, output int) model.Result {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-2b-rootless-userbus-")
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
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "rootless-userbus-" + profile, JudgeJobID: "rootless-userbus-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default"}, CPUMillis: 100, WallTimeMS: wall, MemoryBytes: memory, OutputBytes: output, Pids: pids, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "rootless-userbus-" + profile, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := newWithRootlessUserBusProfile(root, "/usr/bin/runc", probeBinary, profile)
	got, _ := s.Run(ctx, r)
	return got
}

func TestRealRuncExplicitRootfulScopeEvidence(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	before := map[string]bool{}
	entries, _ := filepath.Glob("/sys/fs/cgroup/**/phase2b-sbx-*")
	for _, entry := range entries {
		before[entry] = true
	}
	resultCh := make(chan model.Result, 1)
	go func() {
		resultCh <- runProfileWithSupervisorMode(t, "sleep", 3000, 8<<20, 16, 64<<10, "false")
	}()
	var current string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && current == "" {
		entries, _ = filepath.Glob("/sys/fs/cgroup/**/phase2b-sbx-*")
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
		got := <-resultCh
		t.Logf("rootful systemd scope was not observable: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
		return
	}
	t.Logf("rootful systemd observed cgroup=%s", current)
	for _, name := range []string{"memory.max", "pids.max", "memory.current", "memory.events", "pids.events"} {
		data, err := os.ReadFile(filepath.Join(current, name))
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("rootful systemd %s=%s", name, strings.TrimSpace(string(data)))
	}
	got := <-resultCh
	t.Logf("rootful systemd evidence result: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
}

func TestRealRuncUserManagerCgroupfsDiagnostic(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	parent := "/user.slice/user-0.slice/user@0.service"
	got := runProfileWithSupervisorOptions(t, "memory", 3000, 8<<20, 16, 64<<10, false, parent)
	t.Logf("user-manager cgroupfs diagnostic result: %+v", got)
}

func TestRealRuncUserManagerCgroupfsEvidence(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	parent := "/user.slice/user-0.slice/user@0.service"
	base := "/sys/fs/cgroup/user.slice/user-0.slice/user@0.service/phase2b"
	resultCh := make(chan model.Result, 1)
	go func() {
		resultCh <- runProfileWithSupervisorOptions(t, "memory", 3000, 8<<20, 16, 64<<10, false, parent)
	}()
	var current string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && current == "" {
		entries, _ := filepath.Glob(filepath.Join(base, "sbx-*"))
		if len(entries) > 0 {
			current = entries[0]
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if current == "" {
		t.Fatal("user-manager cgroupfs job was not observable")
	}
	for _, name := range []string{"memory.max", "pids.max", "memory.current", "memory.events", "pids.events"} {
		data, err := os.ReadFile(filepath.Join(current, name))
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("user-manager cgroupfs %s=%s", name, strings.TrimSpace(string(data)))
	}
	got := <-resultCh
	t.Logf("user-manager cgroupfs result: outcome=%s clean=%t diagnostic=%s", got.Outcome, got.Clean, got.Diagnostic)
}

func TestRealRuncCgroupfsDiagnostic(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	got := runProfileWithSupervisor(t, "memory", 3000, 8<<20, 16, 64<<10, false)
	t.Logf("cgroupfs diagnostic result: %+v", got)
}

func TestRealRuncCgroupfsExplicitRootfulDiagnostic(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	got := runCgroupfsMode(t, "memory", "false")
	t.Logf("cgroupfs rootless=false diagnostic result: %+v", got)
}

func runCgroupfsMode(t *testing.T, profile, mode string) model.Result {
	return runCgroupfsModeLimits(t, profile, mode, 8<<20, 4)
}

func runCgroupfsModeLimits(t *testing.T, profile, mode string, memory int64, pids int) model.Result {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-2b-cgroupfs-mode-")
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
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "cgroupfs-" + profile, JudgeJobID: "cgroupfs-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default"}, CPUMillis: 100, WallTimeMS: 3000, MemoryBytes: memory, OutputBytes: 64 << 10, Pids: pids, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "cgroupfs-" + profile, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := newWithCgroupfsRootlessMode(root, "/usr/bin/runc", probeBinary, profile, mode)
	got, _ := s.Run(ctx, r)
	return got
}

func TestRealRuncCgroupfsFiniteResourceEvidence(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	if got := runCgroupfsModeLimits(t, "memory", "false", 8<<20, 64); got.Clean && got.Outcome == ProbeOutcome {
		t.Logf("cgroupfs memory pressure was not enforced: %+v", got)
	} else {
		t.Logf("cgroupfs memory diagnostic result: %+v", got)
	}
	if got := runCgroupfsModeLimits(t, "pids", "false", 32<<20, 4); got.Clean && got.Outcome == ProbeOutcome {
		t.Logf("cgroupfs pids pressure was not enforced: %+v", got)
	} else {
		t.Logf("cgroupfs pids diagnostic result: %+v", got)
	}
}

func TestRealRuncCgroupfsCurrentLimits(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	for _, tc := range []struct {
		profile string
		memory  int64
		pids    int
	}{{"memory", 8 << 20, 64}, {"pids", 32 << 20, 4}} {
		before := map[string]bool{}
		entries, _ := filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
		for _, entry := range entries {
			before[entry] = true
		}
		resultCh := make(chan model.Result, 1)
		go func() { resultCh <- runCgroupfsModeLimits(t, tc.profile, "false", tc.memory, tc.pids) }()
		var current string
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) && current == "" {
			entries, _ = filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
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
			t.Fatal("current cgroupfs job was not observable")
		}
		for _, name := range []string{"memory.max", "pids.max", "memory.events", "pids.events"} {
			data, err := os.ReadFile(filepath.Join(current, name))
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("cgroupfs %s %s=%s", tc.profile, name, strings.TrimSpace(string(data)))
		}
		got := <-resultCh
		t.Logf("cgroupfs %s result: outcome=%s clean=%t diagnostic=%s", tc.profile, got.Outcome, got.Clean, got.Diagnostic)
	}
}

func TestRealRuncExplicitRootfulCgroupDiagnostic(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	got := runProfileWithSupervisorMode(t, "memory", 3000, 8<<20, 16, 64<<10, "false")
	t.Logf("explicit rootless=false diagnostic result: %+v", got)
}

func TestRealRuncUserSliceDiagnostic(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	got := runProfileWithSlice(t, "memory", "user.slice")
	t.Logf("user.slice diagnostic result: %+v", got)
}

func runProfileWithSlice(t *testing.T, profile, slice string) model.Result {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-2b-slice-")
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
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "slice-" + profile, JudgeJobID: "slice-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default"}, CPUMillis: 100, WallTimeMS: 3000, MemoryBytes: 8 << 20, OutputBytes: 64 << 10, Pids: 16, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "slice-" + profile, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := newWithSliceProfile(root, "/usr/bin/runc", probeBinary, profile, slice)
	got, _ := s.Run(ctx, r)
	return got
}

func runProfileWithSupervisorMode(t *testing.T, profile string, wall int, memory int64, pids, output int, mode string) model.Result {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	root, err := os.MkdirTemp("/tmp", "ojp-2b-mode-")
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
	r := model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "mode-" + profile, JudgeJobID: "mode-judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default"}, CPUMillis: 100, WallTimeMS: wall, MemoryBytes: memory, OutputBytes: output, Pids: pids, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "mode-" + profile, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
	s := newWithRootlessMode(root, "/usr/bin/runc", probeBinary, profile, mode)
	got, _ := s.Run(ctx, r)
	return got
}

func TestRealRuncCgroupfsMemoryEvidence(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	before := map[string]bool{}
	entries, _ := filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
	for _, entry := range entries {
		before[entry] = true
	}
	resultCh := make(chan model.Result, 1)
	go func() { resultCh <- runProfileWithSupervisor(t, "memory", 3000, 8<<20, 16, 64<<10, false) }()
	var current string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && current == "" {
		entries, _ = filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
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
		t.Fatal("no cgroupfs memory cgroup observed")
	}
	for _, name := range []string{"memory.max", "memory.current", "memory.events"} {
		data, err := os.ReadFile(filepath.Join(current, name))
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("cgroupfs current %s=%s", name, strings.TrimSpace(string(data)))
	}
	got := <-resultCh
	t.Logf("cgroupfs memory result: %+v", got)
}

func TestRealRuncCgroupfsPidsEvidence(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true for real runc qualification")
	}
	before := map[string]bool{}
	entries, _ := filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
	for _, entry := range entries {
		before[entry] = true
	}
	resultCh := make(chan model.Result, 1)
	go func() { resultCh <- runProfileWithSupervisor(t, "pids", 3000, 32<<20, 4, 64<<10, false) }()
	var current string
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && current == "" {
		entries, _ = filepath.Glob("/sys/fs/cgroup/phase2b/sbx-*")
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
		t.Fatal("no cgroupfs pids cgroup observed")
	}
	for _, name := range []string{"pids.max", "pids.current", "pids.events"} {
		data, err := os.ReadFile(filepath.Join(current, name))
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("cgroupfs current %s=%s", name, strings.TrimSpace(string(data)))
	}
	got := <-resultCh
	t.Logf("cgroupfs pids result: %+v", got)
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
