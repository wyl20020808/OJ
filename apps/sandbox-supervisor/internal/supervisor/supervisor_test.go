package supervisor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/probe"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func valid(t *testing.T) model.Request {
	b := filepath.Join(t.TempDir(), "probe")
	_ = os.WriteFile(b, []byte("probe"), 0700)
	h := sha256.Sum256([]byte("probe"))
	return model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "sandbox", JudgeJobID: "judge", WorkerID: "worker", WorkerInstanceID: "instance", TrustedProbeID: probe.ID, ProbeVersion: probe.Version, ProbeHash: hex.EncodeToString(h[:]), PolicyIDs: []string{"default"}, CPUMillis: 10, WallTimeMS: 1000, MemoryBytes: 16 << 20, OutputBytes: 4096, Pids: 4, DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "corr", ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"}
}
func TestValidationRejectsRealAndInjection(t *testing.T) {
	r := valid(t)
	if err := Validate(r); err != nil {
		t.Fatal(err)
	}
	r.ExecutionMode = "REAL_SUBMISSION_EXECUTION"
	if err := Validate(r); err == nil {
		t.Fatal("real mode accepted")
	}
	r = valid(t)
	r.SandboxJobID = "../host"
	if err := Validate(r); err == nil {
		t.Fatal("path traversal accepted")
	}
}

func TestValidationRejectsSBMatrixInputs(t *testing.T) {
	for name, mutate := range map[string]func(*model.Request){
		"policy-version":   func(r *model.Request) { r.PolicyIDs = []string{"unknown-policy-v2"} },
		"unknown-probe":    func(r *model.Request) { r.TrustedProbeID = "UNKNOWN_PROBE" },
		"malformed-memory": func(r *model.Request) { r.MemoryBytes = 1024 },
		"malformed-pids":   func(r *model.Request) { r.Pids = 0 },
	} {
		t.Run(name, func(t *testing.T) {
			r := valid(t)
			mutate(&r)
			if err := Validate(r); err == nil {
				t.Fatal("malformed SB request was accepted")
			}
		})
	}
}

func TestOCIConfigCarriesFiniteResources(t *testing.T) {
	s := New("/tmp/sandbox", "/usr/bin/runc", "/trusted/probe")
	cfg := s.ociConfig("sbx-test", "/workspace", model.Request{CPUMillis: 100, MemoryBytes: 8 << 20, Pids: 4}, []string{"PATH=/usr/bin:/bin", "LANG=C"})
	if cfg.Linux.Resources.Memory.Limit != 8<<20 || cfg.Linux.Resources.Pids.Limit != 4 {
		t.Fatalf("finite limits lost: %+v", cfg.Linux.Resources)
	}
	if cfg.Linux.CgroupsPath != "system.slice:phase2b:sbx-test" {
		t.Fatalf("unexpected systemd cgroup path: %q", cfg.Linux.CgroupsPath)
	}
	encoded, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatal(err)
	}
	linux := raw["linux"].(map[string]any)
	resources := linux["resources"].(map[string]any)
	if resources["memory"].(map[string]any)["limit"] != float64(8<<20) || resources["pids"].(map[string]any)["limit"] != float64(4) {
		t.Fatalf("serialized finite resources lost: %s", encoded)
	}
}

func TestRootlessSystemdPathDiagnostics(t *testing.T) {
	r := model.Request{CPUMillis: 100, MemoryBytes: 8 << 20, Pids: 16}
	userSlice := newWithSliceProfile("/tmp/sandbox", "/usr/bin/runc", "/trusted/probe", "sleep", "user.slice")
	if got := userSlice.ociConfig("sbx-user", "/workspace", r, nil).Linux.CgroupsPath; got != "user.slice:phase2b:sbx-user" {
		t.Fatalf("unexpected user.slice cgroupsPath: %q", got)
	}
	rootlessDefault := newWithRootlessDefaultProfile("/tmp/sandbox", "/usr/bin/runc", "/trusted/probe", "sleep")
	cfg := rootlessDefault.ociConfig("sbx-default", "/workspace", r, nil)
	if got := cfg.Linux.CgroupsPath; got != "" {
		t.Fatalf("rootless default must omit cgroupsPath, got %q", got)
	}
	if len(cfg.Linux.UIDMappings) != 1 || cfg.Linux.UIDMappings[0]["hostID"] != 65534 || len(cfg.Linux.GIDMappings) != 1 || cfg.Linux.GIDMappings[0]["hostID"] != 65534 || cfg.Process.User.UID != 0 || cfg.Process.User.GID != 0 {
		t.Fatalf("rootless user namespace mapping changed: %+v process=%+v", cfg.Linux, cfg.Process.User)
	}
}

func TestProductionSupervisorRejectsRootQualification(t *testing.T) {
	r := valid(t)
	s := New(t.TempDir(), "/usr/bin/runc", "/trusted/probe")
	result, err := s.Run(context.Background(), r)
	if err == nil || result.Outcome != UnqualifiedOutcome || result.Clean == false {
		t.Fatalf("expected UID0 qualification gate: result=%+v err=%v", result, err)
	}
}

func TestHasController(t *testing.T) {
	if !hasController("cpu memory pids", "memory") || !hasController("cpu memory pids", "pids") || hasController("cpu io", "pids") {
		t.Fatal("controller token matching is incorrect")
	}
}

func TestControllerDelegationFailsClosed(t *testing.T) {
	if err := validateControllerDelegation("cpu memory pids", "cpu memory pids", "memory"); err == nil || !errors.Is(err, ErrSandboxPreflight) {
		t.Fatalf("missing delegated pids controller must fail closed: %v", err)
	}
	if err := validateControllerDelegation("cpu memory pids", "cpu io", "memory pids"); err == nil || !errors.Is(err, ErrSandboxPreflight) {
		t.Fatalf("missing manager memory controller must fail closed: %v", err)
	}
}
