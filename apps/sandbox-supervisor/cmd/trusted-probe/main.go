package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	marker := "qualification-marker"
	profile := os.Getenv("OJPLATFORM_TRUSTED_PROFILE")
	workspaceGrowthDenied := false
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
	case "workspace":
		growthErr := os.WriteFile("/workspace/growth-probe", make([]byte, 2<<20), 0600)
		workspaceGrowthDenied = growthErr != nil
		if growthErr == nil {
			_ = os.Remove("/workspace/growth-probe")
		}
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
	case "crash":
		os.Exit(70)
	case "":
	default:
		os.Exit(64)
	}
	_ = os.WriteFile("/workspace/marker", []byte(marker), 0600)
	checks := map[string]bool{}
	checks["workspace/growth-denied"] = workspaceGrowthDenied
	for _, path := range []string{"/etc/hostname", "/host", "/mnt/c", "/mnt/d", "/workspace/marker", "/workspace/../etc/passwd", "/workspace/../project", "/workspace/../other-job", "/workspace/.git", "/var/run/docker.sock", "/run/secrets", "/home", "/root", "/proc/1/cmdline", "/dev/kmsg"} {
		_, err := os.Stat(path)
		checks[path] = err == nil
	}
	_ = os.Symlink("/mnt/d", "/workspace/sandbox-escape")
	_, symlinkErr := os.Stat("/workspace/sandbox-escape")
	checks["/workspace/symlink-escape"] = symlinkErr == nil
	outsideWrite, outsideWriteErr := os.OpenFile("/mnt/d/ojplatform-r4-write", os.O_WRONLY|os.O_CREATE, 0600)
	checks["/mnt/d/outside-write"] = outsideWriteErr == nil
	if outsideWrite != nil {
		_ = outsideWrite.Close()
	}
	if outsideWriteErr == nil {
		_ = os.Remove("/mnt/d/ojplatform-r4-write")
	}
	for _, endpoint := range []string{"127.0.0.1:5432", "127.0.0.1:6379", "127.0.0.1:9000", "127.0.0.1:8080", "203.0.113.1:443", "169.254.169.254:80", "172.31.255.254:80"} {
		conn, err := net.DialTimeout("tcp", endpoint, 50*time.Millisecond)
		checks["network/"+endpoint] = err == nil
		if conn != nil {
			_ = conn.Close()
		}
	}
	dnsResolver := &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 50 * time.Millisecond}).DialContext(ctx, "udp", "127.0.0.1:53")
	}}
	dnsCtx, dnsCancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	_, dnsErr := dnsResolver.LookupHost(dnsCtx, "example.com")
	dnsCancel()
	if dnsErr == nil {
		checks["network/dns"] = true
	} else {
		checks["network/dns"] = false
	}
	listener, listenErr := net.Listen("tcp", "127.0.0.1:0")
	checks["network/bind"] = listenErr == nil
	if listener != nil {
		_ = listener.Close()
	}
	mountErr := syscall.Mount("", "/tmp", "", 0, "")
	checks["syscall/mount-denied"] = mountErr != nil
	checks["syscall/unshare-denied"] = syscall.Unshare(syscall.CLONE_NEWNS) != nil
	_, _, ptraceErr := syscall.RawSyscall(syscall.SYS_PTRACE, uintptr(syscall.PTRACE_TRACEME), 0, 0)
	checks["syscall/ptrace-denied"] = ptraceErr != 0
	checks["syscall/ptrace-attach-denied"] = syscall.PtraceAttach(1) != nil
	checks["process/unrelated-signal-denied"] = syscall.Kill(2, 0) != nil
	for _, name := range []string{"DATABASE_URL", "POSTGRES_PASSWORD", "REDIS_URL", "REDIS_PASSWORD", "SESSION_SECRET", "AWS_SECRET_ACCESS_KEY", "MINIO_ROOT_PASSWORD"} {
		checks["env/"+name] = os.Getenv(name) != ""
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
	noNewPrivileges := ""
	for _, line := range strings.Split(statusText, "\n") {
		if strings.HasPrefix(line, "Seccomp:") {
			seccomp = strings.TrimSpace(strings.TrimPrefix(line, "Seccomp:"))
		}
		if strings.HasPrefix(line, "CapEff:") {
			capEff = strings.TrimSpace(strings.TrimPrefix(line, "CapEff:"))
		}
		if strings.HasPrefix(line, "NoNewPrivs:") {
			noNewPrivileges = strings.TrimSpace(strings.TrimPrefix(line, "NoNewPrivs:"))
		}
	}
	route, _ := os.ReadFile("/proc/net/route")
	cgroup, _ := os.ReadFile("/proc/self/cgroup")
	uidMap, _ := os.ReadFile("/proc/self/uid_map")
	gidMap, _ := os.ReadFile("/proc/self/gid_map")
	visiblePids := 0
	if entries, err := os.ReadDir("/proc"); err == nil {
		for _, entry := range entries {
			if _, err := strconv.Atoi(entry.Name()); err == nil {
				visiblePids++
			}
		}
	}
	time.Sleep(100 * time.Millisecond)
	payload := map[string]any{"probe": "SANDBOX_PROBE_QUALIFICATION", "version": "1", "marker": marker, "checks": checks, "pid": os.Getpid(), "uid": os.Getuid(), "gid": os.Getgid(), "pid_is_init": os.Getpid() == 1, "visible_pids": visiblePids, "seccomp": seccomp, "cap_eff": capEff, "no_new_privileges": noNewPrivileges, "uid_map": strings.TrimSpace(string(uidMap)), "gid_map": strings.TrimSpace(string(gidMap)), "default_route": strings.Contains(string(route), "00000000"), "cgroup": strings.TrimSpace(string(cgroup))}
	if n, err := strconv.Atoi(seccomp); err == nil {
		payload["seccomp_mode"] = n
	}
	data, _ := json.Marshal(payload)
	_, _ = os.Stdout.Write(data)
}
