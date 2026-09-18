package supervisor

import (
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
	expectedSlice := "system.slice"
	if os.Geteuid() != 0 {
		expectedSlice = "user.slice"
	}
	if cfg.Linux.CgroupsPath != expectedSlice+":phase2b:sbx-test" {
		t.Fatalf("unexpected systemd cgroup path: %q", cfg.Linux.CgroupsPath)
	}
	if len(cfg.Process.Rlimits) != 2 || cfg.Process.Rlimits[0] != (bundleRlimit{Type: "RLIMIT_NOFILE", Hard: runtimeOpenFileLimit, Soft: runtimeOpenFileLimit}) || cfg.Process.Rlimits[1] != (bundleRlimit{Type: "RLIMIT_FSIZE", Hard: runtimeFileSizeLimit, Soft: runtimeFileSizeLimit}) {
		t.Fatalf("finite process limits lost: %+v", cfg.Process.Rlimits)
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
	process := raw["process"].(map[string]any)
	if _, found := process["seccomp"]; found {
		t.Fatal("seccomp policy was serialized under process instead of linux")
	}
	if _, found := linux["seccomp"]; !found {
		t.Fatal("linux.seccomp policy is missing")
	}
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
	if err := validateSupervisorIdentity(0); err == nil || !errors.Is(err, ErrSupervisorUnqualified) {
		t.Fatalf("expected deterministic UID0 rejection: %v", err)
	}
	if err := validateSupervisorIdentity(1000); err != nil {
		t.Fatalf("dedicated non-root identity rejected: %v", err)
	}
}

func TestSeccompDeniesMandatoryDangerousSyscalls(t *testing.T) {
	policy := sandboxSeccomp()
	if policy.DefaultAction != "SCMP_ACT_ALLOW" || len(policy.Architectures) != 1 || policy.Architectures[0] != "SCMP_ARCH_X86_64" || len(policy.Syscalls) != 1 || policy.Syscalls[0].Action != "SCMP_ACT_ERRNO" {
		t.Fatalf("seccomp contract drift: %+v", policy)
	}
	actual := map[string]bool{}
	for _, name := range policy.Syscalls[0].Names {
		actual[name] = true
	}
	for _, name := range []string{"mount", "umount2", "pivot_root", "ptrace", "kexec_load", "init_module", "finit_module", "delete_module", "reboot", "swapon", "swapoff", "setns", "unshare", "bpf", "perf_event_open", "open_by_handle_at", "userfaultfd", "keyctl", "add_key", "request_key"} {
		if !actual[name] {
			t.Fatalf("dangerous syscall missing from deny policy: %s", name)
		}
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
