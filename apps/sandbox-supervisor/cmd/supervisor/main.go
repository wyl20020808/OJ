package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/adapter"
	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/probe"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

const (
	qualificationProbeID = "SANDBOX_PROBE_QUALIFICATION"
	cancellationProbeID  = "SANDBOX_PROBE_CANCELLATION"
	cleanupFailureID     = "SANDBOX_PROBE_CLEANUP_FAILURE"
	cpuProbeID           = "SANDBOX_PROBE_CPU_LIMIT"
	memoryProbeID        = "SANDBOX_PROBE_MEMORY_LIMIT"
	pidsProbeID          = "SANDBOX_PROBE_PIDS_LIMIT"
	outputProbeID        = "SANDBOX_PROBE_OUTPUT_LIMIT"
	workspaceProbeID     = "SANDBOX_PROBE_WORKSPACE_LIMIT"
	timeoutProbeID       = "SANDBOX_PROBE_WALL_TIMEOUT"
	crashProbeID         = "SANDBOX_PROBE_ABNORMAL_EXIT"
	concurrentProbeID    = "SANDBOX_PROBE_CONCURRENT_RESOURCES"
	cleanupFaultName     = ".qualification-cleanup-failure"
	maxExecutionRecords  = 1024
	maxRealExecutions    = 20
	executionRetention   = 15 * time.Minute
)

type probeDefinition struct {
	ID               string
	Profile          string
	Purpose          string
	Kind             string
	WallTimeMS       int
	CPUMillis        int
	MemoryBytes      int64
	Pids             int
	OutputBytes      int
	QualifiesSandbox bool
	CleanupFault     bool
	Concurrent       bool
}

func definitions(faultsEnabled bool) map[string]probeDefinition {
	items := []probeDefinition{
		{ID: qualificationProbeID, Purpose: "fixed trusted Sandbox isolation qualification", Kind: "FULL_ISOLATION", WallTimeMS: 15000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 32, OutputBytes: 1 << 20, QualifiesSandbox: true},
		{ID: cancellationProbeID, Profile: "sleep", Purpose: "fixed trusted cancellation and cleanup qualification", Kind: "CANCELLATION", WallTimeMS: 15000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10},
		{ID: cpuProbeID, Profile: "cpu", Purpose: "fixed trusted CPU constraint qualification", Kind: "CPU", WallTimeMS: 15000, CPUMillis: 10, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10},
		{ID: memoryProbeID, Profile: "memory", Purpose: "fixed trusted memory enforcement qualification", Kind: "MEMORY", WallTimeMS: 5000, CPUMillis: 100, MemoryBytes: 32 << 20, Pids: 16, OutputBytes: 64 << 10},
		{ID: pidsProbeID, Profile: "pids", Purpose: "fixed trusted pids enforcement qualification", Kind: "PIDS", WallTimeMS: 5000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10},
		{ID: outputProbeID, Profile: "output", Purpose: "fixed trusted bounded output qualification", Kind: "OUTPUT", WallTimeMS: 5000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 4096},
		{ID: workspaceProbeID, Profile: "workspace", Purpose: "fixed trusted workspace growth qualification", Kind: "WORKSPACE", WallTimeMS: 5000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10},
		{ID: timeoutProbeID, Profile: "sleep", Purpose: "fixed trusted wall timeout qualification", Kind: "WALL_TIMEOUT", WallTimeMS: 250, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10},
		{ID: crashProbeID, Profile: "crash", Purpose: "fixed trusted abnormal child exit qualification", Kind: "ABNORMAL_EXIT", WallTimeMS: 5000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10},
		{ID: concurrentProbeID, Purpose: "fixed trusted concurrent resource isolation qualification", Kind: "CONCURRENT_RESOURCES", WallTimeMS: 10000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10, Concurrent: true},
	}
	if faultsEnabled {
		items = append(items, probeDefinition{ID: cleanupFailureID, Purpose: "qualification-only deterministic cleanup verification fault", Kind: "CLEANUP_FAILURE", WallTimeMS: 5000, CPUMillis: 100, MemoryBytes: 64 << 20, Pids: 16, OutputBytes: 64 << 10, CleanupFault: true})
	}
	result := make(map[string]probeDefinition, len(items))
	for _, item := range items {
		result[item.ID] = item
	}
	return result
}

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
	request := newRequest(probeDefinition{ID: qualificationProbeID, WallTimeMS: 15000, CPUMillis: 100, MemoryBytes: 64 << 20, OutputBytes: 1 << 20, Pids: 32}, *hash, *correlation)
	request.TrustedProbeID = *probeID
	request.ProbeVersion = *version
	root, runc, probePath := runtimeConfig()
	s := supervisor.New(root, runc, probePath)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result, _ := adapter.Execute(ctx, s, request)
	_ = json.NewEncoder(os.Stdout).Encode(result)
}

type protocolResult struct {
	model.Result
	QualificationPass bool             `json:"qualification_pass"`
	QualifiesSandbox  bool             `json:"qualifies_sandbox"`
	QualificationKind string           `json:"qualification_kind"`
	Components        []protocolResult `json:"components,omitempty"`
}

type protocolServer struct {
	mu                     sync.Mutex
	root                   string
	runc                   string
	probePath              string
	probeHash              string
	definitions            map[string]probeDefinition
	result                 protocolResult
	run                    context.CancelFunc
	activeProbe            string
	realExecutionEnabled   bool
	compilerRootfs         supervisor.CompilerRootfs
	executions             map[string]*executionRecord
	executionRecordRoot    string
	executionSets          map[string]*executionSetRecord
	executionSetRecordRoot string
}

type executionRecord struct {
	RequestIdentity string                    `json:"request_identity"`
	Result          model.RealExecutionResult `json:"result"`
	run             context.CancelFunc        `json:"-"`
	Active          bool                      `json:"active"`
}

func runtimeConfig() (string, string, string) {
	root := os.Getenv("OJPLATFORM_SANDBOX_ROOT")
	if root == "" {
		root = "/tmp/ojplatform-sandbox"
	}
	runc := os.Getenv("OJPLATFORM_RUNC_BIN")
	if runc == "" {
		runc = "runc"
	}
	return root, runc, os.Getenv("OJPLATFORM_SANDBOX_PROBE_PATH")
}

func serve(address string) {
	host, _, err := net.SplitHostPort(address)
	if err != nil || (host != "127.0.0.1" && host != "localhost" && host != "::1") {
		panic("Supervisor protocol must bind to loopback")
	}
	root, runc, probePath := runtimeConfig()
	if probePath == "" {
		panic("OJPLATFORM_SANDBOX_PROBE_PATH is required")
	}
	hash, err := probe.ArtifactHash(probePath)
	if err != nil {
		panic(err)
	}
	if err := os.MkdirAll(root, 0o711); err != nil {
		panic(err)
	}
	residue, err := supervisor.AuditStartupResidue(root, nil)
	if err != nil {
		panic(fmt.Errorf("startup residue audit failed: %w", err))
	}
	if err := supervisor.CleanupStaleOwnedRuntime(runc, residue); err != nil {
		panic(fmt.Errorf("startup stale-owned cleanup failed: %w", err))
	}
	server := &protocolServer{
		root: root, runc: runc, probePath: probePath, probeHash: hash,
		definitions: definitions(os.Getenv("OJPLATFORM_SANDBOX_QUALIFICATION_FAULTS") == "true"),
		executions:  make(map[string]*executionRecord), executionRecordRoot: executionRecordRoot(root),
		executionSets: make(map[string]*executionSetRecord), executionSetRecordRoot: executionSetRecordRoot(root),
	}
	if err := server.loadExecutionRecords(); err != nil {
		panic(fmt.Errorf("execution record recovery failed: %w", err))
	}
	if err := server.loadExecutionSetRecords(); err != nil {
		panic(fmt.Errorf("execution-set record recovery failed: %w", err))
	}
	if os.Getenv("OJPLATFORM_REAL_EXECUTION_ENABLED") == "true" {
		compilerPath := os.Getenv("OJPLATFORM_CPP20_ROOTFS")
		compilerIdentity := os.Getenv("OJPLATFORM_CPP20_ROOTFS_IDENTITY")
		versionBytes, versionErr := os.ReadFile(compilerPath + ".compiler-version.txt")
		if compilerPath == "" || compilerIdentity == "" || versionErr != nil {
			panic("real execution compiler rootfs configuration is incomplete")
		}
		server.compilerRootfs = supervisor.CompilerRootfs{ProfileID: supervisor.CPP20ProfileID, Path: compilerPath, Identity: compilerIdentity, CompilerVersion: strings.TrimSpace(string(versionBytes)), CommandTemplateSHA: supervisor.CompilerCommandTemplateSHA256()}
		if err := supervisor.VerifyCompilerRootfsContent(server.compilerRootfs); err != nil {
			panic(err)
		}
		server.compilerRootfs.Trusted = true
		preflightCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := supervisor.New(root, runc, probePath).PreflightRealExecution(preflightCtx, server.compilerRootfs); err != nil {
			panic(err)
		}
		server.realExecutionEnabled = true
	}
	h := http.NewServeMux()
	h.HandleFunc("/v1/health", server.health)
	h.HandleFunc("/v1/probes", server.probes)
	h.HandleFunc("/v1/probes/start", server.start)
	h.HandleFunc("/v1/probes/status", server.status)
	h.HandleFunc("/v1/probes/cancel", server.cancel)
	h.HandleFunc("/v1/cleanup/verify", server.cleanup)
	h.HandleFunc("/v1/cleanup/recover", server.recoverCleanup)
	h.HandleFunc("/v1/executions/capabilities", server.executionCapabilities)
	h.HandleFunc("/v1/executions/start", server.startExecution)
	h.HandleFunc("/v1/executions/status", server.executionStatus)
	h.HandleFunc("/v1/executions/cancel", server.cancelExecution)
	h.HandleFunc("/v1/execution-sets/start", server.startExecutionSet)
	h.HandleFunc("/v1/execution-sets/status", server.executionSetStatus)
	h.HandleFunc("/v1/execution-sets/cancel", server.cancelExecutionSet)
	httpServer := &http.Server{Addr: address, Handler: h, ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 30 * time.Second}
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}

func requireMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	return false
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

func (s *protocolServer) health(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, map[string]any{"status": "ok", "contract_version": model.ContractVersion, "execution_contract_version": model.ExecutionContractVersion, "execution_set_contract_version": model.ExecutionSetContractVersion, "real_submission_execution": s.realExecutionEnabled, "language_profiles": enabledLanguageProfiles(s.realExecutionEnabled), "supervisor_uid": os.Geteuid(), "supervisor_gid": os.Getegid()})
}

func enabledLanguageProfiles(enabled bool) []string {
	if enabled {
		return []string{supervisor.CPP20ProfileID}
	}
	return []string{}
}

func (s *protocolServer) executionCapabilities(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	response := map[string]any{
		"protocol_version":          model.ExecutionContractVersion,
		"real_submission_execution": s.realExecutionEnabled,
		"language_profiles":         enabledLanguageProfiles(s.realExecutionEnabled),
	}
	if s.realExecutionEnabled {
		response["compiler_rootfs_identity"] = s.compilerRootfs.Identity
		response["compiler_version"] = strings.Split(s.compilerRootfs.CompilerVersion, "\n")[0]
		response["command_template_sha256"] = supervisor.CompilerCommandTemplateSHA256()
		response["compile_limits"] = supervisor.CompileResourceLimits()
		response["runtime_limits"] = supervisor.RuntimeResourceLimits()
	}
	writeJSON(w, response)
}

func decodeStrict(w http.ResponseWriter, r *http.Request, target any, maxBytes int64) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("multiple request values rejected")
	}
	return nil
}

func (s *protocolServer) startExecution(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !s.realExecutionEnabled {
		http.Error(w, "real submission execution disabled", http.StatusForbidden)
		return
	}
	var request model.RealExecutionRequest
	if err := decodeStrict(w, r, &request, 140<<20); err != nil {
		http.Error(w, "invalid real execution request", http.StatusBadRequest)
		return
	}
	if err := supervisor.ValidateRealExecutionRequest(request); err != nil {
		http.Error(w, "real execution request rejected", http.StatusBadRequest)
		return
	}
	requestIdentity := realExecutionRequestIdentity(request)
	s.mu.Lock()
	s.pruneExecutionRecords(time.Now())
	if existing := s.executions[request.ExecutionRequestID]; existing != nil {
		if existing.RequestIdentity != requestIdentity {
			s.mu.Unlock()
			http.Error(w, "execution request identity conflict", http.StatusConflict)
			return
		}
		active := existing.Active
		s.mu.Unlock()
		status := http.StatusOK
		state := "COMPLETED"
		if active {
			status = http.StatusAccepted
			state = "ACTIVE"
		}
		w.WriteHeader(status)
		writeJSON(w, map[string]any{"status": state, "execution_request_id": request.ExecutionRequestID})
		return
	}
	if len(s.executions) >= maxExecutionRecords {
		s.mu.Unlock()
		http.Error(w, "execution record capacity reached", http.StatusTooManyRequests)
		return
	}
	active := 0
	for _, execution := range s.executions {
		if execution.Active {
			active++
		}
	}
	if active >= maxRealExecutions {
		s.mu.Unlock()
		http.Error(w, "execution concurrency limit", http.StatusTooManyRequests)
		return
	}
	ctx, cancel := context.WithDeadline(context.Background(), request.DeadlineAt)
	identity := executionIdentityForRecord(request)
	s.executions[request.ExecutionRequestID] = &executionRecord{RequestIdentity: requestIdentity, Result: identity, run: cancel, Active: true}
	if err := s.persistExecutionRecord(request.ExecutionRequestID); err != nil {
		delete(s.executions, request.ExecutionRequestID)
		cancel()
		s.mu.Unlock()
		http.Error(w, "execution record persistence failed", http.StatusInternalServerError)
		return
	}
	s.mu.Unlock()
	go s.executeReal(ctx, request)
	w.WriteHeader(http.StatusAccepted)
	writeJSON(w, map[string]any{"status": "ACTIVE", "execution_request_id": request.ExecutionRequestID})
}

func (s *protocolServer) pruneExecutionRecords(now time.Time) {
	for id, record := range s.executions {
		if record.Active || record.Result.CompletedAt.IsZero() {
			continue
		}
		if now.Sub(record.Result.CompletedAt) >= executionRetention {
			delete(s.executions, id)
			_ = os.Remove(s.executionRecordPath(id))
		}
	}
}

func realExecutionRequestIdentity(request model.RealExecutionRequest) string {
	encoded, _ := json.Marshal(request)
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func executionIdentityForRecord(request model.RealExecutionRequest) model.RealExecutionResult {
	return model.RealExecutionResult{
		ProtocolVersion: model.ExecutionContractVersion, ExecutionRequestID: request.ExecutionRequestID,
		JudgeJobID: request.JudgeJobID, SubmissionID: request.SubmissionID, Attempt: request.Attempt,
		ExecutionAttemptID: request.ExecutionRequestID + ":attempt", CompileAttemptID: request.ExecutionRequestID + ":compile",
		RuntimeAttemptID: request.ExecutionRequestID + ":runtime", ResultGeneration: int64(request.Attempt),
		CorrelationID: request.CorrelationID, LanguageProfileID: request.LanguageProfileID,
		SourceSHA256: request.SourceSHA256, StartedAt: time.Now().UTC(),
	}
}

func executionRecordRoot(sandboxRoot string) string {
	if configured := os.Getenv("OJPLATFORM_EXECUTION_RECORD_ROOT"); configured != "" {
		return configured
	}
	return sandboxRoot + "-execution-records"
}

func (s *protocolServer) executionRecordPath(id string) string {
	digest := sha256.Sum256([]byte(id))
	return filepath.Join(s.executionRecordRoot, hex.EncodeToString(digest[:])+".json")
}

func (s *protocolServer) persistExecutionRecord(id string) error {
	record := s.executions[id]
	if record == nil {
		return errors.New("execution record missing")
	}
	if err := os.MkdirAll(s.executionRecordRoot, 0o700); err != nil {
		return err
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		return err
	}
	target := s.executionRecordPath(id)
	if existing, readErr := os.ReadFile(target); readErr == nil {
		var prior executionRecord
		if json.Unmarshal(existing, &prior) == nil && !prior.Active && !record.Active && prior.Result.ExecutionRecord != nil && record.Result.ExecutionRecord != nil && prior.Result.ExecutionRecord.Digest != record.Result.ExecutionRecord.Digest {
			return errors.New("immutable execution record conflict")
		}
	}
	temporary, err := os.CreateTemp(s.executionRecordRoot, ".record-")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err = temporary.Chmod(0o600); err == nil {
		_, err = temporary.Write(encoded)
	}
	if err == nil {
		err = temporary.Sync()
	}
	if closeErr := temporary.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(temporaryPath, target)
}

func (s *protocolServer) loadExecutionRecords() error {
	if err := os.MkdirAll(s.executionRecordRoot, 0o700); err != nil {
		return err
	}
	entries, err := os.ReadDir(s.executionRecordRoot)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(s.executionRecordRoot, entry.Name()))
		if readErr != nil {
			return readErr
		}
		var record executionRecord
		if json.Unmarshal(data, &record) != nil || record.RequestIdentity == "" || record.Result.ExecutionRequestID == "" {
			return errors.New("malformed persisted execution record")
		}
		id := record.Result.ExecutionRequestID
		if record.Active {
			record.Active = false
			record.Result.PipelineOutcome = supervisor.PipelineInfraFailure
			record.Result.Compile = model.StageResult{Outcome: supervisor.CompileInfraFailure, State: model.StateInfraFailed, DiagnosticCode: "SUPERVISOR_RESTART", Clean: true, Facts: model.RawExecutionFacts{SandboxSetupFailed: true, RuntimeInfraFailed: true, CleanupVerified: true}}
			record.Result.Runtime = nil
			record.Result.Artifact = nil
			record.Result.Clean = true
			record.Result.CompletedAt = time.Now().UTC()
		}
		s.executions[id] = &record
		if err := s.persistExecutionRecord(id); err != nil {
			return err
		}
	}
	return nil
}

func (s *protocolServer) executeReal(ctx context.Context, request model.RealExecutionRequest) {
	runtime := supervisor.New(s.root, s.runc, s.probePath)
	result, _ := runtime.ExecuteCPP20(ctx, request, s.compilerRootfs)
	s.mu.Lock()
	record := s.executions[request.ExecutionRequestID]
	if record != nil && record.Active {
		record.Result = result
		record.run = nil
		record.Active = false
		_ = s.persistExecutionRecord(request.ExecutionRequestID)
	}
	s.mu.Unlock()
}

func (s *protocolServer) executionStatus(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	id := r.URL.Query().Get("execution_request_id")
	s.mu.Lock()
	record := s.executions[id]
	if record == nil {
		s.mu.Unlock()
		http.Error(w, "execution not found", http.StatusNotFound)
		return
	}
	active := record.Active
	result := record.Result
	s.mu.Unlock()
	if active {
		writeJSON(w, map[string]any{"status": "ACTIVE", "execution_request_id": id})
		return
	}
	writeJSON(w, result)
}

func (s *protocolServer) cancelExecution(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	var input struct {
		ExecutionRequestID string `json:"execution_request_id"`
	}
	if err := decodeStrict(w, r, &input, 4096); err != nil || input.ExecutionRequestID == "" {
		http.Error(w, "invalid execution cancellation", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	record := s.executions[input.ExecutionRequestID]
	if record == nil || !record.Active || record.run == nil {
		s.mu.Unlock()
		http.Error(w, "execution is not active", http.StatusConflict)
		return
	}
	record.run()
	s.mu.Unlock()
	writeJSON(w, map[string]any{"status": "CANCELLATION_PENDING", "execution_request_id": input.ExecutionRequestID})
}

func (s *protocolServer) probes(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	items := make([]map[string]any, 0, len(s.definitions))
	for _, item := range s.definitions {
		items = append(items, map[string]any{"probe_id": item.ID, "version": probe.Version, "sha256": s.probeHash, "purpose": item.Purpose, "timeout_ms": item.WallTimeMS})
	}
	writeJSON(w, map[string]any{"items": items})
}

func (s *protocolServer) start(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	var input struct {
		ProbeID       string `json:"probe_id"`
		Version       string `json:"version"`
		Hash          string `json:"hash"`
		CorrelationID string `json:"correlation_id"`
	}
	if json.NewDecoder(r.Body).Decode(&input) != nil || input.CorrelationID == "" {
		http.Error(w, "invalid trusted probe request", http.StatusBadRequest)
		return
	}
	definition, found := s.definitions[input.ProbeID]
	if !found || input.Version != probe.Version || input.Hash != s.probeHash {
		http.Error(w, "invalid trusted probe request", http.StatusBadRequest)
		return
	}
	if !cleanRoot(s.root) {
		http.Error(w, "cleanup recovery required", http.StatusConflict)
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
	s.activeProbe = input.ProbeID
	s.result = protocolResult{Result: model.Result{ContractVersion: model.ContractVersion, SandboxJobID: "sandbox-api", JudgeJobID: "sandbox-api", TrustedProbeID: input.ProbeID, ProbeVersion: probe.Version, CorrelationID: input.CorrelationID, SyntheticQualification: true, Outcome: "SANDBOX_PROBE_RUNNING", StartedAt: time.Now().UTC()}, QualificationKind: definition.Kind, QualifiesSandbox: definition.QualifiesSandbox}
	s.mu.Unlock()
	go s.execute(ctx, definition, input.CorrelationID)
	w.WriteHeader(http.StatusAccepted)
	writeJSON(w, map[string]any{"status": "PROBE_ACTIVE", "probe_id": input.ProbeID, "correlation_id": input.CorrelationID})
}

func newRequest(definition probeDefinition, hash, correlation string) model.Request {
	identity := strconv.FormatInt(time.Now().UnixNano(), 10)
	return model.Request{
		ContractVersion: model.ContractVersion, SandboxJobID: "sandbox-api-" + identity, JudgeJobID: "sandbox-api-" + identity,
		WorkerID: "sandbox-protocol", WorkerInstanceID: "sandbox-protocol", TrustedProbeID: probe.ID,
		ProbeVersion: probe.Version, ProbeHash: hash, PolicyIDs: []string{"default-seccomp-no-privilege"},
		CPUMillis: definition.CPUMillis, WallTimeMS: definition.WallTimeMS, MemoryBytes: definition.MemoryBytes,
		OutputBytes: definition.OutputBytes, Pids: definition.Pids, DeadlineAt: time.Now().Add(time.Duration(definition.WallTimeMS+5000) * time.Millisecond),
		CorrelationID: correlation, ExecutionMode: "SANDBOX_PROBE_QUALIFICATION",
	}
}

func (s *protocolServer) execute(ctx context.Context, definition probeDefinition, correlation string) {
	var result protocolResult
	if definition.Concurrent {
		result = s.executeConcurrent(ctx, definition, correlation)
	} else {
		result = s.executeOne(ctx, definition, correlation)
	}
	s.mu.Lock()
	s.result = result
	s.run = nil
	s.activeProbe = ""
	s.mu.Unlock()
}

func (s *protocolServer) executeOne(ctx context.Context, definition probeDefinition, correlation string) protocolResult {
	runtime, err := supervisor.NewWithTrustedProfile(s.root, s.runc, s.probePath, definition.Profile)
	if err != nil {
		return protocolResult{Result: model.Result{TrustedProbeID: definition.ID, Outcome: supervisor.RejectedOutcome, Diagnostic: "trusted qualification profile rejected", Clean: true, CompletedAt: time.Now().UTC()}, QualificationKind: definition.Kind}
	}
	result, _ := adapter.Execute(ctx, runtime, newRequest(definition, s.probeHash, correlation))
	result.TrustedProbeID = definition.ID
	pass := expectedPass(definition, result)
	if definition.CleanupFault && pass {
		if err := os.WriteFile(filepath.Join(s.root, cleanupFaultName), []byte("qualification-only cleanup verification fault"), 0o600); err != nil {
			result.Diagnostic = "cleanup fault fixture setup failed"
		} else {
			result.Clean = false
			result.Outcome = supervisor.CleanupFailureOutcome
			result.Diagnostic = "qualification cleanup verification failure injected"
		}
		pass = false
	}
	return protocolResult{Result: result, QualificationPass: pass, QualifiesSandbox: definition.QualifiesSandbox && pass, QualificationKind: definition.Kind}
}

func (s *protocolServer) executeConcurrent(ctx context.Context, definition probeDefinition, correlation string) protocolResult {
	memory := s.definitions[memoryProbeID]
	pids := s.definitions[pidsProbeID]
	pids.Pids = 8
	results := make(chan protocolResult, 2)
	go func() { results <- s.executeOne(ctx, memory, correlation+"-memory") }()
	go func() { results <- s.executeOne(ctx, pids, correlation+"-pids") }()
	components := []protocolResult{<-results, <-results}
	clean := components[0].Clean && components[1].Clean
	pass := components[0].QualificationPass && components[1].QualificationPass && clean
	result := model.Result{ContractVersion: model.ContractVersion, SandboxJobID: "sandbox-api-concurrent", JudgeJobID: "sandbox-api-concurrent", TrustedProbeID: definition.ID, ProbeVersion: probe.Version, CorrelationID: correlation, SyntheticQualification: true, StartedAt: time.Now().UTC(), CompletedAt: time.Now().UTC(), Clean: clean}
	if pass {
		result.Outcome = supervisor.ProbeOutcome
	} else if clean {
		result.Outcome = supervisor.UnqualifiedOutcome
		result.Diagnostic = "concurrent resource qualification did not satisfy kernel evidence"
	} else {
		result.Outcome = supervisor.CleanupFailureOutcome
		result.Diagnostic = "concurrent resource qualification failed"
	}
	return protocolResult{Result: result, QualificationPass: pass, QualificationKind: definition.Kind, Components: components}
}

func eventHit(value string, names ...string) bool {
	for _, line := range strings.Split(value, "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		for _, name := range names {
			if fields[0] == name {
				count, _ := strconv.ParseInt(fields[1], 10, 64)
				if count > 0 {
					return true
				}
			}
		}
	}
	return false
}

func expectedPass(definition probeDefinition, result model.Result) bool {
	if !result.Clean {
		return false
	}
	switch definition.Kind {
	case "FULL_ISOLATION":
		return result.Outcome == supervisor.ProbeOutcome
	case "CANCELLATION":
		return result.Outcome == supervisor.CancelledOutcome
	case "CPU":
		return result.Outcome == supervisor.ProbeOutcome && result.Evidence != nil && result.Evidence.CPUMax != "" && !strings.HasPrefix(result.Evidence.CPUMax, "max")
	case "MEMORY":
		return result.Evidence != nil && result.Evidence.MemoryMax == strconv.FormatInt(definition.MemoryBytes, 10) && eventHit(result.Evidence.MemoryEvents, "max", "oom", "oom_kill")
	case "PIDS":
		return result.Evidence != nil && result.Evidence.PidsMax == strconv.Itoa(definition.Pids) && eventHit(result.Evidence.PidsEvents, "max")
	case "OUTPUT":
		return result.Outcome == "SANDBOX_OUTPUT_LIMIT"
	case "WORKSPACE":
		return result.Outcome == supervisor.ProbeOutcome && strings.Contains(result.Stdout, `"workspace/growth-denied":true`)
	case "WALL_TIMEOUT":
		return result.Outcome == "SANDBOX_WALL_LIMIT"
	case "ABNORMAL_EXIT":
		return result.Outcome == "SANDBOX_RUNTIME_ERROR"
	case "CLEANUP_FAILURE":
		return result.Outcome == supervisor.ProbeOutcome
	default:
		return false
	}
}

func (s *protocolServer) status(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	probeID := r.URL.Query().Get("probe_id")
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.result.Outcome == "" || probeID == "" || s.result.TrustedProbeID != probeID {
		http.Error(w, "probe not found", http.StatusNotFound)
		return
	}
	writeJSON(w, s.result)
}

func (s *protocolServer) cancel(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	var input struct {
		ProbeID string `json:"probe_id"`
	}
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		http.Error(w, "invalid cancellation request", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.run == nil || input.ProbeID == "" || input.ProbeID != s.activeProbe {
		http.Error(w, "probe is not active", http.StatusConflict)
		return
	}
	s.run()
	writeJSON(w, map[string]any{"status": "CLEANUP_PENDING", "probe_id": input.ProbeID})
}

func cleanRoot(root string) bool {
	entries, err := os.ReadDir(root)
	return err == nil && len(entries) == 0
}

func (s *protocolServer) cleanup(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	s.mu.Lock()
	active := s.run != nil
	s.mu.Unlock()
	if active {
		http.Error(w, "probe is still active", http.StatusConflict)
		return
	}
	clean := cleanRoot(s.root)
	status := "FAILED"
	failureCategory := "QUALIFICATION_CLEANUP_FAILURE"
	if clean {
		status = "VERIFIED"
		failureCategory = ""
	}
	writeJSON(w, map[string]any{"status": status, "clean": clean, "failure_category": failureCategory})
}

func (s *protocolServer) recoverCleanup(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	s.mu.Lock()
	active := s.run != nil
	s.mu.Unlock()
	if active {
		http.Error(w, "probe is still active", http.StatusConflict)
		return
	}
	marker := filepath.Join(s.root, cleanupFaultName)
	if err := os.Remove(marker); err != nil && !errors.Is(err, os.ErrNotExist) {
		http.Error(w, "cleanup recovery failed", http.StatusConflict)
		return
	}
	if !cleanRoot(s.root) {
		http.Error(w, "cleanup recovery incomplete", http.StatusConflict)
		return
	}
	writeJSON(w, map[string]any{"status": "VERIFIED", "clean": true})
}

func init() {
	if filepath.Base(cleanupFaultName) != cleanupFaultName {
		panic(fmt.Sprintf("invalid fixed cleanup fault name %q", cleanupFaultName))
	}
}
