package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	marker := "qualification-marker"
	_ = os.WriteFile("/workspace/marker", []byte(marker), 0600)
	checks := map[string]bool{}
	for _, path := range []string{"/etc/hostname", "/host", "/mnt/c", "/mnt/d", "/workspace/marker", "/workspace/../etc/passwd", "/proc/1/cmdline"} {
		_, err := os.Stat(path)
		checks[path] = err == nil
	}
	_ = filepath.WalkDir("/workspace", func(path string, d os.DirEntry, err error) error {
		if err == nil && d.IsDir() {
			return nil
		}
		return err
	})
	if _, err := os.ReadFile("/workspace/../etc/passwd"); err == nil {
		fmt.Print("PATH_TRAVERSAL_VISIBLE")
	}
	data, _ := json.Marshal(map[string]any{"probe": "SANDBOX_PROBE_QUALIFICATION", "version": "1", "marker": marker, "checks": checks, "pid": os.Getpid()})
	_, _ = os.Stdout.Write(data)
}
