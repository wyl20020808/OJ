package supervisor

import "testing"

func TestArtifactStagingRejectsUnsupportedWindowsOwnership(t *testing.T) {
	if _, err := NewArtifactStaging(t.TempDir()); err == nil {
		t.Fatal("artifact staging must require qualified POSIX ownership")
	}
}
