package probe

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestVerifyRejectsNonELFProbe(t *testing.T) {
	path := filepath.Join(t.TempDir(), "probe")
	if err := os.WriteFile(path, []byte("not an executable"), 0o700); err != nil {
		t.Fatal(err)
	}
	hash, err := ArtifactHash(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := Verify(ID, Version, hash, path); err == nil || !strings.Contains(err.Error(), "not an ELF") {
		t.Fatalf("non-ELF trusted probe was accepted: %v", err)
	}
}

func TestVerifyAcceptsStaticGoExecutable(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("trusted probe artifacts are Linux ELF executables")
	}
	path, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	hash, err := ArtifactHash(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := Verify(ID, Version, hash, path); err != nil {
		t.Fatalf("static Go executable was rejected: %v", err)
	}
}
