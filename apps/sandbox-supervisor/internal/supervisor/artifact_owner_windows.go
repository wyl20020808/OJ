//go:build windows

package supervisor

import "os"

func artifactOwnerMatches(_ os.FileInfo) bool {
	return true
}

func fileOwner(_ os.FileInfo) (uint32, uint32, bool) {
	return 0, 0, true
}
