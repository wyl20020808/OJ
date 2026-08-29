package supervisor

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/probe"
)

const (
	ProbeOutcome          = "SANDBOX_PROBE_SUCCEEDED"
	RejectedOutcome       = "SANDBOX_REQUEST_REJECTED"
	CleanupFailureOutcome = "SANDBOX_CLEANUP_FAILURE"
)

type Supervisor struct {
	Root                 string
	Runc                 string
	ProbeBinary          string
	qualificationProfile string
	systemdCgroup        bool
	rootlessMode         string
	cgroupSlice          string
	omitCgroupPath       bool
	cgroupfsParent       string
	systemdUserBus       bool
	runcDebug            bool
}

// ociConfig constructs the immutable server-owned OCI policy for one sandbox.
// Keeping this separate permits forensic tests to inspect the exact finite
// resource values before invoking runc.
func (s *Supervisor) ociConfig(sid, workspace string, r model.Request, env []string) bundleConfig {
	slice := s.cgroupSlice
	if slice == "" {
		slice = "system.slice"
	}
	cgroupPath := "phase2b/" + sid
	if !s.systemdCgroup && s.cgroupfsParent != "" {
		cgroupPath = strings.TrimSuffix(s.cgroupfsParent, "/") + "/phase2b/" + sid
	}
	if s.systemdCgroup && s.omitCgroupPath {
		cgroupPath = ""
	}
	if s.systemdCgroup && !s.omitCgroupPath {
		cgroupPath = slice + ":phase2b:" + sid
	}
	return bundleConfig{OciVersion: "1.0.2", Process: bundleProcess{Args: []string{"/probe"}, Cwd: "/workspace", Env: env, NoNewPrivileges: true, User: bundleUser{UID: 0, GID: 0}, Capabilities: map[string][]string{"bounding": {}, "effective": {}, "inheritable": {}, "permitted": {}, "ambient": {}}, Seccomp: bundleSeccomp{DefaultAction: "SCMP_ACT_ALLOW", Architectures: []string{"SCMP_ARCH_X86_64"}, Syscalls: []bundleSyscall{{Names: []string{"mount", "umount2", "pivot_root", "setns", "unshare", "ptrace", "bpf", "perf_event_open"}, Action: "SCMP_ACT_ERRNO"}}}}, Root: bundleRoot{Path: "rootfs", Readonly: false}, Mounts: []bundleMount{{Destination: "/dev", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=64k", "mode=755"}}, {Destination: "/proc", Type: "proc", Source: "proc", Options: []string{"nosuid", "noexec", "nodev"}}, {Destination: "/tmp", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=1m", "mode=1777"}}, {Destination: "/workspace", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=1m", "mode=1777"}}}, Linux: bundleLinux{Namespaces: []map[string]string{{"type": "pid"}, {"type": "mount"}, {"type": "network"}, {"type": "ipc"}, {"type": "uts"}, {"type": "user"}}, UIDMappings: []map[string]uint32{{"containerID": 0, "hostID": 65534, "size": 1}}, GIDMappings: []map[string]uint32{{"containerID": 0, "hostID": 65534, "size": 1}}, RootfsPropagation: "rslave", CgroupsPath: cgroupPath, Resources: bundleResources{CPU: bundleCPU{Quota: int64(r.CPUMillis) * 1000, Period: 100000}, Memory: bundleMemory{Limit: r.MemoryBytes}, Pids: bundlePids{Limit: int64(r.Pids)}}, MaskedPaths: []string{"/proc/kcore", "/proc/keys", "/proc/timer_list", "/proc/latency_stats", "/proc/timer_stats"}, ReadonlyPaths: []string{"/proc/sys", "/proc/sysrq-trigger", "/proc/irq", "/proc/bus", "/proc/fs"}}}
}

type bundleConfig struct {
	OciVersion string        `json:"ociVersion"`
	Process    bundleProcess `json:"process"`
	Root       bundleRoot    `json:"root"`
	Mounts     []bundleMount `json:"mounts"`
	Linux      bundleLinux   `json:"linux"`
}
type bundleProcess struct {
	Args            []string            `json:"args"`
	Cwd             string              `json:"cwd"`
	Env             []string            `json:"env"`
	NoNewPrivileges bool                `json:"noNewPrivileges"`
	User            bundleUser          `json:"user"`
	Capabilities    map[string][]string `json:"capabilities"`
	Seccomp         bundleSeccomp       `json:"seccomp"`
}
type bundleUser struct {
	UID uint32 `json:"uid"`
	GID uint32 `json:"gid"`
}
type bundleRoot struct {
	Path     string `json:"path"`
	Readonly bool   `json:"readonly"`
}
type bundleMount struct {
	Destination string   `json:"destination"`
	Type        string   `json:"type"`
	Source      string   `json:"source"`
	Options     []string `json:"options"`
}
type bundleLinux struct {
	Namespaces        []map[string]string `json:"namespaces"`
	UIDMappings       []map[string]uint32 `json:"uidMappings"`
	GIDMappings       []map[string]uint32 `json:"gidMappings"`
	RootfsPropagation string              `json:"rootfsPropagation"`
	CgroupsPath       string              `json:"cgroupsPath"`
	Resources         bundleResources     `json:"resources"`
	MaskedPaths       []string            `json:"maskedPaths"`
	ReadonlyPaths     []string            `json:"readonlyPaths"`
}
type bundleResources struct {
	CPU     bundleCPU         `json:"cpu"`
	Memory  bundleMemory      `json:"memory"`
	Pids    bundlePids        `json:"pids"`
	Unified map[string]string `json:"unified,omitempty"`
}
type bundleCPU struct {
	Quota  int64  `json:"quota"`
	Period uint64 `json:"period"`
}
type bundleMemory struct {
	Limit int64 `json:"limit"`
}
type bundlePids struct {
	Limit int64 `json:"limit"`
}
type bundleSeccomp struct {
	DefaultAction string          `json:"defaultAction"`
	Architectures []string        `json:"architectures"`
	Syscalls      []bundleSyscall `json:"syscalls"`
}
type bundleSyscall struct {
	Names  []string `json:"names"`
	Action string   `json:"action"`
}

func New(root, runc, probeBinary string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, systemdCgroup: true, rootlessMode: "auto", cgroupSlice: "system.slice"}
}
func newWithProfile(root, runc, probeBinary, profile string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: "auto", cgroupSlice: "system.slice", runcDebug: true}
}
func newWithCgroupfsProfile(root, runc, probeBinary, profile string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: false, rootlessMode: "auto", cgroupSlice: "system.slice", runcDebug: true}
}
func newWithCgroupfsRootlessMode(root, runc, probeBinary, profile, mode string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: false, rootlessMode: mode, cgroupSlice: "system.slice", runcDebug: true}
}
func newWithCgroupfsParentProfile(root, runc, probeBinary, profile, parent string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: false, rootlessMode: "auto", cgroupSlice: "system.slice", cgroupfsParent: parent, runcDebug: true}
}
func newWithRootlessMode(root, runc, probeBinary, profile, mode string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: mode, cgroupSlice: "system.slice", runcDebug: true}
}
func newWithSliceProfile(root, runc, probeBinary, profile, slice string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: "auto", cgroupSlice: slice, runcDebug: true}
}
func newWithUserBusProfile(root, runc, probeBinary, profile string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: "auto", cgroupSlice: "user.slice", systemdUserBus: true, runcDebug: true}
}
func newWithRootlessUserBusProfile(root, runc, probeBinary, profile string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: "true", cgroupSlice: "user.slice", systemdUserBus: true, runcDebug: true}
}
func newWithRootlessDefaultProfile(root, runc, probeBinary, profile string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: "true", omitCgroupPath: true, systemdUserBus: true, runcDebug: true}
}
func Validate(r model.Request) error {
	if r.ContractVersion != model.ContractVersion || r.ExecutionMode != "SANDBOX_PROBE_QUALIFICATION" {
		return errors.New("request contract or mode rejected")
	}
	for _, v := range []string{r.SandboxJobID, r.JudgeJobID, r.WorkerID, r.WorkerInstanceID, r.TrustedProbeID, r.ProbeVersion, r.ProbeHash, r.CorrelationID} {
		if v == "" || strings.ContainsAny(v, "/\\\x00") {
			return errors.New("malformed request identity")
		}
	}
	if r.TrustedProbeID != probe.ID || r.ProbeVersion != probe.Version || r.CPUMillis < 1 || r.WallTimeMS < 1 || r.MemoryBytes < 4096 || r.OutputBytes < 1 || r.Pids < 1 || r.DeadlineAt.IsZero() || !r.DeadlineAt.After(time.Now()) {
		return errors.New("invalid sandbox limits/probe")
	}
	if len(r.PolicyIDs) == 0 {
		return errors.New("policy required")
	}
	if r.CancellationGeneration < 0 {
		return errors.New("invalid cancellation generation")
	}
	for _, policy := range r.PolicyIDs {
		if policy != "default" && policy != "default-seccomp-no-privilege" {
			return errors.New("unknown sandbox policy")
		}
	}
	return nil
}
func id() string { var b [16]byte; _, _ = rand.Read(b[:]); return fmt.Sprintf("sbx-%x", b[:]) }
func (s *Supervisor) Run(ctx context.Context, r model.Request) (model.Result, error) {
	started := time.Now().UTC()
	result := model.Result{ContractVersion: model.ContractVersion, SandboxJobID: r.SandboxJobID, JudgeJobID: r.JudgeJobID, TrustedProbeID: r.TrustedProbeID, ProbeVersion: r.ProbeVersion, CorrelationID: r.CorrelationID, SyntheticQualification: true, StartedAt: started}
	if err := Validate(r); err != nil {
		result.Outcome = RejectedOutcome
		result.Diagnostic = err.Error()
		return result, err
	}
	if err := probe.Verify(r.TrustedProbeID, r.ProbeVersion, r.ProbeHash, s.ProbeBinary); err != nil {
		result.Outcome = RejectedOutcome
		result.Diagnostic = err.Error()
		return result, err
	}
	sid := id()
	dir := filepath.Join(s.Root, sid)
	bundle := filepath.Join(dir, "bundle")
	rootfs := filepath.Join(bundle, "rootfs")
	workspace := filepath.Join(rootfs, "workspace")
	// The mapped guest identity must traverse the Supervisor root, without
	// gaining directory listing access to other jobs.
	if err := os.Chmod(s.Root, 0711); err != nil {
		return result, err
	}
	if err := os.MkdirAll(rootfs, 0755); err != nil {
		return result, err
	}
	if err := os.MkdirAll(filepath.Join(rootfs, "dev"), 0755); err != nil {
		return result, err
	}
	if err := os.MkdirAll(filepath.Join(rootfs, "proc"), 0755); err != nil {
		return result, err
	}
	if err := os.MkdirAll(filepath.Join(rootfs, "tmp"), 0755); err != nil {
		return result, err
	}
	if err := os.MkdirAll(workspace, 0700); err != nil {
		return result, err
	}
	removedDir := false
	defer func() {
		if !removedDir {
			_ = os.RemoveAll(dir)
		}
	}()
	if err := copyFile(s.ProbeBinary, filepath.Join(rootfs, "probe"), 0755); err != nil {
		return result, err
	}
	guestEnv := []string{"PATH=/usr/bin:/bin", "LANG=C"}
	if s.qualificationProfile != "" {
		switch s.qualificationProfile {
		case "sleep", "cpu", "memory", "pids", "pids-child", "output":
			guestEnv = append(guestEnv, "OJPLATFORM_TRUSTED_PROFILE="+s.qualificationProfile)
		default:
			return result, errors.New("unknown trusted qualification profile")
		}
	}
	config := bundleConfig{OciVersion: "1.0.2", Process: bundleProcess{Args: []string{"/probe"}, Cwd: "/workspace", Env: guestEnv, NoNewPrivileges: true, User: bundleUser{UID: 0, GID: 0}, Capabilities: map[string][]string{"bounding": {}, "effective": {}, "inheritable": {}, "permitted": {}, "ambient": {}}, Seccomp: bundleSeccomp{DefaultAction: "SCMP_ACT_ALLOW", Architectures: []string{"SCMP_ARCH_X86_64"}, Syscalls: []bundleSyscall{{Names: []string{"mount", "umount2", "pivot_root", "setns", "unshare", "ptrace", "bpf", "perf_event_open"}, Action: "SCMP_ACT_ERRNO"}}}}, Root: bundleRoot{Path: "rootfs", Readonly: false}, Mounts: []bundleMount{{Destination: "/dev", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=64k", "mode=755"}}, {Destination: "/proc", Type: "proc", Source: "proc", Options: []string{"nosuid", "noexec", "nodev"}}, {Destination: "/tmp", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "nodev", "noexec", "size=1m", "mode=1777"}}, {Destination: "/workspace", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "nodev", "size=1m", "mode=1777"}}}, Linux: bundleLinux{Namespaces: []map[string]string{{"type": "pid"}, {"type": "mount"}, {"type": "network"}, {"type": "ipc"}, {"type": "uts"}, {"type": "user"}}, UIDMappings: []map[string]uint32{{"containerID": 0, "hostID": 65534, "size": 1}}, GIDMappings: []map[string]uint32{{"containerID": 0, "hostID": 65534, "size": 1}}, RootfsPropagation: "rslave", CgroupsPath: "phase2b/" + sid, Resources: bundleResources{CPU: bundleCPU{Quota: int64(r.CPUMillis) * 1000, Period: 100000}, Memory: bundleMemory{Limit: r.MemoryBytes}, Pids: bundlePids{Limit: int64(r.Pids)}}, MaskedPaths: []string{"/proc/kcore", "/proc/keys", "/proc/timer_list", "/proc/latency_stats", "/proc/timer_stats"}, ReadonlyPaths: []string{"/proc/sys", "/proc/sysrq-trigger", "/proc/irq", "/proc/bus", "/proc/fs"}}}
	config = s.ociConfig(sid, workspace, r, guestEnv)
	config.Linux.Resources.Unified = map[string]string{"memory.max": fmt.Sprintf("%d", r.MemoryBytes), "pids.max": fmt.Sprintf("%d", r.Pids)}
	if s.systemdCgroup && !s.omitCgroupPath {
		slice := s.cgroupSlice
		if slice == "" {
			slice = "system.slice"
		}
		config.Linux.CgroupsPath = slice + ":phase2b:" + sid
	}
	encoded, _ := json.MarshalIndent(config, "", "  ")
	if err := os.WriteFile(filepath.Join(bundle, "config.json"), encoded, 0600); err != nil {
		return result, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, time.Duration(r.WallTimeMS)*time.Millisecond)
	defer cancel()
	args := []string{"run", "--bundle", bundle, sid}
	if s.runcDebug {
		args = append([]string{"--debug"}, args...)
	}
	if s.rootlessMode != "" {
		args = append([]string{"--rootless=" + s.rootlessMode}, args...)
	}
	if s.systemdCgroup {
		args = append([]string{"--systemd-cgroup"}, args...)
	}
	create := exec.CommandContext(commandCtx, s.Runc, args...)
	create.Env = []string{"PATH=/usr/bin:/bin", "LANG=C"}
	if s.systemdUserBus {
		for _, name := range []string{"DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR"} {
			if value := os.Getenv(name); value != "" {
				create.Env = append(create.Env, name+"="+value)
			}
		}
	}
	if s.qualificationProfile != "" {
		switch s.qualificationProfile {
		case "sleep", "cpu", "memory", "pids", "pids-child", "output":
			create.Env = append(create.Env, "OJPLATFORM_TRUSTED_PROFILE="+s.qualificationProfile)
		default:
			return result, errors.New("unknown trusted qualification profile")
		}
	}
	var stdout, stderr = boundedWriter{limit: r.OutputBytes}, boundedWriter{limit: r.OutputBytes}
	create.Stdout = &stdout
	create.Stderr = &stderr
	err := create.Run()
	output := stdout.String()
	if stderr.Len() > 0 {
		output += stderr.String()
	}
	if commandCtx.Err() != nil {
		result.Outcome = "SANDBOX_WALL_LIMIT"
		result.Diagnostic = "bounded wall-time termination"
	} else if err != nil {
		result.Outcome = "SANDBOX_RUNTIME_ERROR"
		result.Diagnostic = output
		if result.Diagnostic == "" {
			result.Diagnostic = err.Error()
		}
	} else {
		result.Outcome = ProbeOutcome
		result.Stdout = stdout.String()
		result.Stderr = stderr.String()
		if stdout.Exceeded() || stderr.Exceeded() {
			result.Outcome = "SANDBOX_OUTPUT_LIMIT"
		}
	}
	cleanupArgs := []string{"delete", "--force", sid}
	if s.systemdCgroup {
		cleanupArgs = append([]string{"--systemd-cgroup"}, cleanupArgs...)
	}
	cleanup := exec.Command(s.Runc, cleanupArgs...)
	_ = cleanup.Run()
	removeErr := os.RemoveAll(dir)
	removedDir = removeErr == nil
	result.CompletedAt = time.Now().UTC()
	result.Clean = guestGone(s.Runc, sid) && removeErr == nil && !pathExists(dir)
	if !result.Clean {
		result.Outcome = CleanupFailureOutcome
		return result, errors.New("sandbox cleanup verification failed")
	}
	if result.Outcome == ProbeOutcome {
		result.ExitCode = 0
	}
	return result, nil
}

type boundedWriter struct {
	buf      bytes.Buffer
	limit    int
	exceeded bool
}

func (w *boundedWriter) Write(p []byte) (int, error) {
	remaining := w.limit - w.buf.Len()
	if remaining <= 0 {
		w.exceeded = true
		return len(p), nil
	}
	if len(p) > remaining {
		_, _ = w.buf.Write(p[:remaining])
		w.exceeded = true
		return len(p), nil
	}
	return w.buf.Write(p)
}
func (w *boundedWriter) String() string { return w.buf.String() }
func (w *boundedWriter) Len() int       { return w.buf.Len() }
func (w *boundedWriter) Exceeded() bool { return w.exceeded }
func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
func guestGone(runcPath, id string) bool { return exec.Command(runcPath, "state", id).Run() != nil }

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
