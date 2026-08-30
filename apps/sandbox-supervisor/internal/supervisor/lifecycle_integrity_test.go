package supervisor

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

func sourceHash(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}

func TestLIRSourceSnapshotStagingAndReverification(t *testing.T) {
	source := []byte("int main(){return 0;}\n")
	hash := sourceHash(source)
	path, err := StageSourceSnapshot(t.TempDir(), source, hash)
	if err != nil {
		t.Fatal(err)
	}
	if err = VerifyStagedSource(path, hash, len(source)); err != nil {
		t.Fatal(err)
	}
	if _, err = StageSourceSnapshot(t.TempDir(), source, sourceHash([]byte("other"))); err == nil {
		t.Fatal("SOURCE-02 hash mismatch accepted")
	}
	if err = os.WriteFile(path, []byte("int main(){return 1;}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err = VerifyStagedSource(path, hash, len(source)); err == nil {
		t.Fatal("SOURCE-03 staged mutation accepted")
	}
}

func TestLIRSourceSymlinkAndConcurrentFilenameIsolation(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target.cpp")
	if err := os.WriteFile(target, []byte("other"), 0o600); err != nil {
		t.Fatal(err)
	}
	symlinkDir := filepath.Join(root, "symlink")
	if err := os.Mkdir(symlinkDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(symlinkDir, "main.cpp")); err == nil {
		if _, err = StageSourceSnapshot(symlinkDir, []byte("valid"), sourceHash([]byte("valid"))); err == nil {
			t.Fatal("SOURCE-04 symlink substitution accepted")
		}
	}
	a, b := []byte("unique-a"), []byte("unique-b")
	pathA, err := StageSourceSnapshot(filepath.Join(root, "a"), a, sourceHash(a))
	if err != nil {
		t.Fatal(err)
	}
	pathB, err := StageSourceSnapshot(filepath.Join(root, "b"), b, sourceHash(b))
	if err != nil {
		t.Fatal(err)
	}
	if pathA == pathB {
		t.Fatal("SOURCE-07 concurrent filenames share a path")
	}
	dataA, _ := os.ReadFile(pathA)
	dataB, _ := os.ReadFile(pathB)
	if string(dataA) != string(a) || string(dataB) != string(b) {
		t.Fatal("concurrent staged sources crossed")
	}
}

func TestLIRArtifactHandoffBindsAttemptAndHash(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("ELF artifact validation is Linux-only")
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	artifact := filepath.Join(t.TempDir(), "main")
	if err = copyFile(executable, artifact, 0o555); err != nil {
		t.Fatal(err)
	}
	initial, err := ValidateCompiledArtifact(artifact, "")
	if err != nil {
		t.Fatal(err)
	}
	owner := model.ResourceOwnership{ResourceKind: "artifact", ExecutionAttemptID: "job:1:attempt", CompileAttemptID: "job:1:compile", SandboxID: "job:1:sandbox"}
	if err = WriteArtifactOwnership(artifact, owner); err != nil {
		t.Fatal(err)
	}
	expect := ArtifactExpectation{Path: artifact, WorkspaceRoot: filepath.Dir(artifact), ExecutionAttemptID: owner.ExecutionAttemptID, CompileAttemptID: owner.CompileAttemptID, SandboxID: owner.SandboxID, ExpectedHash: initial.SHA256, MaxBytes: maxArtifactBytes}
	if _, err = ValidateArtifactHandoff(expect); err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(artifact, 0o755); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(artifact, []byte("replacement"), 0o555); err != nil {
		t.Fatal(err)
	}
	if _, err = ValidateArtifactHandoff(expect); err == nil {
		t.Fatal("ART-02/03 artifact replacement accepted")
	}
}

func TestLIRResidueAuditCleansOnlyExactStaleOwned(t *testing.T) {
	root := t.TempDir()
	stale := filepath.Join(root, "c2c2-stale")
	active := filepath.Join(root, "c2c2-active")
	foreign := filepath.Join(root, "foreign-lookalike")
	unknown := filepath.Join(root, "c2c2-unknown")
	for _, path := range []string{stale, active, foreign, unknown} {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := WriteOwnershipMetadata(stale, model.ResourceOwnership{ResourceKind: "workspace", ExecutionAttemptID: "stale-attempt", SandboxID: "stale-sandbox"}); err != nil {
		t.Fatal(err)
	}
	if err := WriteOwnershipMetadata(active, model.ResourceOwnership{ResourceKind: "workspace", ExecutionAttemptID: "active-attempt", SandboxID: "active-sandbox"}); err != nil {
		t.Fatal(err)
	}
	resources, err := AuditStartupResidue(root, map[string]bool{"active-attempt": true})
	if err != nil {
		t.Fatal(err)
	}
	classes := map[string]ResidueClass{}
	for _, resource := range resources {
		classes[filepath.Base(resource.Path)] = resource.Class
	}
	if classes["c2c2-stale"] != StaleOwned || classes["c2c2-active"] != ActiveOwned || classes["foreign-lookalike"] != Foreign || classes["c2c2-unknown"] != Unknown {
		t.Fatalf("unexpected residue classes: %#v", classes)
	}
	if err = CleanupStaleOwned(resources); err != nil {
		t.Fatal(err)
	}
	if pathExists(stale) || !pathExists(active) || !pathExists(foreign) || !pathExists(unknown) {
		t.Fatal("startup cleanup crossed ownership boundary")
	}
}

func TestLIRStateAndResultRaceDeterminism(t *testing.T) {
	lifecycle, err := NewLifecycle(model.StateAccepted)
	if err != nil {
		t.Fatal(err)
	}
	for _, state := range []model.ExecutionState{model.StateClaimed, model.StateCompilePreparing, model.StateCompiling, model.StateCompileSucceeded, model.StateRuntimePreparing, model.StateRunning, model.StateRawCompleted, model.StateCleanupPending, model.StateCleanupVerified} {
		if err = lifecycle.Transition(state); err != nil {
			t.Fatalf("transition to %s: %v", state, err)
		}
	}
	if err = lifecycle.Transition(model.StateCancelled); err == nil {
		t.Fatal("late cancellation rolled back verified completion")
	}
	if got := DecideResult(2, 2, 1, 1, false, false); got != ResultStale {
		t.Fatalf("STALE-01 old attempt decision=%s", got)
	}
	if got := DecideResult(2, 2, 2, 2, true, true); got != ResultDuplicate {
		t.Fatalf("STALE-04 duplicate decision=%s", got)
	}
	if got := DecideResult(2, 2, 2, 2, true, false); got != ResultConflict {
		t.Fatalf("conflicting duplicate decision=%s", got)
	}
}

func TestLIRRawFactNormalizationHasNoVerdictMapping(t *testing.T) {
	run := stageRun{ExitCode: -1, Signal: "SIGKILL", TimedOut: true, StdoutTruncated: true, Clean: true, Err: errors.New("signal: killed"), Evidence: &model.RuntimeEvidence{MemoryEvents: "max 1\n", PidsEvents: "max 2\n"}}
	facts := NormalizeRawExecutionFacts(run)
	if !facts.ProcessExited || facts.ExitCode != -1 || facts.TerminationSignal != "SIGKILL" || !facts.WallLimitReached || !facts.MemoryLimitEvent || !facts.PidsLimitEvent || !facts.StdoutTruncated || facts.RuntimeInfraFailed || !facts.CleanupVerified {
		t.Fatalf("raw facts not normalized: %+v", facts)
	}
	infra := NormalizeRawExecutionFacts(stageRun{ExitCode: -1, Err: errors.New("runc unavailable"), Clean: true})
	if !infra.RuntimeInfraFailed || !infra.SandboxSetupFailed {
		t.Fatalf("runtime infrastructure failure not normalized: %+v", infra)
	}
}
