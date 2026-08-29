package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func main() {
	marker := "qualification-marker"
	profile := os.Getenv("OJPLATFORM_TRUSTED_PROFILE")
	switch profile {
	case "sleep":
		time.Sleep(10 * time.Second)
	case "cpu":
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			_ = filepath.Base("/workspace/marker")
		}
	case "memory":
		memory := make([]byte, 64<<20)
		for i := range memory {
			memory[i] = byte(i)
		}
		time.Sleep(time.Second)
	case "output":
		_, _ = os.Stdout.Write([]byte(strings.Repeat("O", 2<<20)))
	case "pids":
		children := make([]*os.Process, 0, 64)
		for i := 0; i < 64; i++ {
			child, err := os.StartProcess("/probe", []string{"/probe"}, &os.ProcAttr{Env: []string{"PATH=/usr/bin:/bin", "OJPLATFORM_TRUSTED_PROFILE=pids-child"}})
			if err != nil {
				break
			}
			children = append(children, child)
		}
		for _, child := range children {
			_, _ = child.Wait()
		}
	case "pids-child":
		time.Sleep(500 * time.Millisecond)
	case "":
	default:
		os.Exit(64)
	}
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
	status, _ := os.ReadFile("/proc/self/status")
	statusText := string(status)
	seccomp := ""
	capEff := ""
	for _, line := range strings.Split(statusText, "\n") {
		if strings.HasPrefix(line, "Seccomp:") {
			seccomp = strings.TrimSpace(strings.TrimPrefix(line, "Seccomp:"))
		}
		if strings.HasPrefix(line, "CapEff:") {
			capEff = strings.TrimSpace(strings.TrimPrefix(line, "CapEff:"))
		}
	}
	route, _ := os.ReadFile("/proc/net/route")
	cgroup, _ := os.ReadFile("/proc/self/cgroup")
	time.Sleep(100 * time.Millisecond)
	payload := map[string]any{"probe": "SANDBOX_PROBE_QUALIFICATION", "version": "1", "marker": marker, "checks": checks, "pid": os.Getpid(), "uid": os.Getuid(), "gid": os.Getgid(), "pid_is_init": os.Getpid() == 1, "seccomp": seccomp, "cap_eff": capEff, "default_route": strings.Contains(string(route), "00000000"), "cgroup": strings.TrimSpace(string(cgroup))}
	if n, err := strconv.Atoi(seccomp); err == nil {
		payload["seccomp_mode"] = n
	}
	data, _ := json.Marshal(payload)
	_, _ = os.Stdout.Write(data)
}
