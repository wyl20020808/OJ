package supervisor

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

func validRealRequest() model.RealExecutionRequest {
	source := "#include <iostream>\nint main(){std::cout << \"ok\\n\";}\n"
	digest := sha256.Sum256([]byte(source))
	return model.RealExecutionRequest{
		ProtocolVersion: model.ExecutionContractVersion, ExecutionRequestID: "execution-1",
		JudgeJobID: "job-1", SubmissionID: "submission-1", Attempt: 1,
		CorrelationID: "correlation-1", ProblemRevisionID: "revision-1",
		TestdataVersionRef: "testdata-v1", LanguageProfileID: CPP20ProfileID,
		SourceSnapshotRef: "submission:submission-1", SourceBytes: source,
		SourceSHA256: hex.EncodeToString(digest[:]), ControlledInputID: "stdin-empty-v1",
		DeadlineAt: time.Now().Add(time.Minute),
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
