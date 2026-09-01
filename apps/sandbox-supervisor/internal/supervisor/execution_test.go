package supervisor

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

func validRealRequest() model.RealExecutionRequest {
	source := "#include <iostream>\nint main(){std::cout << \"ok\\n\";}\n"
	digest := sha256.Sum256([]byte(source))
	inputDigest := sha256.Sum256([]byte("111\n"))
	return model.RealExecutionRequest{
		ProtocolVersion: model.ExecutionContractVersion, ExecutionRequestID: "execution-1",
		JudgeJobID: "job-1", SubmissionID: "submission-1", Attempt: 1,
		CorrelationID: "correlation-1", ProblemID: "problem-1", ProblemRevisionID: "revision-1",
		TestdataVersionRef: "testdata-v1", LanguageProfileID: CPP20ProfileID,
		SourceSnapshotRef: "submission:submission-1", SourceBytes: source,
		SourceSHA256: hex.EncodeToString(digest[:]), ControlledInputID: "stdin-empty-v1",
		TestcaseID: "case-1", TestcaseInput: []byte("111\n"), TestcaseInputSHA256: hex.EncodeToString(inputDigest[:]), ExecutionProfileID: CPP20ProfileID,
		DeadlineAt: time.Now().Add(time.Minute),
	}
}

func TestTestcaseInputStagingRejectsMutationAndSymlink(t *testing.T) {
	input := model.TestcaseInput{TestcaseID: "case-1", TestdataVersionID: "td-v1", Bytes: []byte("111\n")}
	digest := sha256.Sum256(input.Bytes)
	input.SHA256 = hex.EncodeToString(digest[:])
	path, err := StageTestcaseInput(t.TempDir(), input)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyStagedTestcaseInput(path, input); err != nil {
		t.Fatal(err)
	}
	data, err := ReadVerifiedTestcaseInput(path, input)
	if err != nil || string(data) != "111\n" {
		t.Fatalf("verified testcase read failed: data=%q err=%v", data, err)
	}
	if err := os.WriteFile(path, []byte("222\n"), 0o600); err == nil {
		if VerifyStagedTestcaseInput(path, input) == nil {
			t.Fatal("mutated testcase input accepted")
		}
	}
	link := filepath.Join(filepath.Dir(path), "link.input")
	if err := os.Symlink(path, link); err == nil {
		if VerifyStagedTestcaseInput(link, input) == nil {
			t.Fatal("symlink testcase input accepted")
		}
	}
}

func TestReadVerifiedTestcaseInputRejectsSymlinkReplacement(t *testing.T) {
	root := t.TempDir()
	input := model.TestcaseInput{TestcaseID: "case-1", TestdataVersionID: "td-v1", Bytes: []byte("111\n")}
	input.SHA256 = digestBytes(input.Bytes)
	path, err := StageTestcaseInput(root, input)
	if err != nil {
		t.Fatal(err)
	}
	replacement := filepath.Join(root, "replacement")
	if err := os.WriteFile(replacement, input.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(replacement, path); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := ReadVerifiedTestcaseInput(path, input); err == nil {
		t.Fatal("symlink replacement accepted")
	}
}

func TestSingleTestcaseRecordBindsFactsAndDigest(t *testing.T) {
	request := validRealRequest()
	result := model.RealExecutionResult{ExecutionRequestID: request.ExecutionRequestID, ExecutionAttemptID: request.ExecutionRequestID + ":attempt", PipelineOutcome: PipelineCompleted, SourceSHA256: request.SourceSHA256, Artifact: &model.ArtifactResult{SHA256: strings.Repeat("a", 64)}, Runtime: &model.StageResult{WallTimeMS: 12, CPUTimeUsec: 7, CPUTimeSource: "cgroup.v2:cpu.stat:usage_usec", MemoryPeakBytes: 4096, MemoryPeakSource: "cgroup.v2:memory.peak", StdoutBytes: 4, StdoutSHA256: digestBytes([]byte("111\n")), StderrBytes: 0, StderrSHA256: digestBytes(nil), Facts: model.RawExecutionFacts{ProcessExited: true, CleanupVerified: true}, Clean: true}, Clean: true, CompletedAt: time.Now().UTC()}
	record := BuildSingleTestcaseExecutionRecord(request, result)
	if record.Identity.TestcaseID != "case-1" || record.Identity.InputSHA256 != request.TestcaseInputSHA256 || record.Identity.ExecutionProfileID != CPP20ProfileID || record.Digest == "" {
		t.Fatalf("record identity incomplete: %+v", record)
	}
	if !record.CPU.Available || record.CPU.Source != "cgroup.v2:cpu.stat:usage_usec" || !record.Memory.Peak.Available || record.Memory.Peak.Semantics == "" {
		t.Fatalf("measurement semantics incomplete: %+v", record)
	}
	second := BuildSingleTestcaseExecutionRecord(request, result)
	if record.Digest != second.Digest {
		t.Fatal("record digest is not deterministic")
	}
}

func TestSingleTestcaseRecordDigestExcludesSelfField(t *testing.T) {
	request := validRealRequest()
	result := model.RealExecutionResult{
		ExecutionRequestID: request.ExecutionRequestID,
		ExecutionAttemptID: request.ExecutionRequestID + ":attempt",
		PipelineOutcome:    PipelineCompleted,
		SourceSHA256:       request.SourceSHA256,
		Artifact:           &model.ArtifactResult{SHA256: strings.Repeat("a", 64)},
		Runtime: &model.StageResult{
			StdoutBytes: 4, StdoutSHA256: digestBytes([]byte("111\n")),
			StderrBytes: 0, StderrSHA256: digestBytes(nil),
			Facts: model.RawExecutionFacts{ProcessExited: true, CleanupVerified: true},
			Clean: true,
		},
		Clean: true,
	}
	record := BuildSingleTestcaseExecutionRecord(request, result)
	encoded, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &object); err != nil {
		t.Fatal(err)
	}
	claimed := string(object["digest"])
	var claimedDigest string
	if err := json.Unmarshal(object["digest"], &claimedDigest); err != nil {
		t.Fatal(err)
	}
	delete(object, "digest")
	canonical, err := json.Marshal(object)
	if err != nil {
		t.Fatal(err)
	}
	var normalized any
	if err := json.Unmarshal(canonical, &normalized); err != nil {
		t.Fatal(err)
	}
	canonical, err = json.Marshal(normalized)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(canonical)
	if got := hex.EncodeToString(sum[:]); got != claimedDigest {
		t.Fatalf("digest includes self field or uses a different canonical form: claimed=%s actual=%s raw=%s", claimedDigest, got, claimed)
	}
}

func TestRealExecutionRequestIntegrity(t *testing.T) {
	request := validRealRequest()
	if err := ValidateRealExecutionRequest(request); err != nil {
		t.Fatal(err)
	}
	request.SourceBytes += "tamper"
	if err := ValidateRealExecutionRequest(request); err == nil {
		t.Fatal("source hash mismatch accepted")
	}
	request = validRealRequest()
	request.LanguageProfileID = "cpp20-user-flags"
	if err := ValidateRealExecutionRequest(request); err == nil {
		t.Fatal("unsupported language profile accepted")
	}
}

func TestCompilerProfileIsFixedAndFinite(t *testing.T) {
	if CompilerCommandTemplateSHA256() == "" || len(compilerArgv) != 10 {
		t.Fatal("compiler command template identity missing")
	}
	for _, argument := range compilerArgv {
		if argument == "sh" || argument == "bash" || argument == "-c" {
			t.Fatal("shell entered fixed compiler argv")
		}
	}
	for name, limits := range map[string]model.ExecutionLimits{"compile": compileLimits, "runtime": runtimeLimits} {
		if limits.CPUMillis < 1 || limits.WallTimeMS < 1 || limits.MemoryBytes < 1 || limits.OutputBytes < 1 || limits.Pids < 1 || limits.WorkspaceBytes < 1 {
			t.Fatalf("%s limits are not finite: %+v", name, limits)
		}
	}
}

func TestBoundedWriterCancelsAtLimit(t *testing.T) {
	cancelled := false
	writer := boundedWriter{limit: 4, onLimit: func() { cancelled = true }}
	if n, err := writer.Write([]byte("12345")); err != nil || n != 5 {
		t.Fatalf("write n=%d err=%v", n, err)
	}
	if !writer.Exceeded() || !cancelled || writer.String() != "1234" {
		t.Fatalf("bounded writer did not enforce limit: exceeded=%t cancelled=%t value=%q", writer.Exceeded(), cancelled, writer.String())
	}
}

func TestStageResultPreservesExactOutputMetadata(t *testing.T) {
	run := stageRun{
		Stdout: "abcd", Stderr: "err", StdoutBytes: []byte("abcd"), StderrBytes: []byte("err"),
		StdoutTruncated: true, StderrTruncated: false, Clean: true,
	}
	result := stageResult(run)
	if result.StdoutBytes != 4 || result.StdoutSHA256 != digestBytes([]byte("abcd")) || !result.StdoutTruncated {
		t.Fatalf("stdout metadata lost: %+v", result)
	}
	if result.StderrBytes != 3 || result.StderrSHA256 != digestBytes([]byte("err")) || result.StderrTruncated {
		t.Fatalf("stderr metadata lost: %+v", result)
	}
}

func TestProcessExitReportsOnlyProvenWaitSignal(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows does not expose POSIX wait signals")
	}
	err := exec.Command("sh", "-c", "kill -TERM $$").Run()
	if err == nil {
		t.Fatal("signal fixture exited successfully")
	}
	exitCode, signal := processExit(err)
	if signal == "" || exitCode >= 0 {
		t.Fatalf("wait status did not preserve proven signal: exit=%d signal=%q err=%v", exitCode, signal, err)
	}
}

func TestArtifactPathAndHashTamperFailClosed(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	artifact := filepath.Join(t.TempDir(), "artifact")
	if err = copyFile(executable, artifact, 0o555); err != nil {
		t.Fatal(err)
	}
	validated, err := ValidateCompiledArtifact(artifact, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ValidateCompiledArtifact(artifact, strings.Repeat("0", 64)); err == nil {
		t.Fatal("artifact hash mismatch accepted")
	}
	symlink := filepath.Join(filepath.Dir(artifact), "artifact-link")
	if err = os.Symlink(artifact, symlink); err != nil {
		t.Fatal(err)
	}
	if _, err = ValidateCompiledArtifact(symlink, validated.SHA256); err == nil {
		t.Fatal("artifact symlink accepted")
	}
}
