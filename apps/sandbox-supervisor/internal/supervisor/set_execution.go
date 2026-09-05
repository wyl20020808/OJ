package supervisor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

const maxTestcaseSetSize = 64

func TestcaseSetManifestHash(manifest model.TestcaseSetManifest) string {
	parts := []string{model.ExecutionSetContractVersion, manifest.ProblemID, manifest.ProblemRevisionID, manifest.TestdataVersionID, manifest.TestcaseSetID, manifest.ExecutionProfileID, strconv.Itoa(len(manifest.Entries))}
	for _, entry := range manifest.Entries {
		parts = append(parts, strconv.Itoa(entry.Index), entry.TestcaseID, entry.TestdataVersionID, entry.InputSHA256, entry.ExecutionProfileID, entry.ExpectedOutputSHA256)
		if entry.CheckerType != "" || entry.CheckerVersion != "" || entry.CheckerConfigSHA256 != "" {
			parts = append(parts, "2C.5", entry.CheckerType, entry.CheckerVersion, entry.CheckerConfigSHA256)
		}
	}
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:])
}

func ValidateRealExecutionSetRequest(request model.RealExecutionSetRequest) error {
	return validateSetInputs(request, nil, "")
}

func validateSetInputs(request model.RealExecutionSetRequest, inputs map[int]FileInput, artifactID string) error {
	if inputs != nil && (!sha256HexPattern(artifactID) || len(inputs) != len(request.Manifest.Entries)) {
		return errors.New("invalid artifact execution binding")
	}
	if request.ProtocolVersion != model.ExecutionSetContractVersion || request.ExecutionSetRequestID == "" || request.Attempt < 1 || request.CancellationGeneration < 0 {
		return errors.New("invalid execution-set identity")
	}
	if request.ExecutionPolicy != "RUN_ALL" && request.ExecutionPolicy != "STOP_ON_EXECUTION_BLOCKING_EVENT" {
		return errors.New("invalid execution-set policy")
	}
	manifest := request.Manifest
	if manifest.ProblemID == "" || manifest.ProblemRevisionID == "" || manifest.TestdataVersionID == "" || strings.EqualFold(manifest.TestdataVersionID, "latest") || manifest.TestcaseSetID == "" || manifest.ExecutionProfileID != CPP20ProfileID || len(manifest.Entries) < 1 || len(manifest.Entries) > maxTestcaseSetSize || !sha256HexPattern(manifest.ManifestHash) {
		return errors.New("invalid testcase-set manifest")
	}
	seen := make(map[string]bool, len(manifest.Entries))
	totalInputBytes := 0
	for index, entry := range manifest.Entries {
		inputValid := len(entry.Input) <= maxTestcaseInputBytes && digestBytes(entry.Input) == entry.InputSHA256
		if inputs != nil {
			input, ok := inputs[index]
			if !ok || input.File == nil || input.SizeBytes < 0 || input.SizeBytes > maxTestcaseInputBytes || !validArtifactLimits(input.Limits) || len(entry.Input) != 0 {
				return errors.New("invalid artifact input descriptor")
			}
			totalInputBytes += int(input.SizeBytes)
			inputValid = true
		} else {
			totalInputBytes += len(entry.Input)
		}
		verdictBinding := entry.CheckerType != "" || entry.CheckerVersion != "" || entry.CheckerConfigSHA256 != ""
		if totalInputBytes > 256<<20 || entry.Index != index || entry.TestcaseID == "" || entry.TestcaseID == "." || entry.TestcaseID == ".." || len(entry.TestcaseID) > 128 || strings.ContainsAny(entry.TestcaseID, "/\\\x00") || seen[entry.TestcaseID] || entry.TestdataVersionID != manifest.TestdataVersionID || entry.ExecutionProfileID != manifest.ExecutionProfileID || !inputValid || !sha256HexPattern(entry.InputSHA256) || entry.ExpectedOutputSHA256 != "" && !sha256HexPattern(entry.ExpectedOutputSHA256) || verdictBinding && (!sha256HexPattern(entry.ExpectedOutputSHA256) || (entry.CheckerType != "EXACT_BYTES" && entry.CheckerType != "TOKEN_WHITESPACE") || entry.CheckerVersion != "builtin-v1" || entry.CheckerConfigSHA256 != digestBytes([]byte(entry.CheckerType+"\x00"+entry.CheckerVersion))) {
			return errors.New("invalid testcase-set manifest entry")
		}
		seen[entry.TestcaseID] = true
	}
	if TestcaseSetManifestHash(manifest) != manifest.ManifestHash {
		return errors.New("testcase-set manifest hash mismatch")
	}
	first := manifest.Entries[0]
	return validateRealExecutionRequest(model.RealExecutionRequest{
		ProtocolVersion: model.ExecutionContractVersion, ExecutionRequestID: request.ExecutionSetRequestID + ":testcase:0",
		JudgeJobID: request.JudgeJobID, SubmissionID: request.SubmissionID, Attempt: request.Attempt,
		CorrelationID: request.CorrelationID, ProblemID: manifest.ProblemID, ProblemRevisionID: manifest.ProblemRevisionID,
		TestdataVersionRef: manifest.TestdataVersionID, TestcaseID: first.TestcaseID, TestcaseInput: first.Input,
		TestcaseInputSHA256: first.InputSHA256, ExecutionProfileID: manifest.ExecutionProfileID,
		LanguageProfileID: request.LanguageProfileID, SourceSnapshotRef: request.SourceSnapshotRef,
		SourceBytes: request.SourceBytes, SourceSHA256: request.SourceSHA256,
		ControlledInputID: "stdin-empty-v1", DeadlineAt: request.DeadlineAt,
		CancellationGeneration: request.CancellationGeneration,
	}, inputs == nil)
}

func setTestcaseRequest(request model.RealExecutionSetRequest, entry model.TestcaseSetEntry) model.RealExecutionRequest {
	setAttemptID := request.ExecutionSetRequestID + ":attempt"
	return model.RealExecutionRequest{
		ProtocolVersion:    model.ExecutionContractVersion,
		ExecutionRequestID: request.ExecutionSetRequestID + ":testcase:" + strconv.Itoa(entry.Index),
		JudgeJobID:         request.JudgeJobID, SubmissionID: request.SubmissionID, Attempt: request.Attempt,
		CorrelationID: request.CorrelationID + ":" + strconv.Itoa(entry.Index),
		ProblemID:     request.Manifest.ProblemID, ProblemRevisionID: request.Manifest.ProblemRevisionID,
		TestdataVersionRef: request.Manifest.TestdataVersionID, TestcaseID: entry.TestcaseID,
		TestcaseInput: append([]byte(nil), entry.Input...), TestcaseInputSHA256: entry.InputSHA256,
		ExecutionProfileID: entry.ExecutionProfileID, LanguageProfileID: request.LanguageProfileID,
		SourceSnapshotRef: request.SourceSnapshotRef, SourceBytes: request.SourceBytes,
		SourceSHA256: request.SourceSHA256, ControlledInputID: "stdin-empty-v1",
		DeadlineAt: request.DeadlineAt, CancellationGeneration: request.CancellationGeneration,
		ExecutionSetAttemptID: setAttemptID, TestcaseIndex: entry.Index,
		TestcaseSetManifestHash: request.Manifest.ManifestHash,
	}
}

func (s *Supervisor) ExecuteCPP20Set(ctx context.Context, request model.RealExecutionSetRequest, rootfs CompilerRootfs) (result model.RealExecutionSetResult, runErr error) {
	return s.executeCPP20Set(ctx, request, rootfs, nil, "")
}

func (s *Supervisor) executeCPP20Set(ctx context.Context, request model.RealExecutionSetRequest, rootfs CompilerRootfs, inputs map[int]FileInput, artifactID string) (result model.RealExecutionSetResult, runErr error) {
	started := time.Now().UTC()
	setAttemptID := request.ExecutionSetRequestID + ":attempt"
	compileAttemptID := request.ExecutionSetRequestID + ":compile"
	compileSandboxID := sandboxIDFor(compileAttemptID, "compile")
	result = model.RealExecutionSetResult{
		ProtocolVersion: model.ExecutionSetContractVersion, ExecutionSetRequestID: request.ExecutionSetRequestID,
		ExecutionSetAttemptID: setAttemptID, JudgeJobID: request.JudgeJobID, SubmissionID: request.SubmissionID,
		Attempt: request.Attempt, ResultGeneration: int64(request.Attempt), CorrelationID: request.CorrelationID,
		LanguageProfileID: request.LanguageProfileID, SourceSHA256: request.SourceSHA256,
		ProblemID: request.Manifest.ProblemID, ProblemRevisionID: request.Manifest.ProblemRevisionID,
		TestdataVersionID: request.Manifest.TestdataVersionID, TestcaseSetID: request.Manifest.TestcaseSetID,
		TestcaseSetManifestHash: request.Manifest.ManifestHash, ExecutionProfileID: request.Manifest.ExecutionProfileID,
		ExecutionSetPolicy: request.ExecutionPolicy, StartedAt: started,
	}
	if inputs != nil {
		result.ProtocolVersion = ArtifactExecutionContract
		result.JudgeArtifactID = artifactID
	}
	members := make([]model.TestcaseSetMemberResult, 0, len(request.Manifest.Entries))
	stopReason := "COMPLETED"
	if err := validateSetInputs(request, inputs, artifactID); err != nil {
		result.Compile = model.StageResult{Outcome: CompileInfraFailure, DiagnosticCode: "REQUEST_REJECTED", Clean: true, Facts: model.RawExecutionFacts{SandboxSetupFailed: true, CleanupVerified: true}}
		result.PipelineOutcome = PipelineInfraFailure
		result.Clean = true
		return result, err
	}
	if err := s.PreflightRealExecution(ctx, rootfs); err != nil {
		result.Compile = model.StageResult{Outcome: CompileInfraFailure, DiagnosticCode: "PREFLIGHT_FAILED", Clean: true, Facts: model.RawExecutionFacts{SandboxSetupFailed: true, RuntimeInfraFailed: true, CleanupVerified: true}}
		result.PipelineOutcome = PipelineInfraFailure
		result.Clean = true
		return result, err
	}

	jobRoot, err := os.MkdirTemp(s.Root, "c2c4-")
	if err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		return result, err
	}
	setSandboxID := request.ExecutionSetRequestID + ":sandbox"
	if err := WriteOwnershipMetadata(jobRoot, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "execution-set-attempt", SubmissionID: request.SubmissionID, JudgeJobID: request.JudgeJobID, ExecutionRequestID: request.ExecutionSetRequestID, ExecutionAttemptID: setAttemptID, SandboxID: setSandboxID}); err != nil {
		_ = os.RemoveAll(jobRoot)
		return result, err
	}
	defer func() {
		result.CompletedAt = time.Now().UTC()
		clean := removeOwnedExecutionRoot(jobRoot, setAttemptID, setSandboxID) == nil && !pathExists(jobRoot)
		result.Clean = result.Compile.Clean && clean
		for _, member := range members {
			if member.Record != nil && !member.Record.CleanupVerified {
				result.Clean = false
			}
		}
		if !result.Clean {
			result.PipelineOutcome = PipelineInfraFailure
			stopReason = "INFRASTRUCTURE_FAILURE"
			runErr = errors.New("execution-set cleanup failed")
		}
		result.AggregateExecutionRecord = BuildAggregateExecutionSetRecord(request, result, members, stopReason)
	}()

	if err := os.Chmod(s.Root, 0o711); err != nil {
		return result, err
	}
	workspace := filepath.Join(jobRoot, "workspace")
	inputDir, buildDir := filepath.Join(workspace, "input"), filepath.Join(workspace, "build")
	if err := os.MkdirAll(inputDir, 0o700); err != nil {
		return result, err
	}
	if err := os.MkdirAll(buildDir, 0o700); err != nil {
		return result, err
	}
	sourcePath, err := StageSourceSnapshot(inputDir, []byte(request.SourceBytes), request.SourceSHA256)
	if err != nil {
		return result, err
	}
	if err := WriteOwnershipMetadata(inputDir, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "source-staging", SubmissionID: request.SubmissionID, JudgeJobID: request.JudgeJobID, ExecutionRequestID: request.ExecutionSetRequestID, ExecutionAttemptID: setAttemptID, SandboxID: compileSandboxID}); err != nil {
		return result, err
	}
	if err := VerifyStagedSource(sourcePath, request.SourceSHA256, len(request.SourceBytes)); err != nil {
		return result, err
	}

	compileBundle := filepath.Join(jobRoot, "compile")
	compileMounts := stageMounts(16 << 20)
	compileMounts[len(compileMounts)-1] = bundleMount{Destination: "/workspace", Type: "bind", Source: workspace, Options: []string{"rbind", "rw", "nosuid", "nodev", "noexec"}}
	compileRun := s.runExecutionStageWithID(ctx, compileBundle, rootfs.Path, true, compilerArgv, "/workspace", []string{"PATH=/usr/bin:/bin", "LANG=C", "LC_ALL=C"}, compileMounts, compileLimits, nil, workspace, compileSandboxID)
	result.Compile = classifyCompile(compileRun, rootfs.Path, workspace)
	if result.Compile.Outcome != CompileSucceeded {
		result.PipelineOutcome = pipelineForCompile(result.Compile.Outcome)
		switch result.PipelineOutcome {
		case PipelineCancelled:
			stopReason = "CANCELLED"
		case PipelineInfraFailure:
			stopReason = "INFRASTRUCTURE_FAILURE"
		default:
			stopReason = "RAW_EXECUTION_BLOCKING_EVENT"
		}
		return result, compileRun.Err
	}

	artifactPath := filepath.Join(buildDir, "main")
	artifact, err := ValidateCompiledArtifact(artifactPath, "")
	if err != nil {
		result.PipelineOutcome = PipelineInfraFailure
		stopReason = "INFRASTRUCTURE_FAILURE"
		return result, err
	}
	artifact.LanguageProfileID, artifact.CompilerVersion, artifact.CompilerRootfsID = CPP20ProfileID, firstLine(rootfs.CompilerVersion), rootfs.Identity
	artifact.CommandTemplateSHA, artifact.SourceSHA256 = CompilerCommandTemplateSHA256(), request.SourceSHA256
	artifact.ArtifactID, artifact.CompileAttemptID, artifact.SandboxID = compileAttemptID+":artifact", compileAttemptID, compileSandboxID
	if err := WriteArtifactOwnership(artifactPath, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "artifact", SubmissionID: request.SubmissionID, JudgeJobID: request.JudgeJobID, ExecutionRequestID: request.ExecutionSetRequestID, ExecutionAttemptID: setAttemptID, CompileAttemptID: compileAttemptID, SandboxID: compileSandboxID}); err != nil {
		return result, err
	}
	if _, err := ValidateArtifactHandoff(ArtifactExpectation{Path: artifactPath, WorkspaceRoot: buildDir, ExecutionAttemptID: setAttemptID, CompileAttemptID: compileAttemptID, SandboxID: compileSandboxID, SourceSHA256: request.SourceSHA256, ExpectedHash: artifact.SHA256, MaxBytes: maxArtifactBytes}); err != nil {
		return result, err
	}
	result.Artifact = &artifact

	for _, entry := range request.Manifest.Entries {
		if ctx.Err() != nil {
			stopReason, result.PipelineOutcome = "CANCELLED", PipelineCancelled
			break
		}
		testcaseRequest := setTestcaseRequest(request, entry)
		perAttemptID := setAttemptID + ":testcase:" + strconv.Itoa(entry.Index)
		runtimeAttemptID := testcaseRequest.ExecutionRequestID + ":runtime"
		runtimeSandboxID := sandboxIDFor(runtimeAttemptID, "runtime")
		testcaseRoot := filepath.Join(jobRoot, fmt.Sprintf("testcase-%03d", entry.Index))
		if err := os.Mkdir(testcaseRoot, 0o700); err != nil {
			members = append(members, failedSetMember(entry, "INFRA_FAILED"))
			stopReason, result.PipelineOutcome = "INFRASTRUCTURE_FAILURE", PipelineInfraFailure
			break
		}
		if err := WriteOwnershipMetadata(testcaseRoot, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "testcase-runtime", SubmissionID: request.SubmissionID, JudgeJobID: request.JudgeJobID, ExecutionRequestID: testcaseRequest.ExecutionRequestID, ExecutionAttemptID: perAttemptID, SandboxID: runtimeSandboxID}); err != nil {
			return result, err
		}
		testcase := testcaseForRequest(testcaseRequest)
		var inputPath string
		var stageErr error
		if inputs != nil {
			inputPath, stageErr = StageFileInput(testcaseRoot, inputs[entry.Index], entry.InputSHA256)
		} else {
			inputPath, stageErr = StageTestcaseInput(testcaseRoot, testcase)
		}
		if stageErr != nil {
			members = append(members, failedSetMember(entry, "INFRA_FAILED"))
			stopReason, result.PipelineOutcome = "INFRASTRUCTURE_FAILURE", PipelineInfraFailure
			break
		}
		runtimeBundle := filepath.Join(testcaseRoot, "runtime")
		if err := os.Mkdir(runtimeBundle, 0o700); err != nil {
			return result, err
		}
		runtimeRootfs := filepath.Join(runtimeBundle, "rootfs")
		for _, directory := range []string{"dev", "proc", "tmp", "workspace"} {
			if err := os.MkdirAll(filepath.Join(runtimeRootfs, directory), 0o755); err != nil {
				return result, err
			}
		}
		if _, err := ValidateArtifactHandoff(ArtifactExpectation{Path: artifactPath, WorkspaceRoot: buildDir, ExecutionAttemptID: setAttemptID, CompileAttemptID: compileAttemptID, SandboxID: compileSandboxID, SourceSHA256: request.SourceSHA256, ExpectedHash: artifact.SHA256, MaxBytes: maxArtifactBytes}); err != nil {
			members = append(members, failedSetMember(entry, "INFRA_FAILED"))
			stopReason, result.PipelineOutcome = "INFRASTRUCTURE_FAILURE", PipelineInfraFailure
			break
		}
		programPath := filepath.Join(runtimeRootfs, "program")
		if err := copyFile(artifactPath, programPath, 0o555); err != nil {
			return result, err
		}
		if _, err := ValidateCompiledArtifact(programPath, artifact.SHA256); err != nil {
			return result, err
		}
		var runtimeRun stageRun
		if inputs != nil {
			input := inputs[entry.Index]
			stdin, err := OpenVerifiedInput(inputPath, input.SizeBytes, entry.InputSHA256)
			if err != nil {
				return result, err
			}
			runtimeRun = s.runExecutionStageReader(ctx, runtimeBundle, "rootfs", true, []string{"/program"}, "/workspace", []string{"PATH=/", "LANG=C", "LC_ALL=C"}, stageMounts(1<<20), input.Limits, io.LimitReader(stdin, input.SizeBytes), "", runtimeSandboxID)
			if err := stdin.Close(); err != nil {
				return result, err
			}
		} else {
			stdin, err := ReadVerifiedTestcaseInput(inputPath, testcase)
			if err != nil {
				return result, err
			}
			runtimeRun = s.runExecutionStageWithID(ctx, runtimeBundle, "rootfs", true, []string{"/program"}, "/workspace", []string{"PATH=/", "LANG=C", "LC_ALL=C"}, stageMounts(1<<20), runtimeLimits, stdin, "", runtimeSandboxID)
		}
		runtimeResult := classifyRuntime(runtimeRun)
		perClean := removeOwnedExecutionRoot(testcaseRoot, perAttemptID, runtimeSandboxID) == nil && !pathExists(testcaseRoot) && runtimeResult.Clean
		runtimeResult.Clean, runtimeResult.Facts.CleanupVerified = perClean, perClean
		singleResult := model.RealExecutionResult{
			ProtocolVersion: model.ExecutionContractVersion, ExecutionRequestID: testcaseRequest.ExecutionRequestID,
			JudgeJobID: request.JudgeJobID, SubmissionID: request.SubmissionID, Attempt: request.Attempt,
			ExecutionAttemptID: perAttemptID, CompileAttemptID: compileAttemptID, RuntimeAttemptID: runtimeAttemptID,
			CompileSandboxID: compileSandboxID, RuntimeSandboxID: runtimeSandboxID, ResultGeneration: int64(request.Attempt),
			CorrelationID: testcaseRequest.CorrelationID, LanguageProfileID: request.LanguageProfileID,
			SourceSHA256: request.SourceSHA256, ProblemID: request.Manifest.ProblemID,
			ProblemRevisionID: request.Manifest.ProblemRevisionID, TestdataVersionID: request.Manifest.TestdataVersionID,
			TestcaseID: entry.TestcaseID, TestcaseInputSHA256: entry.InputSHA256, ExecutionProfileID: entry.ExecutionProfileID,
			PipelineOutcome: pipelineForRuntime(runtimeResult.Outcome), Compile: result.Compile, Artifact: &artifact,
			Runtime: &runtimeResult, StartedAt: started, CompletedAt: time.Now().UTC(), Clean: perClean,
		}
		record := BuildSingleTestcaseExecutionRecord(testcaseRequest, singleResult)
		if inputs != nil {
			record.RecordVersion = ArtifactExecutionContract
			record.Stdin.ByteCount = int(inputs[entry.Index].SizeBytes)
			record.Profile.Limits = inputs[entry.Index].Limits
			record.Digest = ""
			record.Digest = canonicalRecordDigest(record)
		}
		status := "RAW_COMPLETED"
		if runtimeResult.Outcome == ExecutionCancelled {
			status, stopReason, result.PipelineOutcome = "CANCELLED", "CANCELLED", PipelineCancelled
		} else if runtimeResult.Outcome == ExecutionInfraFailure || !perClean {
			status, stopReason, result.PipelineOutcome = "INFRA_FAILED", "INFRASTRUCTURE_FAILURE", PipelineInfraFailure
		} else {
			result.PipelineOutcome = PipelineCompleted
		}
		members = append(members, model.TestcaseSetMemberResult{Index: entry.Index, TestcaseID: entry.TestcaseID, InputSHA256: entry.InputSHA256, TestdataVersionID: entry.TestdataVersionID, ExecutionProfileID: entry.ExecutionProfileID, Status: status, Record: &record, ActualStdout: append([]byte{}, runtimeRun.StdoutBytes...), ActualStdoutSHA256: runtimeResult.StdoutSHA256, ActualStdoutBytes: runtimeResult.StdoutBytes, ActualStdoutTruncated: runtimeResult.StdoutTruncated})
		blocking := runtimeResult.Facts.WallLimitReached || runtimeResult.Facts.MemoryLimitEvent || runtimeResult.Facts.PidsLimitEvent || runtimeResult.Facts.StdoutTruncated || runtimeResult.Facts.StderrTruncated
		if status != "RAW_COMPLETED" || request.ExecutionPolicy == "STOP_ON_EXECUTION_BLOCKING_EVENT" && blocking {
			if status == "RAW_COMPLETED" {
				stopReason = "RAW_EXECUTION_BLOCKING_EVENT"
			}
			break
		}
	}
	return result, nil
}

func failedSetMember(entry model.TestcaseSetEntry, status string) model.TestcaseSetMemberResult {
	return model.TestcaseSetMemberResult{Index: entry.Index, TestcaseID: entry.TestcaseID, InputSHA256: entry.InputSHA256, TestdataVersionID: entry.TestdataVersionID, ExecutionProfileID: entry.ExecutionProfileID, Status: status}
}

func BuildAggregateExecutionSetRecord(request model.RealExecutionSetRequest, result model.RealExecutionSetResult, members []model.TestcaseSetMemberResult, stopReason string) *model.AggregateExecutionSetRecord {
	byIndex := make(map[int]model.TestcaseSetMemberResult, len(members))
	for _, member := range members {
		// The executor is sequential, but rebuilding from the frozen manifest
		// keeps recovery/publication deterministic even if a caller supplies an
		// out-of-order slice.
		if _, exists := byIndex[member.Index]; !exists {
			byIndex[member.Index] = member
		}
	}
	ordered := make([]model.TestcaseSetMemberResult, 0, len(request.Manifest.Entries))
	for _, entry := range request.Manifest.Entries {
		if member, exists := byIndex[entry.Index]; exists {
			ordered = append(ordered, member)
			continue
		}
		status := "SKIPPED_BY_SET_POLICY"
		if stopReason == "CANCELLED" {
			status = "CANCELLED_BEFORE_START"
		}
		ordered = append(ordered, failedSetMember(entry, status))
	}
	started, completed, cleanup := 0, 0, result.Clean
	for _, member := range ordered {
		if member.Status != "CANCELLED_BEFORE_START" && member.Status != "SKIPPED_BY_SET_POLICY" {
			started++
		}
		if member.Status == "RAW_COMPLETED" {
			completed++
		}
		if member.Record != nil && !member.Record.CleanupVerified {
			cleanup = false
		}
	}
	record := model.AggregateExecutionSetRecord{
		RecordVersion: model.ExecutionSetContractVersion, RecordID: request.ExecutionSetRequestID + ":record",
		SubmissionID: request.SubmissionID, SnapshotID: request.SourceSnapshotRef, SourceSHA256: request.SourceSHA256,
		ProblemID: request.Manifest.ProblemID, ProblemRevisionID: request.Manifest.ProblemRevisionID,
		TestdataVersionID: request.Manifest.TestdataVersionID, TestcaseSetID: request.Manifest.TestcaseSetID,
		ManifestHash: request.Manifest.ManifestHash, ExecutionSetRequestID: request.ExecutionSetRequestID,
		ExecutionSetAttemptID: request.ExecutionSetRequestID + ":attempt", ExecutionProfileID: request.Manifest.ExecutionProfileID,
		ExecutionPolicy: request.ExecutionPolicy, TotalTestcaseCount: len(request.Manifest.Entries), StartedTestcaseCount: started,
		CompletedTestcaseCount: completed, Testcases: ordered, SetCancelled: stopReason == "CANCELLED",
		SetInfrastructureFailure: stopReason == "INFRASTRUCTURE_FAILURE", StopReason: stopReason, CleanupVerified: cleanup,
	}
	if result.Artifact != nil {
		record.ArtifactSHA256 = result.Artifact.SHA256
	}
	withoutDigest := record
	withoutDigest.Digest = ""
	record.Digest = canonicalRecordDigest(withoutDigest)
	return &record
}
