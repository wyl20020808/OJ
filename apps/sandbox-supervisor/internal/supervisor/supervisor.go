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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/probe"
)

const (
	ProbeOutcome            = "SANDBOX_PROBE_SUCCEEDED"
	RejectedOutcome         = "SANDBOX_REQUEST_REJECTED"
	CleanupFailureOutcome   = "SANDBOX_CLEANUP_FAILURE"
	UnqualifiedOutcome      = "SANDBOX_UNQUALIFIED"
	PreflightFailureOutcome = "SANDBOX_PREFLIGHT_FAILED"
	CancelledOutcome        = "SANDBOX_CANCELLED"
)

var (
	ErrSupervisorUnqualified = errors.New("sandbox supervisor is not running as a dedicated non-root identity")
	ErrSandboxPreflight      = errors.New("sandbox execution preflight failed")
)

type Supervisor struct {
	Root                 string
	Runc                 string
	ProbeBinary          string
	qualificationProfile string
	workspaceAvailable   func(string) (int64, error)
	systemdCgroup        bool
	rootlessMode         string
	cgroupSlice          string
	omitCgroupPath       bool
	cgroupfsParent       string
	systemdUserBus       bool
	runcDebug            bool
	mappingHostID        uint32
	mappingHostIDSet     bool
	mappingHostGID       uint32
	mappingHostGIDSet    bool
	identityGate         bool
}

// ociConfig constructs the immutable server-owned OCI policy for one sandbox.
// Keeping this separate permits forensic tests to inspect the exact finite
// resource values before invoking runc.
func (s *Supervisor) ociConfig(sid, workspace string, r model.Request, env []string) bundleConfig {
	slice := s.effectiveCgroupSlice()
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
	mappingHostID := uint32(65534)
	mappingHostGID := uint32(65534)
	if s.mappingHostIDSet {
		mappingHostID = s.mappingHostID
	}
	if s.mappingHostGIDSet {
		mappingHostGID = s.mappingHostGID
	}
	if s.identityGate && os.Geteuid() != 0 {
		mappingHostID = uint32(os.Geteuid())
		mappingHostGID = uint32(os.Getgid())
	}
	return bundleConfig{OciVersion: "1.0.2", Process: bundleProcess{Args: []string{"/probe"}, Cwd: "/workspace", Env: env, NoNewPrivileges: true, User: bundleUser{UID: 0, GID: 0}, Capabilities: map[string][]string{"bounding": {}, "effective": {}, "inheritable": {}, "permitted": {}, "ambient": {}}, Rlimits: sandboxRlimits(runtimeOpenFileLimit, runtimeFileSizeLimit)}, Root: bundleRoot{Path: "rootfs", Readonly: false}, Mounts: []bundleMount{{Destination: "/dev", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=64k", "mode=755"}}, {Destination: "/proc", Type: "proc", Source: "proc", Options: []string{"nosuid", "noexec", "nodev"}}, {Destination: "/tmp", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=1m", "mode=1777"}}, {Destination: "/workspace", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=1m", "mode=1777"}}}, Linux: bundleLinux{Namespaces: []map[string]string{{"type": "pid"}, {"type": "mount"}, {"type": "network"}, {"type": "ipc"}, {"type": "uts"}, {"type": "user"}}, UIDMappings: []map[string]uint32{{"containerID": 0, "hostID": mappingHostID, "size": 1}}, GIDMappings: []map[string]uint32{{"containerID": 0, "hostID": mappingHostGID, "size": 1}}, RootfsPropagation: "rslave", CgroupsPath: cgroupPath, Resources: bundleResources{CPU: bundleCPU{Quota: int64(r.CPUMillis) * 1000, Period: 100000}, Memory: bundleMemory{Limit: r.MemoryBytes}, Pids: bundlePids{Limit: int64(r.Pids)}}, Seccomp: sandboxSeccomp(), MaskedPaths: []string{"/proc/kcore", "/proc/keys", "/proc/timer_list", "/proc/latency_stats", "/proc/timer_stats"}, ReadonlyPaths: []string{"/proc/sys", "/proc/sysrq-trigger", "/proc/irq", "/proc/bus", "/proc/fs"}}}
}

func (s *Supervisor) effectiveCgroupSlice() string {
	if s.identityGate && os.Geteuid() != 0 {
		return "user.slice"
	}
	if s.cgroupSlice == "" {
		return "system.slice"
	}
	return s.cgroupSlice
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
	Rlimits         []bundleRlimit      `json:"rlimits"`
	Seccomp         bundleSeccomp       `json:"-"`
}
type bundleRlimit struct {
	Type string `json:"type"`
	Hard uint64 `json:"hard"`
	Soft uint64 `json:"soft"`
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
	Seccomp           bundleSeccomp       `json:"seccomp"`
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

const (
	compileOpenFileLimit = uint64(128)
	runtimeOpenFileLimit = uint64(64)
	compileFileSizeLimit = uint64(16 << 20)
	runtimeFileSizeLimit = uint64(512 << 10)
	minimumWorkspaceFree = int64(64 << 20)
)

var deniedDangerousSyscalls = []string{
	"mount", "umount2", "pivot_root", "ptrace", "kexec_load", "init_module",
	"finit_module", "delete_module", "reboot", "swapon", "swapoff", "setns",
	"unshare", "bpf", "perf_event_open", "open_by_handle_at", "userfaultfd",
	"keyctl", "add_key", "request_key",
}

func sandboxSeccomp() bundleSeccomp {
	return bundleSeccomp{DefaultAction: "SCMP_ACT_ALLOW", Architectures: []string{"SCMP_ARCH_X86_64"}, Syscalls: []bundleSyscall{{Names: append([]string(nil), deniedDangerousSyscalls...), Action: "SCMP_ACT_ERRNO"}}}
}

func sandboxRlimits(openFiles, fileBytes uint64) []bundleRlimit {
	return []bundleRlimit{
		{Type: "RLIMIT_NOFILE", Hard: openFiles, Soft: openFiles},
		{Type: "RLIMIT_FSIZE", Hard: fileBytes, Soft: fileBytes},
	}
}

func New(root, runc, probeBinary string) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, systemdCgroup: true, rootlessMode: "true", cgroupSlice: "system.slice", systemdUserBus: true, identityGate: true}
}

// NewWithTrustedProfile selects one immutable qualification profile. The
// profile never comes from a Submission or an arbitrary command request.
func NewWithTrustedProfile(root, runc, probeBinary, profile string) (*Supervisor, error) {
	if !isTrustedProfile(profile) {
		return nil, errors.New("unknown trusted qualification profile")
	}
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: "true", cgroupSlice: "system.slice", systemdUserBus: true, identityGate: true}, nil
}

func isTrustedProfile(profile string) bool {
	switch profile {
	case "", "sleep", "cpu", "memory", "pids", "pids-child", "output", "workspace", "crash":
		return true
	default:
		return false
	}
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
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: mode, cgroupSlice: "system.slice", systemdUserBus: true, runcDebug: true}
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
func newWithNonRootUserBusProfile(root, runc, probeBinary, profile string, hostID uint32) *Supervisor {
	return &Supervisor{Root: root, Runc: runc, ProbeBinary: probeBinary, qualificationProfile: profile, systemdCgroup: true, rootlessMode: "true", cgroupSlice: "user.slice", systemdUserBus: true, runcDebug: true, mappingHostID: hostID, mappingHostIDSet: true, mappingHostGID: hostID, mappingHostGIDSet: true, identityGate: true}
}

// Preflight verifies the host contract required for a production-intent
// qualification. It intentionally fails before runc when the Supervisor is
// root or when the delegated user-manager environment is unavailable.
func (s *Supervisor) Preflight(ctx context.Context) error {
	if err := validateSupervisorIdentity(os.Geteuid()); err != nil {
		return err
	}
	if !s.systemdCgroup {
		return fmt.Errorf("%w: systemd cgroup driver is required", ErrSandboxPreflight)
	}
	if s.rootlessMode == "false" {
		return fmt.Errorf("%w: rootless mode is disabled", ErrSandboxPreflight)
	}
	runtimeDir := os.Getenv("XDG_RUNTIME_DIR")
	if runtimeDir == "" {
		return fmt.Errorf("%w: XDG_RUNTIME_DIR is missing", ErrSandboxPreflight)
	}
	if info, err := os.Stat(runtimeDir); err != nil || !info.IsDir() {
		return fmt.Errorf("%w: XDG_RUNTIME_DIR is unavailable", ErrSandboxPreflight)
	}
	dbusAddress := os.Getenv("DBUS_SESSION_BUS_ADDRESS")
	if dbusAddress == "" {
		return fmt.Errorf("%w: DBUS_SESSION_BUS_ADDRESS is missing", ErrSandboxPreflight)
	}
	if strings.HasPrefix(dbusAddress, "unix:path=") {
		busPath := strings.TrimPrefix(dbusAddress, "unix:path=")
		if _, err := os.Stat(busPath); err != nil {
			return fmt.Errorf("%w: user bus is unavailable: %v", ErrSandboxPreflight, err)
		}
	}
	if err := runUserManagerCheck(ctx); err != nil {
		return err
	}
	controllers, err := os.ReadFile("/sys/fs/cgroup/cgroup.controllers")
	if err != nil {
		return fmt.Errorf("%w: cgroup v2 controllers unavailable: %v", ErrSandboxPreflight, err)
	}
	managerPath, err := delegatedManagerPath()
	if err != nil {
		return err
	}
	managerControllers, err := os.ReadFile(filepath.Join("/sys/fs/cgroup", managerPath, "cgroup.controllers"))
	if err != nil || !hasController(string(managerControllers), "memory") || !hasController(string(managerControllers), "pids") {
		return fmt.Errorf("%w: user manager does not expose memory/pids", ErrSandboxPreflight)
	}
	managerSubtree, err := os.ReadFile(filepath.Join("/sys/fs/cgroup", managerPath, "cgroup.subtree_control"))
	if err != nil {
		return fmt.Errorf("%w: user manager delegation is unavailable: %v", ErrSandboxPreflight, err)
	}
	if err := validateControllerDelegation(string(controllers), string(managerControllers), string(managerSubtree)); err != nil {
		return err
	}
	if _, err := exec.LookPath(s.Runc); err != nil {
		return fmt.Errorf("%w: runc unavailable: %v", ErrSandboxPreflight, err)
	}
	return nil
}

func validateSupervisorIdentity(euid int) error {
	if euid == 0 {
		return fmt.Errorf("%w: euid=0", ErrSupervisorUnqualified)
	}
	return nil
}

func runUserManagerCheck(ctx context.Context) error {
	check := exec.CommandContext(ctx, "systemctl", "--user", "is-system-running")
	output, err := check.CombinedOutput()
	if err != nil || strings.TrimSpace(string(output)) != "running" {
		return fmt.Errorf("%w: systemd user manager is not running: %s", ErrSandboxPreflight, strings.TrimSpace(string(output)))
	}
	return nil
}

func hasController(value, controller string) bool {
	for _, item := range strings.Fields(value) {
		if item == controller {
			return true
		}
	}
	return false
}

func validateControllerDelegation(root, manager, subtree string) error {
	for _, value := range []string{root, manager, subtree} {
		if !hasController(value, "memory") || !hasController(value, "pids") {
			return fmt.Errorf("%w: cgroup v2 memory/pids controllers are unavailable or not delegated", ErrSandboxPreflight)
		}
	}
	return nil
}

func delegatedManagerPath() (string, error) {
	uid := strconv.Itoa(os.Getuid())
	marker := "/user.slice/user-" + uid + ".slice/user@" + uid + ".service"
	show := exec.Command("systemctl", "--user", "show", "--no-page", "-p", "ControlGroup", "--value")
	output, err := show.Output()
	if err != nil {
		return "", fmt.Errorf("%w: cannot inspect user manager cgroup: %v", ErrSandboxPreflight, err)
	}
	path := strings.TrimSpace(string(output))
	if strings.HasPrefix(path, marker) {
		return strings.TrimPrefix(path[:len(marker)], "/"), nil
	}
	return "", fmt.Errorf("%w: user manager is outside user@%s.service hierarchy", ErrSandboxPreflight, uid)
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
	if s.identityGate {
		if err := s.Preflight(ctx); err != nil {
			if errors.Is(err, ErrSupervisorUnqualified) {
				result.Outcome = UnqualifiedOutcome
			} else {
				result.Outcome = PreflightFailureOutcome
			}
			result.Diagnostic = err.Error()
			result.Clean = true
			result.CompletedAt = time.Now().UTC()
			return result, err
		}
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
	if !isTrustedProfile(s.qualificationProfile) {
		return result, errors.New("unknown trusted qualification profile")
	}
	if s.qualificationProfile != "" {
		guestEnv = append(guestEnv, "OJPLATFORM_TRUSTED_PROFILE="+s.qualificationProfile)
	}
	config := bundleConfig{OciVersion: "1.0.2", Process: bundleProcess{Args: []string{"/probe"}, Cwd: "/workspace", Env: guestEnv, NoNewPrivileges: true, User: bundleUser{UID: 0, GID: 0}, Capabilities: map[string][]string{"bounding": {}, "effective": {}, "inheritable": {}, "permitted": {}, "ambient": {}}, Rlimits: sandboxRlimits(runtimeOpenFileLimit, runtimeFileSizeLimit)}, Root: bundleRoot{Path: "rootfs", Readonly: false}, Mounts: []bundleMount{{Destination: "/dev", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "noexec", "nodev", "size=64k", "mode=755"}}, {Destination: "/proc", Type: "proc", Source: "proc", Options: []string{"nosuid", "noexec", "nodev"}}, {Destination: "/tmp", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "nodev", "noexec", "size=1m", "mode=1777"}}, {Destination: "/workspace", Type: "tmpfs", Source: "tmpfs", Options: []string{"nosuid", "nodev", "size=1m", "mode=1777"}}}, Linux: bundleLinux{Namespaces: []map[string]string{{"type": "pid"}, {"type": "mount"}, {"type": "network"}, {"type": "ipc"}, {"type": "uts"}, {"type": "user"}}, UIDMappings: []map[string]uint32{{"containerID": 0, "hostID": 65534, "size": 1}}, GIDMappings: []map[string]uint32{{"containerID": 0, "hostID": 65534, "size": 1}}, RootfsPropagation: "rslave", CgroupsPath: "phase2b/" + sid, Resources: bundleResources{CPU: bundleCPU{Quota: int64(r.CPUMillis) * 1000, Period: 100000}, Memory: bundleMemory{Limit: r.MemoryBytes}, Pids: bundlePids{Limit: int64(r.Pids)}}, Seccomp: sandboxSeccomp(), MaskedPaths: []string{"/proc/kcore", "/proc/keys", "/proc/timer_list", "/proc/latency_stats", "/proc/timer_stats"}, ReadonlyPaths: []string{"/proc/sys", "/proc/sysrq-trigger", "/proc/irq", "/proc/bus", "/proc/fs"}}}
	config = s.ociConfig(sid, workspace, r, guestEnv)
	config.Linux.Resources.Unified = map[string]string{"memory.max": fmt.Sprintf("%d", r.MemoryBytes), "pids.max": fmt.Sprintf("%d", r.Pids)}
	if s.systemdCgroup && !s.omitCgroupPath {
		config.Linux.CgroupsPath = s.effectiveCgroupSlice() + ":phase2b:" + sid
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
		create.Env = append(create.Env, "OJPLATFORM_TRUSTED_PROFILE="+s.qualificationProfile)
	}
	var stdout, stderr = boundedWriter{limit: r.OutputBytes}, boundedWriter{limit: r.OutputBytes}
	create.Stdout = &stdout
	create.Stderr = &stderr
	monitor := newResourceMonitor(sid, r)
	go monitor.run()
	err := create.Run()
	result.Evidence = monitor.stop()
	output := stdout.String()
	if stderr.Len() > 0 {
		output += stderr.String()
	}
	if ctx.Err() != nil && errors.Is(ctx.Err(), context.Canceled) {
		result.Outcome = CancelledOutcome
		result.Diagnostic = "sandbox context cancelled"
	} else if commandCtx.Err() != nil {
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
	onLimit  func()
}

func (w *boundedWriter) Write(p []byte) (int, error) {
	remaining := w.limit - w.buf.Len()
	if remaining <= 0 {
		w.markExceeded()
		return len(p), nil
	}
	if len(p) > remaining {
		_, _ = w.buf.Write(p[:remaining])
		w.markExceeded()
		return len(p), nil
	}
	return w.buf.Write(p)
}
func (w *boundedWriter) markExceeded() {
	if w.exceeded {
		return
	}
	w.exceeded = true
	if w.onLimit != nil {
		w.onLimit()
	}
}
func (w *boundedWriter) String() string { return w.buf.String() }
func (w *boundedWriter) Len() int       { return w.buf.Len() }
func (w *boundedWriter) Exceeded() bool { return w.exceeded }
func (w *boundedWriter) Bytes() []byte  { return append([]byte(nil), w.buf.Bytes()...) }
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

type resourceMonitor struct {
	sid      string
	request  model.Request
	stopOnce sync.Once
	stopCh   chan struct{}
	doneCh   chan struct{}
	mu       sync.Mutex
	evidence model.RuntimeEvidence
}

func newResourceMonitor(sid string, request model.Request) *resourceMonitor {
	return &resourceMonitor{
		sid:     sid,
		request: request,
		stopCh:  make(chan struct{}),
		doneCh:  make(chan struct{}),
		evidence: model.RuntimeEvidence{
			SupervisorUID: os.Geteuid(), SupervisorGID: os.Getegid(),
			RequestedMemory: request.MemoryBytes, OCIMemory: request.MemoryBytes,
			RequestedPids: request.Pids, OCIPids: int64(request.Pids),
		},
	}
}

func (m *resourceMonitor) run() {
	defer close(m.doneCh)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		m.capture()
		select {
		case <-m.stopCh:
			m.capture()
			return
		case <-ticker.C:
		}
	}
}

func (m *resourceMonitor) stop() *model.RuntimeEvidence {
	m.stopOnce.Do(func() { close(m.stopCh) })
	<-m.doneCh
	m.mu.Lock()
	defer m.mu.Unlock()
	copy := m.evidence
	return &copy
}

func (m *resourceMonitor) qualified() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.evidence.ControlGroup != "" && m.evidence.MemoryMax != "" && m.evidence.PidsMax != "" && m.evidence.CPUMax != ""
}

func (m *resourceMonitor) capture() {
	m.mu.Lock()
	path := m.evidence.ControlGroup
	m.mu.Unlock()
	if path == "" {
		path = findScope(m.sid)
		if path == "" {
			return
		}
	}
	read := func(name string) string {
		data, err := os.ReadFile(filepath.Join(path, name))
		if err != nil {
			return ""
		}
		return strings.TrimSpace(string(data))
	}
	memoryMax := read("memory.max")
	pidsMax := read("pids.max")
	if memoryMax != strconv.FormatInt(m.request.MemoryBytes, 10) || pidsMax != strconv.Itoa(m.request.Pids) {
		// A new systemd scope is briefly visible with inherited parent limits.
		// Do not publish those transient values as execution evidence.
		return
	}
	m.mu.Lock()
	m.evidence.ControlGroup = path
	cpuStat := read("cpu.stat")
	memoryPeak := read("memory.peak")
	for target, value := range map[*string]string{
		&m.evidence.MemoryMax: memoryMax, &m.evidence.MemoryCurrent: read("memory.current"),
		&m.evidence.MemoryEvents: read("memory.events"), &m.evidence.PidsMax: pidsMax,
		&m.evidence.PidsCurrent: read("pids.current"), &m.evidence.PidsEvents: read("pids.events"),
		&m.evidence.CPUMax: read("cpu.max"), &m.evidence.CPUStat: cpuStat,
		&m.evidence.MemoryPeak: memoryPeak,
	} {
		if value != "" {
			*target = value
		}
	}
	if usage, ok := cgroupStatValue(cpuStat, "usage_usec"); ok {
		m.evidence.CPUUsageUsec = usage
		m.evidence.CPUUsageSource = "cgroup.v2:cpu.stat:usage_usec"
	}
	if memoryPeak != "" && memoryPeak != "max" {
		if _, err := strconv.ParseInt(memoryPeak, 10, 64); err == nil {
			m.evidence.MemoryPeakSource = "cgroup.v2:memory.peak"
		}
	}
	if m.evidence.SystemdMemoryMax != strconv.FormatInt(m.request.MemoryBytes, 10) || m.evidence.SystemdTasksMax != strconv.Itoa(m.request.Pids) {
		unit := filepath.Base(path)
		show := exec.Command("systemctl", "--user", "show", unit, "--property=MemoryMax", "--property=TasksMax", "--value")
		if output, err := show.Output(); err == nil {
			values := strings.Fields(string(output))
			if len(values) > 0 && values[0] == strconv.FormatInt(m.request.MemoryBytes, 10) {
				m.evidence.SystemdMemoryMax = values[0]
			}
			if len(values) > 1 && values[1] == strconv.Itoa(m.request.Pids) {
				m.evidence.SystemdTasksMax = values[1]
			}
		}
	}
	m.mu.Unlock()
}

func cgroupStatValue(raw, key string) (int64, bool) {
	for _, line := range strings.Split(raw, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == key {
			value, err := strconv.ParseInt(fields[1], 10, 64)
			return value, err == nil && value >= 0
		}
	}
	return 0, false
}

func findScope(sid string) string {
	target := "phase2b-" + sid + ".scope"
	found := ""
	_ = filepath.WalkDir("/sys/fs/cgroup", func(path string, entry os.DirEntry, err error) error {
		if err == nil && entry.IsDir() && entry.Name() == target {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	return found
}
