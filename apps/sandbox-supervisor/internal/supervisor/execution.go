package supervisor

import (
	"context"
	"crypto/sha256"
	"debug/elf"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

const (
	CPP20ProfileID = "cpp20-gcc-13-v1"

	PipelineCompleted     = "PIPELINE_COMPLETED"
	PipelineCompileFailed = "PIPELINE_COMPILE_FAILED"
	PipelineLimitHit      = "PIPELINE_LIMIT_HIT"
	PipelineCancelled     = "PIPELINE_CANCELLED"
	PipelineInfraFailure  = "PIPELINE_INFRA_FAILURE"

	CompileSucceeded      = "COMPILE_SUCCEEDED"
	CompileFailed         = "COMPILE_FAILED"
	CompileLimitExceeded  = "COMPILE_LIMIT_EXCEEDED"
	CompileCancelled      = "COMPILE_CANCELLED"
	CompileInfraFailure   = "COMPILE_INFRA_FAILURE"
	ExecutionCompleted    = "EXECUTION_COMPLETED"
	ExecutionLimitHit     = "EXECUTION_LIMIT_HIT"
	ExecutionCancelled    = "EXECUTION_CANCELLED"
	ExecutionInfraFailure = "EXECUTION_INFRA_FAILURE"

	maxSourceBytes   = 256 << 10
	maxArtifactBytes = 16 << 20
)

var compilerArgv = []string{
	"/usr/bin/g++-13",
	"-std=c++20",
	"-O2",
	"-pipe",
	"-static",
	"-fno-diagnostics-color",
	"-fno-ident",
	"/workspace/input/main.cpp",
	"-o",
	"/workspace/build/main",
}

var compileLimits = model.ExecutionLimits{
	CPUMillis: 100, WallTimeMS: 10_000, MemoryBytes: 512 << 20,
	OutputBytes: 64 << 10, Pids: 64, WorkspaceBytes: 32 << 20,
}

var runtimeLimits = model.ExecutionLimits{
	CPUMillis: 100, WallTimeMS: 2_000, MemoryBytes: 64 << 20,
	OutputBytes: 64 << 10, Pids: 16, WorkspaceBytes: 1 << 20,
}

type CompilerRootfs struct {
	ProfileID          string
	Path               string
	Identity           string
	CompilerVersion    string
	CommandTemplateSHA string
	Trusted            bool
}

type stageRun struct {
	ExitCode          int
	Signal            string
	Stdout            string
	Stderr            string
	StdoutTruncated   bool
	StderrTruncated   bool
	WallTimeMS        int64
	TimedOut          bool
	Cancelled         bool
	WorkspaceExceeded bool
	Clean             bool
	Evidence          *model.RuntimeEvidence
	Err               error
}

func CompilerCommandTemplateSHA256() string {
	digest := sha256.Sum256([]byte(strings.Join(compilerArgv, "\x00")))
	return hex.EncodeToString(digest[:])
}

func CompileResourceLimits() model.ExecutionLimits { return compileLimits }
func RuntimeResourceLimits() model.ExecutionLimits { return runtimeLimits }

func executionIdentity(request model.RealExecutionRequest) model.ExecutionIdentity {
	return model.ExecutionIdentity{
		SubmissionID: request.SubmissionID, SnapshotID: request.SourceSnapshotRef,
		JudgeJobID: request.JudgeJobID, ExecutionRequestID: request.ExecutionRequestID,
		ExecutionAttemptID: request.ExecutionRequestID + ":attempt",
		CompileAttemptID:   request.ExecutionRequestID + ":compile",
		RuntimeAttemptID:   request.ExecutionRequestID + ":runtime",
		SandboxID:          request.ExecutionRequestID + ":sandbox",
		ResultGeneration:   int64(request.Attempt),
	}
}

func sandboxIDFor(value, stage string) string {
	digest := sha256.Sum256([]byte(value + "\x00" + stage))
	return "c2c2-" + hex.EncodeToString(digest[:12]) + "-" + stage
}

func ValidateRealExecutionRequest(request model.RealExecutionRequest) error {
	if request.ProtocolVersion != model.ExecutionContractVersion {
		return errors.New("unsupported real execution contract")
	}
	for name, value := range map[string]string{
		"execution_request_id": request.ExecutionRequestID,
		"judge_job_id":         request.JudgeJobID,
		"submission_id":        request.SubmissionID,
		"correlation_id":       request.CorrelationID,
		"problem_revision_id":  request.ProblemRevisionID,
		"testdata_version_ref": request.TestdataVersionRef,
		"source_snapshot_ref":  request.SourceSnapshotRef,
	} {
		if value == "" || len(value) > 256 || strings.ContainsRune(value, '\x00') {
			return fmt.Errorf("invalid %s", name)
		}
	}
	if request.Attempt < 1 || request.CancellationGeneration < 0 {
		return errors.New("invalid execution attempt")
	}
	if request.LanguageProfileID != CPP20ProfileID {
		return errors.New("unsupported language profile")
	}
	if request.ControlledInputID != "stdin-empty-v1" && request.ControlledInputID != "stdin-echo-v1" {
		return errors.New("unknown controlled input")
	}
	source := []byte(request.SourceBytes)
	if len(source) == 0 || len(source) > maxSourceBytes || !utf8.Valid(source) {
		return errors.New("invalid source snapshot")
	}
	digest := sha256.Sum256(source)
	if request.SourceSHA256 != hex.EncodeToString(digest[:]) {
		return errors.New("source snapshot hash mismatch")
	}
	if request.DeadlineAt.IsZero() || !request.DeadlineAt.After(time.Now()) {
		return errors.New("execution deadline expired")
	}
	return nil
}

func (s *Supervisor) PreflightRealExecution(ctx context.Context, rootfs CompilerRootfs) error {
	if err := s.Preflight(ctx); err != nil {
		return err
	}
	resolved, err := filepath.EvalSymlinks(rootfs.Path)
	if err != nil {
		return fmt.Errorf("%w: compiler rootfs unavailable", ErrSandboxPreflight)
	}
	expected := filepath.Clean("/opt/ojplatform/compiler-rootfs/" + CPP20ProfileID)
	if resolved != expected || rootfs.ProfileID != CPP20ProfileID || rootfs.Identity == "" || rootfs.CompilerVersion == "" || rootfs.CommandTemplateSHA != CompilerCommandTemplateSHA256() || !rootfs.Trusted {
		return fmt.Errorf("%w: compiler rootfs identity rejected", ErrSandboxPreflight)
	}
	identityBytes, err := os.ReadFile(rootfs.Path + ".identity")
	if err != nil || strings.TrimSpace(string(identityBytes)) != rootfs.Identity {
		return fmt.Errorf("%w: compiler rootfs identity mismatch", ErrSandboxPreflight)
	}
	versionBytes, err := os.ReadFile(rootfs.Path + ".compiler-version.txt")
	if err != nil || strings.TrimSpace(string(versionBytes)) != strings.TrimSpace(rootfs.CompilerVersion) {
		return fmt.Errorf("%w: compiler version identity mismatch", ErrSandboxPreflight)
	}
	compiler := filepath.Join(rootfs.Path, "usr/bin/g++-13")
	if info, statErr := os.Stat(compiler); statErr != nil || !info.Mode().IsRegular() || info.Mode()&0111 == 0 {
		return fmt.Errorf("%w: trusted compiler unavailable", ErrSandboxPreflight)
	}
	if err := filepath.WalkDir(rootfs.Path, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return infoErr
		}
		if info.Mode().Perm()&0222 != 0 {
			return fmt.Errorf("compiler rootfs contains writable path")
		}
		return nil
	}); err != nil {
		return fmt.Errorf("%w: %v", ErrSandboxPreflight, err)
	}
	return nil
}

func (s *Supervisor) ExecuteCPP20(ctx context.Context, request model.RealExecutionRequest, rootfs CompilerRootfs) (result model.RealExecutionResult, runErr error) {
	started := time.Now().UTC()
	result = model.RealExecutionResult{
		ProtocolVersion: model.ExecutionContractVersion, ExecutionRequestID: request.ExecutionRequestID,
		JudgeJobID: request.JudgeJobID, SubmissionID: request.SubmissionID, Attempt: request.Attempt,
		CorrelationID: request.CorrelationID, LanguageProfileID: request.LanguageProfileID,
		SourceSHA256: request.SourceSHA256, StartedAt: started,
	}
	identity := executionIdentity(request)
	compileSandboxID := sandboxIDFor(identity.CompileAttemptID, "compile")
	runtimeSandboxID := sandboxIDFor(identity.RuntimeAttemptID, "runtime")
	result.ExecutionAttemptID, result.CompileAttemptID, result.RuntimeAttemptID, result.ResultGeneration = identity.ExecutionAttemptID, identity.CompileAttemptID, identity.RuntimeAttemptID, identity.ResultGeneration
	result.CompileSandboxID, result.RuntimeSandboxID = compileSandboxID, runtimeSandboxID
	defer func() { result.CompletedAt = time.Now().UTC() }()
	if err := ValidateRealExecutionRequest(request); err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		result.Compile = model.StageResult{Outcome: CompileInfraFailure, DiagnosticCode: "REQUEST_REJECTED", Clean: true}
		result.Clean = true
		return result, err
	}
	if err := s.PreflightRealExecution(ctx, rootfs); err != nil {
		if ctx.Err() != nil {
			result.PipelineOutcome = PipelineCancelled
			result.Compile = model.StageResult{
				Outcome: CompileCancelled, State: model.StateCancelled, DiagnosticCode: "CANCELLED",
				Clean: true, Facts: model.RawExecutionFacts{Cancelled: true, CleanupVerified: true},
			}
			result.Clean = true
			return result, ctx.Err()
		}
		result.PipelineOutcome = PipelineInfraFailure
		result.Compile = model.StageResult{Outcome: CompileInfraFailure, DiagnosticCode: "PREFLIGHT_FAILED", Clean: true}
		result.Clean = true
		return result, err
	}

	jobRoot, err := os.MkdirTemp(s.Root, "c2c2-")
	if err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		result.Compile = model.StageResult{Outcome: CompileInfraFailure, DiagnosticCode: "WORKSPACE_SETUP_FAILED"}
		return result, err
	}
	if err := WriteOwnershipMetadata(jobRoot, model.ResourceOwnership{
		Schema: ownershipSchema, ResourceKind: "execution-attempt", SubmissionID: request.SubmissionID,
		JudgeJobID: request.JudgeJobID, ExecutionRequestID: request.ExecutionRequestID,
		ExecutionAttemptID: identity.ExecutionAttemptID, SandboxID: identity.SandboxID,
	}); err != nil {
		_ = os.RemoveAll(jobRoot)
		return result, err
	}
	defer func() {
		removeErr := removeOwnedExecutionRoot(jobRoot, identity.ExecutionAttemptID, identity.SandboxID)
		clean := removeErr == nil && !pathExists(jobRoot)
		result.Clean = result.Compile.Clean && (result.Runtime == nil || result.Runtime.Clean) && clean
		if !clean {
			result.PipelineOutcome = PipelineInfraFailure
			runErr = errors.New("real execution workspace cleanup failed")
		}
	}()
	if err := os.Chmod(s.Root, 0711); err != nil {
		return result, err
	}
	workspace := filepath.Join(jobRoot, "workspace")
	inputDir := filepath.Join(workspace, "input")
	buildDir := filepath.Join(workspace, "build")
	if err := os.MkdirAll(inputDir, 0700); err != nil {
		return result, err
	}
	if err := os.MkdirAll(buildDir, 0700); err != nil {
		return result, err
	}
	sourcePath, err := StageSourceSnapshot(inputDir, []byte(request.SourceBytes), request.SourceSHA256)
	if err != nil {
		return result, err
	}
	if err := WriteOwnershipMetadata(inputDir, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "source-staging", SubmissionID: request.SubmissionID, JudgeJobID: request.JudgeJobID, ExecutionRequestID: request.ExecutionRequestID, ExecutionAttemptID: identity.ExecutionAttemptID, SandboxID: compileSandboxID}); err != nil {
		return result, err
	}
	if err := VerifyStagedSource(sourcePath, request.SourceSHA256, len(request.SourceBytes)); err != nil {
		return result, err
	}

	compileBundle := filepath.Join(jobRoot, "compile")
	compileMounts := stageMounts(16 << 20)
	compileMounts[len(compileMounts)-1] = bundleMount{
		Destination: "/workspace", Type: "bind", Source: workspace,
		Options: []string{"rbind", "rw", "nosuid", "nodev", "noexec"},
	}
	compileRun := s.runExecutionStageWithID(ctx, compileBundle, rootfs.Path, true, compilerArgv,
		"/workspace", []string{"PATH=/usr/bin:/bin", "LANG=C", "LC_ALL=C"}, compileMounts, compileLimits, nil, workspace, compileSandboxID)
	result.Compile = classifyCompile(compileRun, rootfs.Path, workspace)
	if result.Compile.Outcome != CompileSucceeded {
		result.PipelineOutcome = pipelineForCompile(result.Compile.Outcome)
		return result, compileRun.Err
	}

	artifactPath := filepath.Join(buildDir, "main")
	artifact, err := ValidateCompiledArtifact(artifactPath, "")
	if err != nil {
		result.Compile.Outcome = CompileInfraFailure
		result.Compile.DiagnosticCode = "ARTIFACT_REJECTED"
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	artifact.LanguageProfileID = CPP20ProfileID
	artifact.CompilerVersion = firstLine(rootfs.CompilerVersion)
	artifact.CompilerRootfsID = rootfs.Identity
	artifact.CommandTemplateSHA = CompilerCommandTemplateSHA256()
	artifact.SourceSHA256 = request.SourceSHA256
	artifact.ArtifactID = identity.CompileAttemptID + ":artifact"
	artifact.CompileAttemptID = identity.CompileAttemptID
	artifact.SandboxID = compileSandboxID
	if err := WriteArtifactOwnership(artifactPath, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "artifact", SubmissionID: request.SubmissionID, JudgeJobID: request.JudgeJobID, ExecutionRequestID: request.ExecutionRequestID, ExecutionAttemptID: identity.ExecutionAttemptID, CompileAttemptID: identity.CompileAttemptID, SandboxID: compileSandboxID}); err != nil {
		result.Compile.Outcome = CompileInfraFailure
		result.Compile.DiagnosticCode = "ARTIFACT_OWNERSHIP_FAILED"
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	if _, err := ValidateArtifactHandoff(ArtifactExpectation{Path: artifactPath, WorkspaceRoot: buildDir, ExecutionAttemptID: identity.ExecutionAttemptID, CompileAttemptID: identity.CompileAttemptID, SandboxID: compileSandboxID, SourceSHA256: request.SourceSHA256, ExpectedHash: artifact.SHA256, MaxBytes: maxArtifactBytes}); err != nil {
		result.Compile.Outcome = CompileInfraFailure
		result.Compile.DiagnosticCode = "ARTIFACT_HANDOFF_REJECTED"
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	result.Artifact = &artifact

	runtimeBundle := filepath.Join(jobRoot, "runtime")
	if err := os.Mkdir(runtimeBundle, 0o700); err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	runtimeRootfs := filepath.Join(runtimeBundle, "rootfs")
	for _, directory := range []string{"dev", "proc", "tmp", "workspace"} {
		if err := os.MkdirAll(filepath.Join(runtimeRootfs, directory), 0755); err != nil {
			result.PipelineOutcome = PipelineInfraFailure
			return result, err
		}
	}
	programPath := filepath.Join(runtimeRootfs, "program")
	if _, err := ValidateArtifactHandoff(ArtifactExpectation{Path: artifactPath, WorkspaceRoot: buildDir, ExecutionAttemptID: identity.ExecutionAttemptID, CompileAttemptID: identity.CompileAttemptID, SandboxID: compileSandboxID, SourceSHA256: request.SourceSHA256, ExpectedHash: artifact.SHA256, MaxBytes: maxArtifactBytes}); err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	if err := copyFile(artifactPath, programPath, 0555); err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	if _, err := ValidateCompiledArtifact(programPath, artifact.SHA256); err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	stdin := []byte{}
	if request.ControlledInputID == "stdin-echo-v1" {
		stdin = []byte("phase2c1-input\n")
	}
	runtimeRun := s.runExecutionStageWithID(ctx, runtimeBundle, "rootfs", true, []string{"/program"},
		"/workspace", []string{"PATH=/", "LANG=C", "LC_ALL=C"}, stageMounts(1<<20), runtimeLimits, stdin, "", runtimeSandboxID)
	runtimeResult := classifyRuntime(runtimeRun)
	result.Runtime = &runtimeResult
	result.PipelineOutcome = pipelineForRuntime(runtimeResult.Outcome)
	return result, runtimeRun.Err
}

func stageMounts(tmpBytes int64) []bundleMount {
	return []bundleMount{
		{Destination: "/dev", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=64k", "mode=755"}},
		{Destination: "/proc", Type: "proc", Source: "proc", Options: []string{"nosuid", "noexec", "nodev"}},
		{Destination: "/tmp", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=" + strconv.FormatInt(tmpBytes, 10), "mode=1777"}},
		{Destination: "/workspace", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "nodev", "size=1m", "mode=700"}},
	}
}

func (s *Supervisor) runExecutionStage(ctx context.Context, bundle, rootfs string, readonly bool, args []string, cwd string, env []string, mounts []bundleMount, limits model.ExecutionLimits, stdin []byte, watchedWorkspace string) stageRun {
	return s.runExecutionStageWithID(ctx, bundle, rootfs, readonly, args, cwd, env, mounts, limits, stdin, watchedWorkspace, "c2c2-"+strings.TrimPrefix(id(), "sbx-"))
}

func (s *Supervisor) runExecutionStageWithID(ctx context.Context, bundle, rootfs string, readonly bool, args []string, cwd string, env []string, mounts []bundleMount, limits model.ExecutionLimits, stdin []byte, watchedWorkspace, sandboxID string) stageRun {
	started := time.Now()
	if err := os.MkdirAll(bundle, 0700); err != nil {
		return stageRun{Err: err}
	}
	sid := sandboxID
	if sid == "" || strings.ContainsAny(sid, "/\\\x00") {
		return stageRun{Err: errors.New("sandbox identity rejected")}
	}
	if err := WriteOwnershipMetadata(bundle, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "sandbox", ExecutionAttemptID: sid, SandboxID: sid}); err != nil {
		return stageRun{Err: err}
	}
	request := model.Request{CPUMillis: limits.CPUMillis, MemoryBytes: limits.MemoryBytes, Pids: limits.Pids}
	config := s.ociConfig(sid, "", request, env)
	config.Process.Args = append([]string(nil), args...)
	config.Process.Cwd = cwd
	config.Root = bundleRoot{Path: rootfs, Readonly: readonly}
	config.Mounts = mounts
	config.Linux.Resources.Unified = map[string]string{
		"memory.max": strconv.FormatInt(limits.MemoryBytes, 10),
		"pids.max":   strconv.Itoa(limits.Pids),
	}
	encoded, _ := json.MarshalIndent(config, "", "  ")
	if err := os.WriteFile(filepath.Join(bundle, "config.json"), encoded, 0600); err != nil {
		return stageRun{Err: err}
	}

	stageCtx, cancelStage := context.WithCancel(ctx)
	defer cancelStage()
	commandCtx, cancelTimeout := context.WithTimeout(stageCtx, time.Duration(limits.WallTimeMS)*time.Millisecond)
	defer cancelTimeout()
	var workspaceExceeded atomic.Bool
	monitorWorkspaceDone := make(chan struct{})
	if watchedWorkspace != "" {
		go func() {
			defer close(monitorWorkspaceDone)
			ticker := time.NewTicker(10 * time.Millisecond)
			defer ticker.Stop()
			for {
				if directorySize(watchedWorkspace) > limits.WorkspaceBytes {
					workspaceExceeded.Store(true)
					cancelStage()
					return
				}
				select {
				case <-commandCtx.Done():
					return
				case <-ticker.C:
				}
			}
		}()
	} else {
		close(monitorWorkspaceDone)
	}
	commandArgs := []string{"--rootless=true", "--systemd-cgroup", "run", "--bundle", bundle, sid}
	command := exec.CommandContext(commandCtx, s.Runc, commandArgs...)
	command.Env = []string{"PATH=/usr/bin:/bin", "LANG=C"}
	for _, name := range []string{"DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR"} {
		if value := os.Getenv(name); value != "" {
			command.Env = append(command.Env, name+"="+value)
		}
	}
	command.Stdin = strings.NewReader(string(stdin))
	stdout, stderr := boundedWriter{limit: limits.OutputBytes, onLimit: cancelStage}, boundedWriter{limit: limits.OutputBytes, onLimit: cancelStage}
	command.Stdout, command.Stderr = &stdout, &stderr
	resourceRequest := model.Request{MemoryBytes: limits.MemoryBytes, Pids: limits.Pids}
	resource := newResourceMonitor(sid, resourceRequest)
	go resource.run()
	err := command.Run()
	cancelTimeout()
	<-monitorWorkspaceDone
	evidence := resource.stop()
	cleanup := exec.Command(s.Runc, "--systemd-cgroup", "delete", "--force", sid)
	_ = cleanup.Run()
	removeErr := removeOwnedExecutionRoot(bundle, sid, sid)
	clean := guestGone(s.Runc, sid) && removeErr == nil && !pathExists(bundle)
	exitCode, signal := processExit(err)
	return stageRun{
		ExitCode: exitCode, Signal: signal, Stdout: stdout.String(), Stderr: stderr.String(),
		StdoutTruncated: stdout.Exceeded(), StderrTruncated: stderr.Exceeded(),
		WallTimeMS: time.Since(started).Milliseconds(), TimedOut: errors.Is(commandCtx.Err(), context.DeadlineExceeded),
		Cancelled: ctx.Err() != nil, WorkspaceExceeded: workspaceExceeded.Load(), Clean: clean,
		Evidence: evidence, Err: err,
	}
}

func classifyCompile(run stageRun, rootfs, workspace string) model.StageResult {
	result := stageResult(run)
	result.Stdout = sanitizeDiagnostic(result.Stdout, rootfs, workspace)
	result.Stderr = sanitizeDiagnostic(result.Stderr, rootfs, workspace)
	switch {
	case run.Cancelled:
		result.Outcome, result.DiagnosticCode = CompileCancelled, "CANCELLED"
	case resourceLimitHit(run.Evidence):
		result.Outcome, result.DiagnosticCode = CompileLimitExceeded, "COMPILE_RESOURCE_LIMIT"
	case run.TimedOut:
		result.Outcome, result.DiagnosticCode = CompileLimitExceeded, "COMPILE_WALL_LIMIT"
	case run.WorkspaceExceeded:
		result.Outcome, result.DiagnosticCode = CompileLimitExceeded, "COMPILE_WORKSPACE_LIMIT"
	case run.StdoutTruncated || run.StderrTruncated:
		result.Outcome, result.DiagnosticCode = CompileLimitExceeded, "COMPILE_OUTPUT_LIMIT"
	case !run.Clean:
		result.Outcome, result.DiagnosticCode = CompileInfraFailure, "COMPILE_CLEANUP_FAILURE"
	case run.Err != nil && run.ExitCode < 0:
		result.Outcome, result.DiagnosticCode = CompileInfraFailure, "COMPILE_START_FAILURE"
	case run.ExitCode != 0:
		result.Outcome, result.DiagnosticCode = CompileFailed, "SOURCE_COMPILE_FAILED"
	default:
		result.Outcome = CompileSucceeded
	}
	result.State = compileState(result.Outcome)
	return result
}

func classifyRuntime(run stageRun) model.StageResult {
	result := stageResult(run)
	switch {
	case run.Cancelled:
		result.Outcome, result.DiagnosticCode = ExecutionCancelled, "CANCELLED"
	case resourceLimitHit(run.Evidence):
		result.Outcome, result.DiagnosticCode = ExecutionLimitHit, "RUNTIME_RESOURCE_LIMIT"
	case run.TimedOut:
		result.Outcome, result.DiagnosticCode = ExecutionLimitHit, "RUNTIME_WALL_LIMIT"
	case run.StdoutTruncated || run.StderrTruncated:
		result.Outcome, result.DiagnosticCode = ExecutionLimitHit, "RUNTIME_OUTPUT_LIMIT"
	case !run.Clean:
		result.Outcome, result.DiagnosticCode = ExecutionInfraFailure, "RUNTIME_CLEANUP_FAILURE"
	case run.Err != nil && run.ExitCode < 0:
		result.Outcome, result.DiagnosticCode = ExecutionInfraFailure, "RUNTIME_START_FAILURE"
	default:
		result.Outcome = ExecutionCompleted
	}
	result.State = runtimeState(result.Outcome)
	return result
}

func stageResult(run stageRun) model.StageResult {
	return model.StageResult{
		ExitCode: run.ExitCode, TerminationSignal: run.Signal,
		Stdout: strings.ToValidUTF8(run.Stdout, "\uFFFD"), Stderr: strings.ToValidUTF8(run.Stderr, "\uFFFD"),
		StdoutTruncated: run.StdoutTruncated, StderrTruncated: run.StderrTruncated,
		WallTimeMS: run.WallTimeMS, Clean: run.Clean, Evidence: run.Evidence,
		Facts: NormalizeRawExecutionFacts(run),
	}
}

func compileState(outcome string) model.ExecutionState {
	switch outcome {
	case CompileSucceeded:
		return model.StateCompileSucceeded
	case CompileFailed:
		return model.StateCompileFailed
	case CompileCancelled:
		return model.StateCancelled
	case CompileLimitExceeded:
		return model.StateRawLimitEvent
	default:
		return model.StateInfraFailed
	}
}

func runtimeState(outcome string) model.ExecutionState {
	switch outcome {
	case ExecutionCompleted:
		return model.StateRawCompleted
	case ExecutionCancelled:
		return model.StateCancelled
	case ExecutionLimitHit:
		return model.StateRawLimitEvent
	default:
		return model.StateInfraFailed
	}
}

func pipelineForCompile(outcome string) string {
	switch outcome {
	case CompileFailed:
		return PipelineCompileFailed
	case CompileLimitExceeded:
		return PipelineLimitHit
	case CompileCancelled:
		return PipelineCancelled
	default:
		return PipelineInfraFailure
	}
}

func pipelineForRuntime(outcome string) string {
	switch outcome {
	case ExecutionCompleted:
		return PipelineCompleted
	case ExecutionLimitHit:
		return PipelineLimitHit
	case ExecutionCancelled:
		return PipelineCancelled
	default:
		return PipelineInfraFailure
	}
}

func resourceLimitHit(evidence *model.RuntimeEvidence) bool {
	if evidence == nil {
		return false
	}
	return eventCount(evidence.MemoryEvents, "max") > 0 || eventCount(evidence.MemoryEvents, "oom") > 0 ||
		eventCount(evidence.MemoryEvents, "oom_kill") > 0 || eventCount(evidence.PidsEvents, "max") > 0
}

func eventCount(value, name string) int64 {
	for _, line := range strings.Split(value, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == name {
			count, _ := strconv.ParseInt(fields[1], 10, 64)
			return count
		}
	}
	return 0
}

func processExit(err error) (int, string) {
	if err == nil {
		return 0, ""
	}
	var exitError *exec.ExitError
	if !errors.As(err, &exitError) {
		return -1, ""
	}
	status, ok := exitError.Sys().(syscall.WaitStatus)
	if ok && status.Signaled() {
		return exitError.ExitCode(), status.Signal().String()
	}
	return exitError.ExitCode(), ""
}

func ValidateCompiledArtifact(path, expectedHash string) (model.ArtifactResult, error) {
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || canonical != filepath.Clean(path) {
		return model.ArtifactResult{}, errors.New("compiled artifact path rejected")
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Mode()&0111 == 0 {
		return model.ArtifactResult{}, errors.New("compiled artifact is not a regular executable")
	}
	if info.Size() < 1 || info.Size() > maxArtifactBytes {
		return model.ArtifactResult{}, errors.New("compiled artifact size rejected")
	}
	if !artifactOwnerMatches(info) {
		return model.ArtifactResult{}, errors.New("compiled artifact owner rejected")
	}
	file, err := os.Open(path)
	if err != nil {
		return model.ArtifactResult{}, err
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !os.SameFile(info, openedInfo) {
		return model.ArtifactResult{}, errors.New("compiled artifact replaced during validation")
	}
	binary, err := elf.NewFile(file)
	if err != nil {
		return model.ArtifactResult{}, errors.New("compiled artifact is not ELF")
	}
	defer binary.Close()
	for _, program := range binary.Progs {
		if program.Type == elf.PT_INTERP {
			return model.ArtifactResult{}, errors.New("compiled artifact must be statically linked")
		}
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return model.ArtifactResult{}, err
	}
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return model.ArtifactResult{}, err
	}
	hash := hex.EncodeToString(digest.Sum(nil))
	finalInfo, err := os.Lstat(path)
	if err != nil || !os.SameFile(info, finalInfo) || finalInfo.Size() != info.Size() {
		return model.ArtifactResult{}, errors.New("compiled artifact replaced during validation")
	}
	if expectedHash != "" && hash != expectedHash {
		return model.ArtifactResult{}, errors.New("compiled artifact hash mismatch")
	}
	return model.ArtifactResult{SHA256: hash, SizeBytes: info.Size()}, nil
}

func sanitizeDiagnostic(value string, paths ...string) string {
	value = strings.ToValidUTF8(value, "\uFFFD")
	for _, path := range paths {
		if path != "" {
			value = strings.ReplaceAll(value, path, "<sandbox>")
		}
	}
	return value
}

func firstLine(value string) string {
	if index := strings.IndexByte(value, '\n'); index >= 0 {
		return strings.TrimSpace(value[:index])
	}
	return strings.TrimSpace(value)
}

func directorySize(root string) int64 {
	var total int64
	_ = filepath.WalkDir(root, func(_ string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if info, infoErr := entry.Info(); infoErr == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}
