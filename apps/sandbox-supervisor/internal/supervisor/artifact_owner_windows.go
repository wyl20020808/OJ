//go:build windows

package supervisor

import "os"

func artifactOwnerMatches(_ os.FileInfo) bool {
	return true
}
