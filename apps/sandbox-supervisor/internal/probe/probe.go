package probe

import (
	"crypto/sha256"
	"debug/elf"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const Version = "1"
const ID = "SANDBOX_PROBE_QUALIFICATION"

var ErrUnknownProbe = errors.New("unknown trusted probe")

func ArtifactHash(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}
func Verify(id, version, expected, path string) error {
	if id != ID || version != Version {
		return ErrUnknownProbe
	}
	actual, err := ArtifactHash(path)
	if err != nil {
		return err
	}
	if expected != actual {
		return fmt.Errorf("trusted probe hash mismatch")
	}
	binary, err := elf.Open(path)
	if err != nil {
		return fmt.Errorf("trusted probe is not an ELF executable: %w", err)
	}
	defer binary.Close()
	for _, program := range binary.Progs {
		if program.Type == elf.PT_INTERP {
			return errors.New("trusted probe must be statically linked")
		}
	}
	return nil
}
func WorkspacePath(root, job string) (string, error) {
	if job == "" || filepath.Base(job) != job {
		return "", errors.New("invalid sandbox job")
	}
	return filepath.Join(root, job), nil
}
