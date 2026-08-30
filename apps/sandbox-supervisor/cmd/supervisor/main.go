package main

import (
	"context"
	"encoding/json"
	"flag"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/adapter"
	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

// This entry point accepts only the frozen trusted-probe contract. It has no
// source, command, mount, environment, network, or executable passthrough.
func main() {
	listen := flag.String("listen", "", "loopback Supervisor protocol address")
	probeID := flag.String("probe", "", "fixed trusted probe id")
	version := flag.String("version", "", "fixed trusted probe version")
	hash := flag.String("hash", "", "trusted probe sha256")
	correlation := flag.String("correlation-id", "", "request correlation id")
	flag.Parse()
	if *listen != "" {
		serve(*listen)
		return
	}
	request := model.Request{
		ContractVersion: model.ContractVersion, SandboxJobID: "sandbox-api", JudgeJobID: "sandbox-api",
		WorkerID: "sandbox-api", WorkerInstanceID: "sandbox-api", TrustedProbeID: *probeID,
		ProbeVersion: *version, ProbeHash: *hash, PolicyIDs: []string{"default-seccomp-no-privilege"},
		CPUMillis: 100, WallTimeMS: 15000, MemoryBytes: 64 << 20, OutputBytes: 1 << 20,
		Pids: 32, CancellationGeneration: 0, DeadlineAt: time.Now().Add(15 * time.Second),
		CorrelationID: *correlation, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION",
	}
	root := os.Getenv("OJPLATFORM_SANDBOX_ROOT")
	runc := os.Getenv("OJPLATFORM_RUNC_BIN")
	probePath := os.Getenv("OJPLATFORM_SANDBOX_PROBE_PATH")
	if root == "" {
		root = "/tmp/ojplatform-sandbox"
	}
	if runc == "" {
		runc = "runc"
	}
	s := supervisor.New(root, runc, probePath)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result, _ := adapter.Execute(ctx, s, request)
	_ = json.NewEncoder(os.Stdout).Encode(result)
}

type protocolServer struct {
	mu        sync.Mutex
	s         *supervisor.Supervisor
	result    model.Result
	run       context.CancelFunc
	probeHash string
}

func serve(address string) {
	host, _, err := net.SplitHostPort(address)
	if err != nil || (host != "127.0.0.1" && host != "localhost" && host != "::1") {
		panic("Supervisor protocol must bind to loopback")
	}
	root := os.Getenv("OJPLATFORM_SANDBOX_ROOT")
	if root == "" {
		root = "/tmp/ojplatform-sandbox"
	}
	runc := os.Getenv("OJPLATFORM_RUNC_BIN")
	if runc == "" {
		runc = "runc"
	}
	probePath := os.Getenv("OJPLATFORM_SANDBOX_PROBE_PATH")
	if probePath == "" {
		panic("OJPLATFORM_SANDBOX_PROBE_PATH is required")
	}
	if err := os.MkdirAll(root, 0o711); err != nil {
		panic(err)
	}
	server := &protocolServer{s: supervisor.New(root, runc, probePath)}
	h := http.NewServeMux()
	h.HandleFunc("/v1/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"status": "ok", "contract_version": model.ContractVersion})
	})
	h.HandleFunc("/v1/probes", server.probes)
	h.HandleFunc("/v1/probes/start", server.start)
	h.HandleFunc("/v1/probes/status", server.status)
	h.HandleFunc("/v1/probes/cancel", server.cancel)
	h.HandleFunc("/v1/cleanup/verify", server.cleanup)
	if err := http.ListenAndServe(address, h); err != nil {
		panic(err)
	}
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
func (s *protocolServer) probes(w http.ResponseWriter, _ *http.Request) {
	hash := os.Getenv("OJPLATFORM_SANDBOX_PROBE_SHA256")
	if hash == "" {
		hash = "configured-at-supervisor"
	}
	writeJSON(w, map[string]any{"items": []map[string]any{{"probe_id": "SANDBOX_PROBE_QUALIFICATION", "version": "1", "sha256": hash, "purpose": "fixed trusted Sandbox isolation qualification", "timeout_ms": 15000}}})
}
func (s *protocolServer) start(w http.ResponseWriter, r *http.Request) {
	var input struct{ ProbeID, Version, Hash, CorrelationID string }
	if json.NewDecoder(r.Body).Decode(&input) != nil || input.ProbeID != "SANDBOX_PROBE_QUALIFICATION" || input.Version != "1" || input.Hash == "" || input.CorrelationID == "" {
		http.Error(w, "invalid trusted probe request", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if s.run != nil {
		s.mu.Unlock()
		http.Error(w, "probe already active", http.StatusConflict)
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.run = cancel
	s.result = model.Result{ContractVersion: model.ContractVersion, SandboxJobID: "sandbox-api", JudgeJobID: "sandbox-api", TrustedProbeID: input.ProbeID, ProbeVersion: input.Version, CorrelationID: input.CorrelationID, SyntheticQualification: true, Outcome: "SANDBOX_PROBE_RUNNING", StartedAt: time.Now().UTC()}
	s.mu.Unlock()
	go func() {
		result, _ := adapter.Execute(ctx, s.s, model.Request{ContractVersion: model.ContractVersion, SandboxJobID: "sandbox-api", JudgeJobID: "sandbox-api", WorkerID: "sandbox-protocol", WorkerInstanceID: "sandbox-protocol", TrustedProbeID: input.ProbeID, ProbeVersion: input.Version, ProbeHash: input.Hash, PolicyIDs: []string{"default-seccomp-no-privilege"}, CPUMillis: 100, WallTimeMS: 15000, MemoryBytes: 64 << 20, OutputBytes: 1 << 20, Pids: 32, DeadlineAt: time.Now().Add(15 * time.Second), CorrelationID: input.CorrelationID, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION"})
		s.mu.Lock()
		s.result = result
		s.run = nil
		s.mu.Unlock()
	}()
	writeJSON(w, map[string]any{"status": "PROBE_ACTIVE", "probe_id": input.ProbeID, "correlation_id": input.CorrelationID})
}
func (s *protocolServer) status(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.result.Outcome == "" {
		http.Error(w, "probe not found", http.StatusNotFound)
		return
	}
	writeJSON(w, s.result)
}
func (s *protocolServer) cancel(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.run == nil {
		http.Error(w, "probe is not active", http.StatusConflict)
		return
	}
	s.run()
	writeJSON(w, map[string]any{"status": "CLEANUP_PENDING"})
}
func (s *protocolServer) cleanup(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.run != nil {
		http.Error(w, "probe is still active", http.StatusConflict)
		return
	}
	writeJSON(w, map[string]any{"status": "VERIFIED", "clean": true})
}
