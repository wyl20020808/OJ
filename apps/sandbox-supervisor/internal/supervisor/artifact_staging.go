package supervisor

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

const ArtifactExecutionContract = "artifact-execution-v1"
const maxArtifactStagingBytes int64 = 512 << 20
const artifactStagingTTL = 10 * time.Minute

type StagedInput struct {
	Handle                              string `json:"handle"`
	SizeBytes                           int64  `json:"size_bytes"`
	SHA256                              string `json:"sha256"`
	artifactID, executionID, root, path string
	created                             time.Time
	acquired                            bool
}

// ArtifactStaging owns all paths; its public boundary accepts opaque handles.
// Uploads reserve capacity before consuming data, including concurrent uploads.
type ArtifactStaging struct {
	mu        sync.Mutex
	root      string
	entries   map[string]StagedInput
	reserved  int64
	uploading int
}

func NewArtifactStaging(root string) (*ArtifactStaging, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	info, err := os.Lstat(root)
	canonical, canonicalErr := filepath.EvalSymlinks(root)
	if err != nil || canonicalErr != nil || canonical != root || !info.IsDir() || info.Mode().Perm()&0o077 != 0 || !artifactOwnerMatches(info) {
		return nil, errors.New("artifact staging root rejected")
	}
	residue, err := AuditStartupResidue(root, nil)
	if err != nil {
		return nil, err
	}
	for _, item := range residue {
		if item.Class != StaleOwned || item.Ownership == nil || item.Ownership.ResourceKind != "artifact-input" {
			return nil, errors.New("unrecognized artifact staging residue")
		}
	}
	if err := CleanupStaleOwned(residue); err != nil {
		return nil, err
	}
	return &ArtifactStaging{root: root, entries: make(map[string]StagedInput)}, nil
}

func validStagingIdentity(value string) bool {
	return value != "" && len(value) <= 256 && !strings.ContainsAny(value, "\r\n\x00")
}

func (s *ArtifactStaging) Stage(ctx context.Context, source io.Reader, size int64, hash, artifactID, executionID string) (result StagedInput, retErr error) {
	if size < 0 || size > maxTestcaseInputBytes || !sha256HexPattern(hash) || !sha256HexPattern(artifactID) || !validStagingIdentity(executionID) {
		return result, errors.New("invalid artifact input")
	}
	s.mu.Lock()
	if err := s.pruneLocked(time.Now()); err != nil {
		s.mu.Unlock()
		return result, err
	}
	if s.reserved+size > maxArtifactStagingBytes || len(s.entries)+s.uploading >= 128 {
		s.mu.Unlock()
		return result, errors.New("artifact staging capacity unavailable")
	}
	s.reserved += size
	s.uploading++
	s.mu.Unlock()
	var root string
	defer func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.uploading--
		if retErr != nil {
			if root != "" {
				if err := os.RemoveAll(root); err != nil {
					retErr = errors.New("artifact staging cleanup failed")
					return
				}
			}
			s.reserved -= size
		}
	}()
	root, retErr = os.MkdirTemp(s.root, "artifact-input-")
	if retErr != nil {
		return result, retErr
	}
	var random [32]byte
	if _, retErr = rand.Read(random[:]); retErr != nil {
		return result, retErr
	}
	handle := hex.EncodeToString(random[:])
	if retErr = WriteOwnershipMetadata(root, model.ResourceOwnership{Schema: ownershipSchema, ResourceKind: "artifact-input", ExecutionAttemptID: executionID, SandboxID: handle}); retErr != nil {
		return result, retErr
	}
	file, err := os.OpenFile(filepath.Join(root, "stdin"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return result, err
	}
	digest := sha256.New()
	count, copyErr := io.CopyBuffer(io.MultiWriter(file, digest), io.LimitReader(&contextReader{ctx, source}, size+1), make([]byte, 64<<10))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil || ctx.Err() != nil || count != size || hex.EncodeToString(digest.Sum(nil)) != hash {
		return result, errors.New("artifact input integrity failure")
	}
	if err := os.Chmod(file.Name(), 0o400); err != nil {
		return result, err
	}
	result = StagedInput{Handle: handle, SizeBytes: size, SHA256: hash, artifactID: artifactID, executionID: executionID, root: root, path: file.Name(), created: time.Now()}
	s.mu.Lock()
	s.entries[handle] = result
	s.mu.Unlock()
	return result, nil
}

type contextReader struct {
	ctx    context.Context
	source io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.source.Read(p)
}

// OpenVerifiedInput returns the exact verified descriptor, rewound for execution.
// Replacing the pathname after this call cannot redirect the descriptor.
func OpenVerifiedInput(path string, size int64, expectedHash string) (*os.File, error) {
	if size < 0 || size > maxTestcaseInputBytes || !sha256HexPattern(expectedHash) {
		return nil, errors.New("invalid artifact input")
	}
	info, err := os.Lstat(path)
	canonical, canonicalErr := filepath.EvalSymlinks(path)
	if err != nil || canonicalErr != nil || canonical != filepath.Clean(path) || !info.Mode().IsRegular() || info.Mode().Perm()&0o222 != 0 || !artifactOwnerMatches(info) || info.Size() != size {
		return nil, errors.New("artifact input file rejected")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	opened, err := file.Stat()
	if err != nil || !os.SameFile(info, opened) {
		file.Close()
		return nil, errors.New("artifact input replaced")
	}
	digest := sha256.New()
	count, err := io.Copy(digest, io.LimitReader(file, size+1))
	final, finalErr := os.Lstat(path)
	if err != nil || count != size || hex.EncodeToString(digest.Sum(nil)) != expectedHash || finalErr != nil || !os.SameFile(info, final) {
		file.Close()
		return nil, errors.New("artifact input integrity failure")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		file.Close()
		return nil, err
	}
	return file, nil
}

// Acquire serializes handle ownership with expiry/release and verifies the file.
// The caller must close the descriptor before Release.
func (s *ArtifactStaging) Acquire(handle, artifactID, executionID string, size int64, hash string) (*os.File, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[handle]
	if !ok || entry.acquired || entry.artifactID != artifactID || entry.executionID != executionID || entry.SizeBytes != size || entry.SHA256 != hash || time.Since(entry.created) >= artifactStagingTTL {
		return nil, errors.New("artifact input handle rejected")
	}
	file, err := OpenVerifiedInput(entry.path, size, hash)
	if err != nil {
		return nil, err
	}
	entry.acquired = true
	s.entries[handle] = entry
	return file, nil
}

func (s *ArtifactStaging) Release(handle, artifactID, executionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[handle]
	if !ok {
		return nil
	}
	if entry.artifactID != artifactID || entry.executionID != executionID {
		return errors.New("artifact input ownership mismatch")
	}
	if err := removeOwnedExecutionRoot(entry.root, executionID, handle); err != nil {
		return err
	}
	delete(s.entries, handle)
	s.reserved -= entry.SizeBytes
	return nil
}

func (s *ArtifactStaging) ReleaseExecution(artifactID, executionID string) error {
	return s.releaseExecution(artifactID, executionID, false)
}

func (s *ArtifactStaging) ReleaseUnusedExecution(artifactID, executionID string) error {
	return s.releaseExecution(artifactID, executionID, true)
}

func (s *ArtifactStaging) releaseExecution(artifactID, executionID string, unusedOnly bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for handle, entry := range s.entries {
		if entry.artifactID != artifactID || entry.executionID != executionID || unusedOnly && entry.acquired {
			continue
		}
		if err := removeOwnedExecutionRoot(entry.root, executionID, handle); err != nil {
			return err
		}
		delete(s.entries, handle)
		s.reserved -= entry.SizeBytes
	}
	return nil
}

func (s *ArtifactStaging) Prune() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pruneLocked(time.Now())
}

func (s *ArtifactStaging) pruneLocked(now time.Time) error {
	for handle, entry := range s.entries {
		if entry.acquired || now.Sub(entry.created) < artifactStagingTTL {
			continue
		}
		if err := removeOwnedExecutionRoot(entry.root, entry.executionID, handle); err != nil {
			return err
		}
		delete(s.entries, handle)
		s.reserved -= entry.SizeBytes
	}
	return nil
}
