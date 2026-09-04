package supervisor

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

const ownershipSchema = "ojplatform.execution-ownership.v1"

func pathWithin(root, candidate string) bool {
	rel, err := filepath.Rel(filepath.Clean(root), filepath.Clean(candidate))
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) && !filepath.IsAbs(rel)
}

const maxTestcaseInputBytes = 100 << 20

// StageTestcaseInput writes Supervisor-owned bytes with exclusive creation and
// immediately verifies the same inode and digest that execution will consume.
func StageTestcaseInput(root string, input model.TestcaseInput) (string, error) {
	if root == "" || input.TestcaseID == "" || len(input.TestcaseID) > 128 || input.TestdataVersionID == "" || strings.EqualFold(input.TestdataVersionID, "latest") || len(input.Bytes) > maxTestcaseInputBytes {
		return "", errors.New("invalid testcase input")
	}
	if !sha256HexPattern(input.SHA256) || digestBytes(input.Bytes) != input.SHA256 {
		return "", errors.New("testcase input hash mismatch")
	}
	if strings.ContainsAny(input.TestcaseID, "/\\\x00") || filepath.Clean(input.TestcaseID) != input.TestcaseID {
		return "", errors.New("testcase identity rejected")
	}
	path := filepath.Join(root, "testcase-"+input.TestcaseID+".input")
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return "", err
	}
	if _, err = file.Write(input.Bytes); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(path)
		return "", err
	}
	if err = VerifyStagedTestcaseInput(path, input); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func VerifyStagedTestcaseInput(path string, input model.TestcaseInput) error {
	clean := filepath.Clean(path)
	if path == "" || clean != path || strings.ContainsRune(path, '\x00') {
		return errors.New("testcase input path rejected")
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("testcase input is not a regular file")
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || canonical != clean {
		return errors.New("testcase input symlink rejected")
	}
	if info.Size() != int64(len(input.Bytes)) || info.Size() > maxTestcaseInputBytes {
		return errors.New("testcase input size mismatch")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return errors.New("testcase input replaced during validation")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxTestcaseInputBytes+1))
	if err != nil {
		return err
	}
	if len(data) != len(input.Bytes) || digestBytes(data) != input.SHA256 {
		return errors.New("testcase input digest mismatch")
	}
	return nil
}

// ReadVerifiedTestcaseInput keeps the final bytes tied to the inode and hash
// checked immediately before runtime.  The final lstat also rejects a
// symlink replacement that happens after the descriptor is opened.
func ReadVerifiedTestcaseInput(path string, input model.TestcaseInput) ([]byte, error) {
	if err := VerifyStagedTestcaseInput(path, input); err != nil {
		return nil, err
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("testcase input is not a regular file")
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || canonical != filepath.Clean(path) {
		return nil, errors.New("testcase input symlink rejected")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return nil, errors.New("testcase input replaced before runtime")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxTestcaseInputBytes+1))
	if err != nil || len(data) != len(input.Bytes) || digestBytes(data) != input.SHA256 {
		return nil, errors.New("testcase input digest mismatch")
	}
	final, err := os.Lstat(path)
	if err != nil || !final.Mode().IsRegular() || final.Mode()&os.ModeSymlink != 0 || !os.SameFile(info, final) {
		return nil, errors.New("testcase input replaced during runtime handoff")
	}
	canonical, err = filepath.EvalSymlinks(path)
	if err != nil || canonical != filepath.Clean(path) {
		return nil, errors.New("testcase input symlink replacement rejected")
	}
	return data, nil
}

func digestBytes(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func sha256HexPattern(value string) bool {
	if len(value) != 64 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

type ResidueClass string

const (
	ActiveOwned ResidueClass = "ACTIVE_OWNED"
	StaleOwned  ResidueClass = "STALE_OWNED"
	Foreign     ResidueClass = "FOREIGN"
	Unknown     ResidueClass = "UNKNOWN"
)

type ResidueResource struct {
	Path      string
	Class     ResidueClass
	Ownership *model.ResourceOwnership
}

// WriteOwnershipMetadata records the exact attempt and sandbox that owns a
// resource.  Startup cleanup refuses to operate without this proof.
func WriteOwnershipMetadata(resourceRoot string, ownership model.ResourceOwnership) error {
	if ownership.Schema == "" {
		ownership.Schema = ownershipSchema
	}
	if ownership.Schema != ownershipSchema || ownership.ResourceKind == "" || ownership.ExecutionAttemptID == "" || ownership.SandboxID == "" {
		return errors.New("invalid resource ownership metadata")
	}
	if ownership.CreatedAt == "" {
		ownership.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if err := os.MkdirAll(resourceRoot, 0o700); err != nil {
		return err
	}
	encoded, err := json.Marshal(ownership)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(resourceRoot, ".ownership.json"), encoded, 0o600)
}

func readOwnership(resourceRoot string) (*model.ResourceOwnership, error) {
	rootInfo, statErr := os.Lstat(resourceRoot)
	if statErr != nil || !rootInfo.IsDir() || !artifactOwnerMatches(rootInfo) || rootInfo.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("resource root ownership rejected")
	}
	data, err := os.ReadFile(filepath.Join(resourceRoot, ".ownership.json"))
	if err != nil {
		return nil, err
	}
	var ownership model.ResourceOwnership
	if err := json.Unmarshal(data, &ownership); err != nil || ownership.Schema != ownershipSchema || ownership.ExecutionAttemptID == "" || ownership.SandboxID == "" {
		return nil, errors.New("invalid resource ownership metadata")
	}
	return &ownership, nil
}

func ownedResourceName(name string) bool {
	return strings.HasPrefix(name, "c2c1-") || strings.HasPrefix(name, "c2c2-") || strings.HasPrefix(name, "exec-")
}

// AuditStartupResidue inspects only direct Supervisor-owned resource roots.
// It never removes anything and classifies metadata-less lookalikes as
// UNKNOWN, preserving foreign resources by default.
func AuditStartupResidue(root string, activeAttempts map[string]bool) ([]ResidueResource, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	resources := make([]ResidueResource, 0, len(entries))
	for _, entry := range entries {
		path := filepath.Join(root, entry.Name())
		if entry.Name() == ".ownership.json" {
			continue
		}
		ownership, ownershipErr := readOwnership(path)
		if ownershipErr == nil {
			class := StaleOwned
			if activeAttempts != nil && activeAttempts[ownership.ExecutionAttemptID] {
				class = ActiveOwned
			}
			resources = append(resources, ResidueResource{Path: path, Class: class, Ownership: ownership})
			continue
		}
		class := Foreign
		if ownedResourceName(entry.Name()) {
			class = Unknown
		}
		resources = append(resources, ResidueResource{Path: path, Class: class})
	}
	return resources, nil
}

// CleanupStaleOwned removes only entries returned as STALE_OWNED by a fresh
// audit.  The path and ownership sidecar are rechecked immediately before
// removal to prevent cross-job cleanup races.
func CleanupStaleOwned(resources []ResidueResource) error {
	for _, resource := range resources {
		if resource.Class != StaleOwned || resource.Ownership == nil {
			continue
		}
		current, err := readOwnership(resource.Path)
		if err != nil || current.ExecutionAttemptID != resource.Ownership.ExecutionAttemptID || current.SandboxID != resource.Ownership.SandboxID {
			return fmt.Errorf("stale resource ownership changed: %s", resource.Path)
		}
		if err := os.RemoveAll(resource.Path); err != nil {
			return fmt.Errorf("remove stale owned resource: %w", err)
		}
	}
	return nil
}

// CleanupStaleOwnedRuntime first deletes exact sandbox IDs discovered from
// nested ownership records, then removes the exact stale attempt root.
func CleanupStaleOwnedRuntime(runcPath string, resources []ResidueResource) error {
	for _, resource := range resources {
		if resource.Class != StaleOwned || resource.Ownership == nil {
			continue
		}
		var sandboxIDs []string
		_ = filepath.WalkDir(resource.Path, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil || entry.Name() != ".ownership.json" {
				return nil
			}
			owned, err := readOwnership(filepath.Dir(path))
			if err == nil && owned.ResourceKind == "sandbox" && owned.SandboxID != "" {
				sandboxIDs = append(sandboxIDs, owned.SandboxID)
			}
			return nil
		})
		for _, sandboxID := range sandboxIDs {
			if !strings.HasPrefix(sandboxID, "c2c2-") || strings.ContainsAny(sandboxID, "/\\\x00") {
				return fmt.Errorf("stale sandbox identity rejected")
			}
			command := exec.Command(runcPath, "--systemd-cgroup", "delete", "--force", sandboxID)
			command.Env = fixedRuntimeCommandEnvironment()
			_ = command.Run()
			if !guestGone(runcPath, sandboxID) {
				return fmt.Errorf("stale sandbox %s remains active", sandboxID)
			}
		}
	}
	return CleanupStaleOwned(resources)
}

func removeOwnedExecutionRoot(root, attemptID, sandboxID string) error {
	ownership, err := readOwnership(root)
	if err != nil || ownership.ExecutionAttemptID != attemptID || ownership.SandboxID != sandboxID {
		return errors.New("execution cleanup ownership rejected")
	}
	return os.RemoveAll(root)
}

// VerifyCompilerRootfsContent regenerates the exact manifest format produced
// by phase2c1-prepare-compiler-rootfs.sh and binds it to the frozen identity.
func VerifyCompilerRootfsContent(rootfs CompilerRootfs) error {
	manifestPath := rootfs.Path + ".content-manifest.txt"
	manifest, err := os.ReadFile(manifestPath)
	if err != nil {
		return errors.New("compiler rootfs manifest unavailable")
	}
	manifestDigest := sha256.Sum256(manifest)
	if hex.EncodeToString(manifestDigest[:]) != rootfs.Identity {
		return errors.New("compiler rootfs manifest identity mismatch")
	}
	files, links, metadata := []string{}, []string{}, []string{}
	err = filepath.Walk(rootfs.Path, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, relErr := filepath.Rel(rootfs.Path, path)
		if relErr != nil {
			return relErr
		}
		name := "."
		if rel != "." {
			name = "./" + filepath.ToSlash(rel)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			target, readErr := os.Readlink(path)
			if readErr != nil {
				return readErr
			}
			links = append(links, "LINK "+name+" "+target)
			return nil
		}
		uid, gid, ok := fileOwner(info)
		if !ok || uid != 0 || gid != 0 || info.Mode().Perm()&0o222 != 0 {
			return errors.New("compiler rootfs ownership unavailable")
		}
		kind := "f"
		if info.IsDir() {
			kind = "d"
		} else if info.Mode()&os.ModeNamedPipe != 0 {
			kind = "p"
		} else if info.Mode()&os.ModeSocket != 0 {
			kind = "s"
		} else if info.Mode()&os.ModeDevice != 0 {
			kind = "b"
		}
		metadata = append(metadata, kind+" "+name)
		if info.Mode().IsRegular() {
			file, openErr := os.Open(path)
			if openErr != nil {
				return openErr
			}
			digest := sha256.New()
			_, copyErr := io.Copy(digest, file)
			closeErr := file.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
			files = append(files, hex.EncodeToString(digest.Sum(nil))+"  "+name)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("compiler rootfs content audit: %w", err)
	}
	sort.Strings(files)
	sort.Strings(links)
	sort.Strings(metadata)
	recordedFiles, recordedLinks, recordedMetadata := []string{}, []string{}, []string{}
	for _, line := range strings.Split(strings.TrimSuffix(string(manifest), "\n"), "\n") {
		switch {
		case strings.HasPrefix(line, "LINK "):
			recordedLinks = append(recordedLinks, line)
		case strings.HasPrefix(line, "META "):
			fields := strings.SplitN(line, " ", 6)
			if len(fields) != 6 {
				return errors.New("compiler rootfs manifest metadata malformed")
			}
			recordedMetadata = append(recordedMetadata, fields[4]+" "+fields[5])
		default:
			recordedFiles = append(recordedFiles, line)
		}
	}
	sort.Strings(recordedFiles)
	sort.Strings(recordedLinks)
	sort.Strings(recordedMetadata)
	if !equalStrings(files, recordedFiles) || !equalStrings(links, recordedLinks) || !equalStrings(metadata, recordedMetadata) {
		return errors.New("compiler rootfs live content differs from trusted manifest")
	}
	return nil
}

func equalStrings(first, second []string) bool {
	if len(first) != len(second) {
		return false
	}
	for index := range first {
		if first[index] != second[index] {
			return false
		}
	}
	return true
}

func fixedRuntimeCommandEnvironment() []string {
	environment := []string{"PATH=/usr/bin:/bin", "LANG=C"}
	for _, name := range []string{"DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR"} {
		if value := os.Getenv(name); value != "" {
			environment = append(environment, name+"="+value)
		}
	}
	return environment
}

// StageSourceSnapshot materializes bytes using exclusive creation and verifies
// the hash again after the write.  It accepts bytes, never an arbitrary path.
func StageSourceSnapshot(inputDir string, source []byte, expectedHash string) (string, error) {
	if len(source) == 0 || len(source) > maxSourceBytes || !validDigest(source, expectedHash) {
		return "", errors.New("source snapshot rejected")
	}
	canonicalDir, err := filepath.Abs(inputDir)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(canonicalDir, 0o700); err != nil {
		return "", err
	}
	path := filepath.Join(canonicalDir, "main.cpp")
	if filepath.Dir(path) != canonicalDir {
		return "", errors.New("source staging path rejected")
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	_, writeErr := file.Write(source)
	if writeErr == nil {
		writeErr = file.Sync()
	}
	closeErr := file.Close()
	if writeErr != nil {
		return "", writeErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	if err := VerifyStagedSource(path, expectedHash, len(source)); err != nil {
		return "", err
	}
	return path, nil
}

func validDigest(source []byte, expected string) bool {
	digest := sha256.Sum256(source)
	return strings.EqualFold(hex.EncodeToString(digest[:]), expected) && len(expected) == 64
}

// VerifyStagedSource is intentionally callable immediately before compiler
// startup, closing the verify-then-use window for a mutable staging file.
func VerifyStagedSource(path, expectedHash string, expectedSize int) error {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || (expectedSize > 0 && info.Size() != int64(expectedSize)) {
		return errors.New("staged source file rejected")
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || canonical != filepath.Clean(path) {
		return errors.New("staged source path replaced")
	}
	file, err := os.Open(path)
	if err != nil {
		return errors.New("staged source unavailable")
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return errors.New("staged source replaced during verification")
	}
	digest := sha256.New()
	if _, err := io.Copy(digest, io.LimitReader(file, maxSourceBytes+1)); err != nil || hex.EncodeToString(digest.Sum(nil)) != strings.ToLower(expectedHash) {
		return errors.New("staged source hash mismatch")
	}
	final, err := os.Lstat(path)
	if err != nil || !os.SameFile(info, final) || final.Size() != info.Size() {
		return errors.New("staged source replaced during verification")
	}
	return nil
}

type ArtifactExpectation struct {
	Path               string
	WorkspaceRoot      string
	ExecutionAttemptID string
	CompileAttemptID   string
	SandboxID          string
	SourceSHA256       string
	ExpectedHash       string
	MaxBytes           int64
}

// ValidateArtifactHandoff performs the second hash and identity check between
// compile and runtime.  The expected path must remain inside the exact attempt
// workspace and must be a regular, non-symlink executable.
func ValidateArtifactHandoff(expect ArtifactExpectation) (model.ArtifactResult, error) {
	if expect.Path == "" || expect.WorkspaceRoot == "" || expect.ExecutionAttemptID == "" || expect.CompileAttemptID == "" || expect.SandboxID == "" {
		return model.ArtifactResult{}, errors.New("artifact ownership identity missing")
	}
	clean := filepath.Clean(expect.Path)
	if clean != expect.Path || strings.ContainsAny(expect.Path, "\x00") || !pathWithin(expect.WorkspaceRoot, expect.Path) {
		return model.ArtifactResult{}, errors.New("artifact path rejected")
	}
	artifact, err := ValidateCompiledArtifact(expect.Path, expect.ExpectedHash)
	if err != nil {
		return model.ArtifactResult{}, err
	}
	if expect.MaxBytes > 0 && artifact.SizeBytes > expect.MaxBytes {
		return model.ArtifactResult{}, errors.New("artifact size rejected")
	}
	metadata, metadataErr := readOwnership(expect.Path + ".ownership")
	if metadataErr != nil || metadata.ExecutionAttemptID != expect.ExecutionAttemptID || metadata.CompileAttemptID != expect.CompileAttemptID || metadata.SandboxID != expect.SandboxID || metadata.ResourceKind != "artifact" {
		return model.ArtifactResult{}, errors.New("artifact ownership rejected")
	}
	if expect.ExpectedHash != "" && artifact.SHA256 != expect.ExpectedHash {
		return model.ArtifactResult{}, errors.New("artifact hash mismatch")
	}
	return artifact, nil
}

func WriteArtifactOwnership(path string, ownership model.ResourceOwnership) error {
	if ownership.ResourceKind == "" {
		ownership.ResourceKind = "artifact"
	}
	return WriteOwnershipMetadata(path+".ownership", ownership)
}

func NormalizeRawExecutionFacts(run stageRun) model.RawExecutionFacts {
	memoryLimit := eventCountValue(run.Evidence, "memory", "max", "oom", "oom_kill")
	pidsLimit := eventCountValue(run.Evidence, "pids", "max")
	expectedTermination := run.Cancelled || run.TimedOut || run.WorkspaceExceeded || run.StdoutTruncated || run.StderrTruncated || memoryLimit || pidsLimit
	runtimeInfraFailed := !run.Clean || (run.Err != nil && run.ExitCode < 0 && run.Signal == "" && !expectedTermination)
	return model.RawExecutionFacts{
		ProcessExited: run.Err == nil || run.ExitCode >= 0 || run.Signal != "",
		ExitCode:      run.ExitCode, TerminationSignal: run.Signal,
		WallLimitReached: run.TimedOut, MemoryLimitEvent: memoryLimit,
		PidsLimitEvent: pidsLimit, StdoutTruncated: run.StdoutTruncated,
		StderrTruncated: run.StderrTruncated, Cancelled: run.Cancelled,
		SandboxSetupFailed: runtimeInfraFailed && run.Signal == "",
		RuntimeInfraFailed: runtimeInfraFailed, CleanupVerified: run.Clean,
	}
}

func eventCountValue(evidence *model.RuntimeEvidence, stream string, names ...string) bool {
	if evidence == nil {
		return false
	}
	value := evidence.MemoryEvents
	if stream == "pids" {
		value = evidence.PidsEvents
	}
	for _, line := range strings.Split(value, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 {
			for _, name := range names {
				if fields[0] == name && fields[1] != "0" {
					return true
				}
			}
		}
	}
	return false
}

// copyBounded is used by integrity tests and keeps accidental unbounded file
// copies out of the Supervisor handoff path.
func copyBounded(dst *os.File, src *os.File, limit int64) error {
	if _, err := io.CopyN(dst, src, limit+1); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}
