//go:build unix

package supervisor

import (
	"os"
	"syscall"
)

func artifactOwnerMatches(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && int(stat.Uid) == os.Geteuid()
}
