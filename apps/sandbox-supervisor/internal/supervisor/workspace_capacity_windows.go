//go:build windows

package supervisor

import "errors"

func workspaceAvailableBytes(string) (int64, error) {
	return 0, errors.New("real sandbox workspace capacity requires Linux")
}
