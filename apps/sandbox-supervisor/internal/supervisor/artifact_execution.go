package supervisor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

// FileInput is internal and is never decoded from an HTTP host path.
type FileInput struct {
	File      *os.File
	SizeBytes int64
	Limits    model.ExecutionLimits
}

// MarkArtifactCleanupFailure keeps the outer result and signed aggregate consistent.
func MarkArtifactCleanupFailure(result *model.RealExecutionSetResult) {
	result.Clean = false
	result.PipelineOutcome = PipelineInfraFailure
	if record := result.AggregateExecutionRecord; record != nil {
		record.CleanupVerified = false
		record.SetInfrastructureFailure = true
		record.StopReason = "INFRASTRUCTURE_FAILURE"
		record.Digest = ""
		record.Digest = canonicalRecordDigest(*record)
	}
}

func validArtifactLimits(limits model.ExecutionLimits) bool {
	return limits.WallTimeMS >= 1 && limits.WallTimeMS <= 600000 && limits.MemoryBytes >= 1 && limits.MemoryBytes <= 4<<30 && limits.OutputBytes >= 1 && limits.OutputBytes <= 64<<10 && limits.CPUMillis == runtimeLimits.CPUMillis && limits.Pids == runtimeLimits.Pids && limits.WorkspaceBytes == runtimeLimits.WorkspaceBytes
}

func (s *Supervisor) ExecuteCPP20Artifact(ctx context.Context, request model.RealExecutionSetRequest, rootfs CompilerRootfs, inputs map[int]FileInput, artifactID string) (model.RealExecutionSetResult, error) {
	if inputs == nil {
		return model.RealExecutionSetResult{}, errors.New("artifact inputs required")
	}
	return s.executeCPP20Set(ctx, request, rootfs, inputs, artifactID)
}

func ValidateArtifactExecution(request model.RealExecutionSetRequest, inputs map[int]FileInput, artifactID string) error {
	if inputs == nil {
		return errors.New("artifact inputs required")
	}
	return validateSetInputs(request, inputs, artifactID)
}

func StageFileInput(root string, input FileInput, expectedHash string) (path string, retErr error) {
	if input.File == nil || input.SizeBytes < 0 || input.SizeBytes > maxTestcaseInputBytes || !sha256HexPattern(expectedHash) {
		return "", errors.New("artifact input rejected")
	}
	if _, err := input.File.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	path = filepath.Join(root, "artifact-stdin")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	defer func() {
		if retErr != nil {
			if err := os.Remove(path); err != nil {
				retErr = errors.New("artifact input cleanup failed")
			}
		}
	}()
	digest := sha256.New()
	count, copyErr := io.CopyBuffer(io.MultiWriter(file, digest), io.LimitReader(input.File, input.SizeBytes+1), make([]byte, 64<<10))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil || count != input.SizeBytes || hex.EncodeToString(digest.Sum(nil)) != expectedHash {
		return path, errors.New("artifact input integrity failure")
	}
	if err := os.Chmod(path, 0o400); err != nil {
		return path, err
	}
	return path, nil
}
