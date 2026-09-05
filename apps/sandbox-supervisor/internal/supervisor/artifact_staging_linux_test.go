package supervisor

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newStagingForTest(t *testing.T) *ArtifactStaging {
	t.Helper()
	s, err := NewArtifactStaging(filepath.Join(t.TempDir(), "staging"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestArtifactStagingBoundIdentityAndCleanup(t *testing.T) {
	s := newStagingForTest(t)
	id, hash := digestBytes([]byte("artifact")), digestBytes([]byte("input"))
	entry, err := s.Stage(context.Background(), strings.NewReader("input"), 5, hash, id, "execution-1")
	if err != nil {
		t.Fatal(err)
	}
	for _, binding := range [][3]string{{"../stdin", id, "execution-1"}, {entry.Handle, digestBytes(nil), "execution-1"}, {entry.Handle, id, "execution-2"}} {
		if file, err := s.Acquire(binding[0], binding[1], binding[2], 5, hash); err == nil {
			file.Close()
			t.Fatal("foreign binding accepted")
		}
	}
	file, err := s.Acquire(entry.Handle, id, "execution-1", 5, hash)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(file)
	if err != nil || string(data) != "input" {
		t.Fatal("wrong input")
	}
	if duplicate, err := s.Acquire(entry.Handle, id, "execution-1", 5, hash); err == nil {
		duplicate.Close()
		t.Fatal("handle acquired twice")
	}
	file.Close()
	if err := s.Release(entry.Handle, id, "execution-1"); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(s.root)
	if err != nil || len(entries) != 0 || s.reserved != 0 {
		t.Fatal("staging residue")
	}
}

func TestArtifactStagingRejectsBrokenUploads(t *testing.T) {
	for _, data := range []string{"", "abcd", "abcdef", "xxxxx"} {
		t.Run(data, func(t *testing.T) {
			s := newStagingForTest(t)
			_, err := s.Stage(context.Background(), strings.NewReader(data), 5, digestBytes([]byte("input")), digestBytes(nil), "execution")
			if err == nil {
				t.Fatal("invalid upload accepted")
			}
			entries, _ := os.ReadDir(s.root)
			if len(entries) != 0 || s.reserved != 0 || s.uploading != 0 {
				t.Fatal("failed upload residue")
			}
		})
	}
}

func TestArtifactStagingRejectsCancelledAndOversized(t *testing.T) {
	s := newStagingForTest(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.Stage(ctx, strings.NewReader("input"), 5, digestBytes([]byte("input")), digestBytes(nil), "execution"); err == nil {
		t.Fatal("cancelled upload accepted")
	}
	if _, err := s.Stage(context.Background(), strings.NewReader(""), maxTestcaseInputBytes+1, digestBytes(nil), digestBytes(nil), "execution"); err == nil {
		t.Fatal("oversized upload accepted")
	}
	if s.reserved != 0 {
		t.Fatal("capacity leak")
	}
}

func TestArtifactStagingExpiryAndCapacity(t *testing.T) {
	s := newStagingForTest(t)
	id := digestBytes(nil)
	entry, err := s.Stage(context.Background(), strings.NewReader(""), 0, id, id, "execution")
	if err != nil {
		t.Fatal(err)
	}
	entry.created = time.Now().Add(-artifactStagingTTL)
	s.entries[entry.Handle] = entry
	if err := s.pruneLocked(time.Now()); err != nil {
		t.Fatal(err)
	}
	if len(s.entries) != 0 {
		t.Fatal("expired handle retained")
	}
	s.reserved = maxArtifactStagingBytes
	if _, err := s.Stage(context.Background(), strings.NewReader("a"), 1, digestBytes([]byte("a")), id, "execution"); err == nil {
		t.Fatal("capacity exceeded")
	}
}

func TestArtifactStagingRejectsReplacement(t *testing.T) {
	s := newStagingForTest(t)
	id, hash := digestBytes(nil), digestBytes([]byte("input"))
	entry, err := s.Stage(context.Background(), strings.NewReader("input"), 5, hash, id, "execution")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(entry.path, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(entry.path, []byte("other"), 0o400); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(entry.path, 0o400); err != nil {
		t.Fatal(err)
	}
	if file, err := s.Acquire(entry.Handle, id, "execution", 5, hash); err == nil {
		file.Close()
		t.Fatal("tampered input accepted")
	}
	if err := s.Release(entry.Handle, id, "execution"); err != nil {
		t.Fatal(err)
	}
}

func TestArtifactStagingSymlinkAndDescriptorHandoff(t *testing.T) {
	s := newStagingForTest(t)
	id, hash := digestBytes(nil), digestBytes([]byte("input"))
	entry, err := s.Stage(context.Background(), strings.NewReader("input"), 5, hash, id, "execution")
	if err != nil {
		t.Fatal(err)
	}
	original := entry.path + ".original"
	if err := os.Rename(entry.path, original); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(original, entry.path); err != nil {
		t.Fatal(err)
	}
	if file, err := s.Acquire(entry.Handle, id, "execution", 5, hash); err == nil {
		file.Close()
		t.Fatal("symlink accepted")
	}
	if err := os.Remove(entry.path); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(original, entry.path); err != nil {
		t.Fatal(err)
	}
	file, err := s.Acquire(entry.Handle, id, "execution", 5, hash)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := os.Rename(entry.path, original); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(entry.path, []byte("other"), 0o400); err != nil {
		t.Fatal(err)
	}
	path, err := StageFileInput(t.TempDir(), FileInput{File: file, SizeBytes: 5}, hash)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "input" {
		t.Fatal("pathname replacement redirected descriptor")
	}
	if err := s.ReleaseUnusedExecution(id, "execution"); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.entries[entry.Handle]; !ok {
		t.Fatal("in-use input released")
	}
	file.Close()
	if err := s.ReleaseExecution(id, "execution"); err != nil {
		t.Fatal(err)
	}
}

func TestArtifactStagingRecoversOnlyOwnedResidue(t *testing.T) {
	s := newStagingForTest(t)
	_, err := s.Stage(context.Background(), strings.NewReader("input"), 5, digestBytes([]byte("input")), digestBytes(nil), "execution")
	if err != nil {
		t.Fatal(err)
	}
	recovered, err := NewArtifactStaging(s.root)
	if err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(recovered.root)
	if len(entries) != 0 {
		t.Fatal("owned crash residue retained")
	}
	unknown := filepath.Join(recovered.root, "unknown")
	if err := os.WriteFile(unknown, []byte("preserve"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewArtifactStaging(s.root); err == nil {
		t.Fatal("unknown residue ignored")
	}
	if data, err := os.ReadFile(unknown); err != nil || string(data) != "preserve" {
		t.Fatal("unknown user file altered")
	}
}
