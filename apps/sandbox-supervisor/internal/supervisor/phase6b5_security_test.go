package supervisor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
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

func phase6B5Request(probePath string) model.Request {
	data, _ := os.ReadFile(probePath)
	digest := sha256.Sum256(data)
	return model.Request{
		ContractVersion: model.ContractVersion, SandboxJobID: "phase6b5-sandbox", JudgeJobID: "phase6b5-judge",
		WorkerID: "phase6b5-worker", WorkerInstanceID: "phase6b5-instance", TrustedProbeID: probe.ID,
		ProbeVersion: probe.Version, ProbeHash: hex.EncodeToString(digest[:]), PolicyIDs: []string{"default-seccomp-no-privilege"},
		CPUMillis: 100, WallTimeMS: 1000, MemoryBytes: 16 << 20, OutputBytes: 4096, Pids: 4,
		DeadlineAt: time.Now().Add(time.Minute), CorrelationID: "phase6b5-correlation", ExecutionMode: "SANDBOX_PROBE_QUALIFICATION",
	}
}

func buildPhase6B5MarkerProbe(t *testing.T, root string) (string, string) {
	t.Helper()
	probePath := filepath.Join(root, "probe")
	marker := filepath.Join(root, "unexpected-unsandboxed-fallback")
	probeSource := filepath.Join(root, "probe.go")
	source := "package main\nimport \"os\"\nfunc main(){ _ = os.WriteFile(" + strconv.Quote(marker) + ", []byte(\"unexpected\"), 0600) }\n"
	if err := os.WriteFile(probeSource, []byte(source), 0o600); err != nil {
		t.Fatal(err)
	}
	build := exec.Command("go", "build", "-o", probePath, probeSource)
	build.Env = append(os.Environ(), "CGO_ENABLED=0", "GOFLAGS=-buildvcs=false")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("bounded probe build failed: %v %s", err, output)
	}
	return probePath, marker
}

func TestPhase6B5RuncNetworkNamespaceFailureFailsClosed(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" || os.Getuid() == 0 {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true and run as the dedicated non-root user")
	}
	root := t.TempDir()
	probePath, marker := buildPhase6B5MarkerProbe(t, root)
	fakeRunc := filepath.Join(root, "runc-network-failure")
	script := `#!/bin/sh
set -eu
bundle=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--bundle" ]; then bundle="$argument"; fi
  previous="$argument"
done
if [ -n "$bundle" ]; then
  grep -q '"type": "network"' "$bundle/config.json"
fi
exit 73
`
	if err := os.WriteFile(fakeRunc, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	runtime, err := NewWithTrustedProfile(filepath.Join(root, "sandboxes"), fakeRunc, probePath, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(runtime.Root, 0o700); err != nil {
		t.Fatal(err)
	}
	result, runErr := runtime.Run(context.Background(), phase6B5Request(probePath))
	if result.Outcome != "SANDBOX_RUNTIME_ERROR" || !result.Clean {
		t.Fatalf("controlled namespace launch failure did not fail closed: result=%+v err=%v", result, runErr)
	}
	if result.Stdout != "" || result.Stderr != "" || pathExists(marker) {
		t.Fatal("controlled namespace launch failure used an unsandboxed fallback")
	}
}

func TestPhase6B5MissingRootfsFailsClosed(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" || os.Getuid() == 0 {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true and run as the dedicated non-root user")
	}
	runtime := New(t.TempDir(), "/usr/bin/runc", "/usr/bin/true")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := runtime.PreflightRealExecution(ctx, CompilerRootfs{
		ProfileID: CPP20ProfileID, Path: "/definitely/missing/phase6b5-rootfs", Identity: strings.Repeat("a", 64),
		CompilerVersion: "missing", CommandTemplateSHA: CompilerCommandTemplateSHA256(), Trusted: true,
	})
	if err == nil || !errors.Is(err, ErrSandboxPreflight) {
		t.Fatalf("missing compiler rootfs did not fail closed: %v", err)
	}
}

func TestPhase6B5WorkspaceSetupFailureHasNoFallback(t *testing.T) {
	if os.Getenv("OJPLATFORM_SANDBOX_REAL_TEST") != "true" || os.Getuid() == 0 {
		t.Skip("set OJPLATFORM_SANDBOX_REAL_TEST=true and run as the dedicated non-root user")
	}
	root := t.TempDir()
	probePath, marker := buildPhase6B5MarkerProbe(t, root)
	blockedRoot := filepath.Join(root, "not-a-directory")
	if err := os.WriteFile(blockedRoot, []byte("blocked"), 0o600); err != nil {
		t.Fatal(err)
	}
	runtime, err := NewWithTrustedProfile(blockedRoot, "/usr/bin/runc", probePath, "")
	if err != nil {
		t.Fatal(err)
	}
	result, runErr := runtime.Run(context.Background(), phase6B5Request(probePath))
	if runErr == nil || result.Stdout != "" || result.Stderr != "" || pathExists(marker) {
		t.Fatalf("workspace setup failure did not stop before execution: result=%+v err=%v", result, runErr)
	}
}
