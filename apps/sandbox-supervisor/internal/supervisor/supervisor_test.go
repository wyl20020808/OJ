package supervisor

import (
	"crypto/sha256"
	"encoding/hex"
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
