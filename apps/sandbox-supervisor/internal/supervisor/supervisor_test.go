package supervisor

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
