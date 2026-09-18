package worker

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ojplatform/judge-worker/internal/artifact"
	"github.com/ojplatform/judge-worker/internal/config"
	"github.com/ojplatform/judge-worker/internal/fixture"
	"github.com/ojplatform/judge-worker/internal/nodeclient"
	"github.com/ojplatform/judge-worker/internal/protocol"
	"github.com/ojplatform/judge-worker/internal/queueadapter"
	"github.com/ojplatform/judge-worker/internal/supervisorclient"
	"github.com/ojplatform/judge-worker/internal/verdict"
)

type State string

const (
	Starting        State = "STARTING"
	ConfigValidated State = "CONFIG_VALIDATED"
	Ready           State = "READY"
	Claiming        State = "CLAIMING"
	Busy            State = "BUSY"
	Degraded        State = "DEGRADED"
	Draining        State = "DRAINING"
	Stopping        State = "STOPPING"
	Stopped         State = "STOPPED"
)

type Worker struct {
	Config                        config.Config
	WorkerID                      string
	InstanceID                    string
	Capabilities                  protocol.Capabilities
	Queue                         queueadapter.Queue
	Executor                      fixture.Executor
	Supervisor                    *supervisorclient.Client
	NodeClient                    *nodeclient.Client
	Artifacts                     *artifact.Client
	state                         atomic.Value
	active                        atomic.Int32
	controlPlaneReady             atomic.Bool
	redisReady                    atomic.Bool
	supervisorReady               atomic.Bool
	shutdownOnce                  sync.Once
	stopOnce                      sync.Once
	drain                         chan struct{}
	stop                          chan struct{}
	logger                        *log.Logger
	cancelMu                      sync.Mutex
	cancelJobs                    map[string]context.CancelFunc
	cancellationObservationErrors map[string]struct{}
}

func New(cfg config.Config, redis *queueadapter.Client, logger *log.Logger) *Worker {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		panic("worker instance identity unavailable")
	}
	instance := fmt.Sprintf("%x", bytes[:])
	if cfg.NodeIncarnation != "" {
		instance = cfg.NodeIncarnation
	}
	if logger == nil {
		logger = log.Default()
	}
	var supervisor *supervisorclient.Client
	if cfg.RealSubmissionExecution {
		supervisor, _ = supervisorclient.New(cfg.SupervisorURL)
	}
	var nodeService *nodeclient.Client
	if cfg.JudgeServiceURL != "" {
		nodeService = &nodeclient.Client{BaseURL: cfg.JudgeServiceURL, Token: cfg.JudgeNodeToken}
	}
	w := &Worker{Config: cfg, WorkerID: cfg.WorkerID, InstanceID: instance, Capabilities: protocol.NewCapabilities(cfg.WorkerID, instance, cfg.BuildVersion, cfg.MaxConcurrency, cfg.RealSubmissionExecution), Queue: queueadapter.Queue{Redis: redis, Prefix: cfg.QueuePrefix}, Executor: fixture.Executor{}, Supervisor: supervisor, NodeClient: nodeService, drain: make(chan struct{}), stop: make(chan struct{}), logger: logger, cancelJobs: make(map[string]context.CancelFunc), cancellationObservationErrors: make(map[string]struct{})}
	w.state.Store(State(Starting))
	w.controlPlaneReady.Store(nodeService == nil)
	w.supervisorReady.Store(!cfg.RealSubmissionExecution)
	return w
}

type DependencyReadiness struct {
	ControlPlane bool `json:"control_plane"`
	Redis        bool `json:"redis"`
	Supervisor   bool `json:"supervisor"`
}

func (w *Worker) Readiness() DependencyReadiness {
	return DependencyReadiness{ControlPlane: w.controlPlaneReady.Load(), Redis: w.redisReady.Load(), Supervisor: w.supervisorReady.Load()}
}
func (w *Worker) dependenciesReady() bool {
	readiness := w.Readiness()
	return readiness.ControlPlane && readiness.Redis && readiness.Supervisor
}
func (w *Worker) State() State {
	if v := w.state.Load(); v != nil {
		return v.(State)
	}
	return Starting
}
func (w *Worker) setState(s State) {
	w.state.Store(s)
	w.logger.Printf(`{"event":"worker_state","state":%q,"worker_id":%q,"worker_instance_id":%q,"active":%d}`, s, w.WorkerID, w.InstanceID, w.active.Load())
}
func (w *Worker) setStateIfChanged(s State) {
	if w.State() != s {
		w.setState(s)
	}
}
func (w *Worker) refreshDependencyState() {
	state := w.State()
	if state == Draining || state == Stopping || state == Stopped {
		return
	}
	if !w.dependenciesReady() {
		w.setStateIfChanged(Degraded)
		return
	}
	if w.active.Load() > 0 {
		w.setStateIfChanged(Busy)
		return
	}
	w.setStateIfChanged(Claiming)
}
func (w *Worker) Heartbeat() protocol.Capabilities { return w.Capabilities }
func (w *Worker) Start(ctx context.Context) error {
	w.setState(ConfigValidated)
	if w.Config.RealSubmissionExecution {
		if w.Supervisor == nil {
			w.setState(Degraded)
			return errors.New("real execution Supervisor unavailable")
		}
		preflightCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := w.Supervisor.Preflight(preflightCtx)
		cancel()
		if err != nil {
			w.supervisorReady.Store(false)
			w.setState(Degraded)
			return fmt.Errorf("real execution preflight failed: %w", err)
		}
		w.supervisorReady.Store(true)
	}
	if w.Queue.Redis == nil {
		w.setState(Degraded)
		return errors.New("Worker Redis unavailable")
	}
	if err := w.Queue.Redis.Connect(ctx); err != nil {
		w.redisReady.Store(false)
		w.setState(Degraded)
	} else {
		w.redisReady.Store(true)
		w.setState(Ready)
	}
	if w.NodeClient != nil {
		if w.Config.ArtifactDataURL != "" {
			var err error
			w.Artifacts, err = artifact.NewClient(w.Config.ArtifactDataURL, w.Config.ArtifactReadToken)
			if err != nil {
				return err
			}
			if err := w.Supervisor.EnableArtifacts(ctx, w.Config.SupervisorArtifactToken); err != nil {
				return err
			}
		}
		if err := w.NodeClient.Register(ctx, nodeclient.Registration{NodeID: w.WorkerID, Incarnation: w.InstanceID, RuntimeVersion: w.Config.BuildVersion, MaxConcurrentJobs: w.Config.MaxConcurrency, RealExecution: w.Config.RealSubmissionExecution, ArtifactExecution: w.Artifacts != nil}); err != nil {
			w.controlPlaneReady.Store(false)
			w.setState(Degraded)
			return fmt.Errorf("judge node registration failed: %w", err)
		}
		w.controlPlaneReady.Store(true)
	}
	w.refreshDependencyState()
	go w.heartbeat(ctx)
	go w.claimLoop(ctx)
	return nil
}
func (w *Worker) heartbeat(ctx context.Context) {
	t := time.NewTicker(time.Duration(w.Config.HeartbeatIntervalMS) * time.Millisecond)
	defer t.Stop()
	w.emitHeartbeat()
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stop:
			return
		case <-t.C:
			w.emitHeartbeat()
		}
	}
}
func (w *Worker) emitHeartbeat() {
	if w.NodeClient != nil {
		if err := w.NodeClient.Heartbeat(context.Background(), w.WorkerID, w.InstanceID, int(w.active.Load())); err != nil {
			w.controlPlaneReady.Store(false)
			w.logger.Printf(`{"event":"node_heartbeat_error","worker_id":%q}`, w.WorkerID)
		} else {
			w.controlPlaneReady.Store(true)
		}
	}
	if w.Config.RealSubmissionExecution && w.Supervisor != nil {
		preflightCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := w.Supervisor.Preflight(preflightCtx)
		cancel()
		if err != nil {
			w.supervisorReady.Store(false)
			w.logger.Printf(`{"event":"worker_supervisor_preflight_error","worker_id":%q}`, w.WorkerID)
		} else {
			w.supervisorReady.Store(true)
		}
	}
	payload := map[string]any{"worker_id": w.WorkerID, "worker_instance_id": w.InstanceID, "protocol_version": protocol.Version, "build_version": w.Config.BuildVersion, "state": w.State(), "max_concurrency": w.Config.MaxConcurrency, "active_job_count": w.active.Load(), "safe_fixture": true, "real_sandboxed_execution": w.Capabilities.RealSandboxedExecution, "sandbox_qualified": w.Capabilities.SandboxQualified, "language_capabilities": w.Capabilities.LanguageCapabilities, "execution_modes": w.Capabilities.ExecutionModes, "heartbeat_at": time.Now().UTC().Format(time.RFC3339Nano)}
	if w.Capabilities.RealProtocolVersion != "" {
		payload["real_execution_protocol_version"] = w.Capabilities.RealProtocolVersion
	}
	if w.Queue.Redis != nil {
		encoded, _ := json.Marshal(payload)
		if err := w.Queue.Redis.Set(context.Background(), w.Config.HeartbeatPrefix+":"+w.WorkerID+":"+w.InstanceID, string(encoded), time.Duration(w.Config.LivenessTimeoutMS)*time.Millisecond); err != nil {
			w.redisReady.Store(false)
			_ = w.Queue.Redis.Close()
			w.logger.Printf(`{"event":"worker_heartbeat_error","worker_id":%q,"worker_instance_id":%q}`, w.WorkerID, w.InstanceID)
		} else {
			w.redisReady.Store(true)
		}
	}
	w.refreshDependencyState()
	w.logger.Printf(`{"event":"worker_heartbeat","worker_id":%q,"worker_instance_id":%q,"protocol_version":%q,"build_version":%q,"state":%q,"max_concurrency":%d,"active":%d,"safe_fixture":true}`, w.WorkerID, w.InstanceID, protocol.Version, w.Config.BuildVersion, w.State(), w.Config.MaxConcurrency, w.active.Load())
}
func (w *Worker) claimLoop(ctx context.Context) {
	backoff := 25 * time.Millisecond
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stop:
			return
		case <-w.drain:
			return
		default:
		}
		if !w.dependenciesReady() {
			w.setStateIfChanged(Degraded)
			time.Sleep(backoff)
			continue
		}
		if int(w.active.Load()) >= w.Config.MaxConcurrency {
			time.Sleep(backoff)
			continue
		}
		w.setStateIfChanged(Claiming)
		var lease *queueadapter.Lease
		var err error
		if w.NodeClient != nil {
			claim, claimErr := w.NodeClient.Claim(ctx, w.WorkerID, w.InstanceID)
			err = claimErr
			if claim != nil {
				lease = &queueadapter.Lease{Job: claim.Job, Token: claim.LeaseToken, AssignmentID: claim.Assignment.AssignmentID}
			}
		} else {
			lease, err = w.Queue.Claim(ctx, w.InstanceID, time.Duration(w.Config.LeaseMS)*time.Millisecond)
		}
		if err != nil {
			if w.NodeClient != nil {
				w.controlPlaneReady.Store(false)
			} else {
				w.redisReady.Store(false)
				if w.Queue.Redis != nil {
					_ = w.Queue.Redis.Close()
				}
			}
			w.refreshDependencyState()
			w.logger.Printf(`{"event":"worker_queue_error","worker_id":%q,"error":%q}`, w.WorkerID, err.Error())
			time.Sleep(backoff)
			if w.NodeClient == nil && w.Queue.Redis != nil && w.Queue.Redis.Connect(ctx) == nil {
				w.redisReady.Store(true)
				w.refreshDependencyState()
			}
			continue
		}
		if w.NodeClient != nil {
			w.controlPlaneReady.Store(true)
		} else {
			w.redisReady.Store(true)
		}
		if lease == nil {
			time.Sleep(backoff)
			continue
		}
		w.active.Add(1)
		w.setState(Busy)
		go w.process(ctx, *lease)
	}
}
func (w *Worker) process(parent context.Context, lease queueadapter.Lease) {
	defer func() {
		w.active.Add(-1)
		if w.State() == Busy {
			w.setState(Claiming)
		}
	}()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	go w.observeCancellation(ctx, lease, cancel)
	w.cancelMu.Lock()
	w.cancelJobs[lease.Job.ID] = cancel
	w.cancelMu.Unlock()
	defer func() {
		w.cancelMu.Lock()
		delete(w.cancelJobs, lease.Job.ID)
		delete(w.cancellationObservationErrors, lease.AssignmentID)
		w.cancelMu.Unlock()
	}()
	if lease.Job.ExecutionMode == string(protocol.RealSandboxedExecution) {
		w.processReal(ctx, parent, lease)
		return
	}
	fixtureID := lease.Job.FixtureID
	if fixtureID == "" {
		fixtureID = "FX-SUCCESS"
	}
	request := protocol.ExecutionRequest{ProtocolVersion: protocol.Version, JudgeJobID: lease.Job.ID, SubmissionID: lease.Job.SubmissionID, Attempt: lease.Job.Attempt, CorrelationID: lease.Job.ID, ProblemRevisionID: lease.Job.ProblemRevisionID, TestdataVersionRef: lease.Job.TestdataVersionRef, LanguageID: lease.Job.LanguageID, SourceSnapshotRef: "opaque:" + lease.Job.SubmissionID, SourceSHA256: protocol.SourceDigest([]byte(lease.Job.SubmissionID)), Limits: protocol.Limits{TimeMS: 5000, MemoryMB: 128, OutputBytes: 1048576, Processes: 1}, ExecutionMode: protocol.SafeFixtureQualification, FixtureID: fixtureID, DeadlineAt: time.Now().Add(5 * time.Second), CancellationGeneration: 0}
	if err := request.Validate(time.Now(), w.Capabilities); err != nil {
		_ = w.failTerminal(parent, lease, "WORKER_PROTOCOL_ERROR")
		return
	}
	outcome, code, err := w.Executor.Run(ctx, request.FixtureID)
	if err != nil && outcome == protocol.Cancelled {
		w.cancelLease(parent, lease)
		return
	}
	switch outcome {
	case protocol.SafeFixtureSucceeded:
		_ = w.completeFixture(parent, lease)
	case protocol.SafeFixtureFailedRetryable:
		_ = w.retry(parent, lease, code)
	case protocol.SafeFixtureFailedTerminal:
		_ = w.failTerminal(parent, lease, code)
	default:
		_ = w.failTerminal(parent, lease, "WORKER_PROTOCOL_ERROR")
	}
}

func (w *Worker) processReal(ctx, queueCtx context.Context, lease queueadapter.Lease) {
	if !w.Config.RealSubmissionExecution || w.Supervisor == nil || !w.Capabilities.Supports(protocol.RealSandboxedExecution) {
		_ = w.failTerminal(queueCtx, lease, "WORKER_CAPABILITY_MISMATCH")
		return
	}
	if lease.Job.JudgeArtifact != nil || lease.Job.JobContract != "" {
		w.processRealArtifact(ctx, queueCtx, lease)
		return
	}
	if lease.Job.TestcaseSet != nil {
		w.processRealSet(ctx, queueCtx, lease)
		return
	}
	deadline := lease.Job.LeaseExpiresAt.Add(-100 * time.Millisecond)
	if !deadline.After(time.Now()) {
		_ = w.retry(queueCtx, lease, "EXECUTION_DEADLINE_UNAVAILABLE")
		return
	}
	request := supervisorclient.Request{
		ProtocolVersion: supervisorclient.ProtocolVersion, ExecutionRequestID: lease.Job.ExecutionRequestID,
		JudgeJobID: lease.Job.ID, SubmissionID: lease.Job.SubmissionID, Attempt: lease.Job.Attempt,
		CorrelationID: lease.Job.ID, ProblemRevisionID: lease.Job.ProblemRevisionID,
		TestdataVersionRef: lease.Job.TestdataVersionRef, LanguageProfileID: lease.Job.LanguageProfileID,
		ProblemID: lease.Job.ProblemID, TestcaseID: lease.Job.TestcaseID,
		TestcaseInput: []byte(lease.Job.TestcaseInput), TestcaseInputSHA256: lease.Job.TestcaseInputSHA256,
		ExecutionProfileID: lease.Job.ExecutionProfileID,
		SourceSnapshotRef:  lease.Job.SourceSnapshotRef, SourceBytes: lease.Job.SourceBytes,
		SourceSHA256: lease.Job.SourceSHA256, ControlledInputID: lease.Job.ControlledInputID,
		DeadlineAt: deadline, CancellationGeneration: lease.Job.CancellationGeneration,
	}
	execution, err := w.Supervisor.Execute(ctx, request)
	if ctx.Err() != nil || execution.Result.PipelineOutcome == "PIPELINE_CANCELLED" {
		w.cancelLease(queueCtx, lease)
		return
	}
	if execution.Result.PipelineOutcome == "PIPELINE_INFRA_FAILURE" {
		_ = w.retry(queueCtx, lease, "REAL_EXECUTION_INFRA_FAILURE")
		return
	}
	if err != nil {
		_ = w.retry(queueCtx, lease, "REAL_EXECUTION_INFRA_FAILURE")
		return
	}
	if err = w.completeReal(queueCtx, lease, execution.Raw); err != nil {
		w.logger.Printf(`{"event":"worker_result_persist_error","worker_id":%q,"job_id":%q,"error":%q}`, w.WorkerID, lease.Job.ID, err.Error())
	}
}

func (w *Worker) processRealSet(ctx, queueCtx context.Context, lease queueadapter.Lease) {
	if lease.Job.TestcaseSet == nil {
		_ = w.failTerminal(queueCtx, lease, "WORKER_PROTOCOL_ERROR")
		return
	}
	if w.cancelRequested(queueCtx, lease) {
		w.cancelLease(queueCtx, lease)
		return
	}
	deadline := lease.Job.LeaseExpiresAt.Add(-100 * time.Millisecond)
	if !deadline.After(time.Now()) {
		_ = w.retry(queueCtx, lease, "EXECUTION_DEADLINE_UNAVAILABLE")
		return
	}
	manifest := supervisorclient.TestcaseSetManifest{
		ProblemID: lease.Job.TestcaseSet.ProblemID, ProblemRevisionID: lease.Job.TestcaseSet.ProblemRevisionID,
		TestdataVersionID: lease.Job.TestcaseSet.TestdataVersionID, TestcaseSetID: lease.Job.TestcaseSet.TestcaseSetID,
		ExecutionProfileID: lease.Job.TestcaseSet.ExecutionProfileID, ManifestHash: lease.Job.TestcaseSet.ManifestHash,
		Entries: make([]supervisorclient.TestcaseSetEntry, 0, len(lease.Job.TestcaseSet.Entries)),
	}
	for _, entry := range lease.Job.TestcaseSet.Entries {
		manifest.Entries = append(manifest.Entries, supervisorclient.TestcaseSetEntry{
			Index: entry.Index, TestcaseID: entry.TestcaseID, TestdataVersionID: entry.TestdataVersionID,
			Input: []byte(entry.Input), InputSHA256: entry.InputSHA256, ExecutionProfileID: entry.ExecutionProfileID,
			ExpectedOutputSHA256: entry.ExpectedOutputSHA256,
			CheckerType:          entry.CheckerType, CheckerVersion: entry.CheckerVersion, CheckerConfigSHA256: entry.CheckerConfigSHA256,
		})
	}
	policy := lease.Job.ExecutionSetPolicy
	if policy == "" {
		policy = "RUN_ALL"
	}
	request := supervisorclient.SetRequest{
		ProtocolVersion: supervisorclient.SetProtocolVersion, ExecutionSetRequestID: lease.Job.ExecutionRequestID,
		ExecutionSetAttemptID: lease.Job.ExecutionAttemptID, JudgeJobID: lease.Job.ID, SubmissionID: lease.Job.SubmissionID,
		Attempt: lease.Job.Attempt, CorrelationID: lease.Job.ID, Manifest: manifest, ExecutionPolicy: policy,
		LanguageProfileID: lease.Job.LanguageProfileID, SourceSnapshotRef: lease.Job.SourceSnapshotRef,
		SourceBytes: lease.Job.SourceBytes, SourceSHA256: lease.Job.SourceSHA256, DeadlineAt: deadline,
		CancellationGeneration: lease.Job.CancellationGeneration,
	}
	execution, err := w.Supervisor.ExecuteSet(ctx, request)
	if ctx.Err() != nil || execution.Result.PipelineOutcome == "PIPELINE_CANCELLED" {
		w.cancelLease(queueCtx, lease)
		return
	}
	if err != nil || execution.Result.PipelineOutcome == "PIPELINE_INFRA_FAILURE" {
		if err != nil {
			w.logger.Printf(`{"event":"worker_supervisor_execution_set_error","worker_id":%q,"job_id":%q,"assignment_id":%q,"supervisor_url":%q,"error":%q}`, w.WorkerID, lease.Job.ID, lease.AssignmentID, w.Config.SupervisorURL, err.Error())
		} else {
			w.logger.Printf(`{"event":"worker_supervisor_execution_set_infra_failure","worker_id":%q,"job_id":%q,"assignment_id":%q,"supervisor_url":%q,"pipeline_outcome":%q}`, w.WorkerID, lease.Job.ID, lease.AssignmentID, w.Config.SupervisorURL, execution.Result.PipelineOutcome)
		}
		if w.cancelRequested(queueCtx, lease) {
			w.cancelLease(queueCtx, lease)
			return
		}
		_ = w.retry(queueCtx, lease, "REAL_EXECUTION_SET_INFRA_FAILURE")
		return
	}
	if !verdictReadyManifest(lease.Job.TestcaseSet) {
		if err = w.completeReal(queueCtx, lease, execution.Raw); err != nil {
			w.logger.Printf(`{"event":"worker_set_result_persist_error","worker_id":%q,"job_id":%q,"error":%q}`, w.WorkerID, lease.Job.ID, err.Error())
		}
		return
	}
	result, deriveErr := verdict.Derive(verdict.Input{SubmissionID: lease.Job.SubmissionID, ExecutionSetRequestID: lease.Job.ExecutionRequestID, ExecutionSetAttemptID: lease.Job.ExecutionAttemptID, ManifestHash: lease.Job.TestcaseSet.ManifestHash, Attempt: lease.Job.Attempt, Authoritative: true, Entries: verdictEntries(lease.Job.TestcaseSet), Raw: execution.Raw})
	if deriveErr != nil {
		_ = w.retry(queueCtx, lease, "VERDICT_DERIVATION_INFRA_FAILURE")
		return
	}
	published, err := attachVerdict(execution.Raw, result)
	if err != nil {
		_ = w.retry(queueCtx, lease, "VERDICT_PUBLICATION_INFRA_FAILURE")
		return
	}
	if err = w.completeReal(queueCtx, lease, published); err != nil {
		w.logger.Printf(`{"event":"worker_set_result_persist_error","worker_id":%q,"job_id":%q,"error":%q}`, w.WorkerID, lease.Job.ID, err.Error())
	}
}

func (w *Worker) completeReal(ctx context.Context, lease queueadapter.Lease, result json.RawMessage) error {
	if w.NodeClient != nil {
		if lease.AssignmentID == "" {
			return errors.New("missing node assignment")
		}
		return w.NodeClient.Complete(ctx, w.WorkerID, lease.AssignmentID, w.InstanceID, lease.Token, result)
	}
	return w.Queue.CompleteReal(ctx, lease, result)
}

func (w *Worker) resolve(ctx context.Context, lease queueadapter.Lease, action, reason, fixtureID string) error {
	if w.NodeClient != nil {
		if lease.AssignmentID == "" {
			return errors.New("missing node assignment")
		}
		return w.NodeClient.Resolve(ctx, w.WorkerID, lease.AssignmentID, w.InstanceID, lease.Token, action, reason, fixtureID)
	}
	switch action {
	case "SUCCEEDED_FAKE":
		return w.Queue.Complete(ctx, lease)
	case "FAILED_RETRYABLE":
		return w.Queue.Retry(ctx, lease, reason)
	case "FAILED_TERMINAL":
		return w.Queue.FailTerminal(ctx, lease, reason)
	case "CANCELLED":
		return w.Queue.Cancel(ctx, lease)
	default:
		return errors.New("unknown node resolution")
	}
}

func (w *Worker) completeFixture(ctx context.Context, lease queueadapter.Lease) error {
	return w.resolve(ctx, lease, "SUCCEEDED_FAKE", "", lease.Job.FixtureID)
}

func (w *Worker) retry(ctx context.Context, lease queueadapter.Lease, reason string) error {
	return w.resolve(ctx, lease, "FAILED_RETRYABLE", reason, "")
}

func (w *Worker) failTerminal(ctx context.Context, lease queueadapter.Lease, reason string) error {
	return w.resolve(ctx, lease, "FAILED_TERMINAL", reason, "")
}

func (w *Worker) cancelRequested(ctx context.Context, lease queueadapter.Lease) bool {
	if w.NodeClient != nil {
		if lease.AssignmentID == "" {
			return false
		}
		requested, err := w.NodeClient.CancellationRequested(ctx, w.WorkerID, lease.AssignmentID, w.InstanceID)
		if err == nil {
			w.cancelMu.Lock()
			delete(w.cancellationObservationErrors, lease.AssignmentID)
			w.cancelMu.Unlock()
			return requested
		}
		w.cancelMu.Lock()
		_, alreadyReported := w.cancellationObservationErrors[lease.AssignmentID]
		if !alreadyReported {
			w.cancellationObservationErrors[lease.AssignmentID] = struct{}{}
		}
		w.cancelMu.Unlock()
		if !alreadyReported {
			w.logger.Printf(`{"event":"worker_cancellation_observation_error","worker_id":%q,"job_id":%q,"assignment_id":%q,"error_kind":"CANCELLATION_STATUS_UNAVAILABLE"}`, w.WorkerID, lease.Job.ID, lease.AssignmentID)
		}
		return false
	}
	requested, err := w.Queue.CancellationRequested(ctx, lease.Job.ID)
	return err == nil && requested
}

func (w *Worker) cancelLease(ctx context.Context, lease queueadapter.Lease) {
	if err := w.resolve(ctx, lease, "CANCELLED", "cancelled", ""); err != nil {
		w.logger.Printf(`{"event":"worker_cancel_persist_error","worker_id":%q,"job_id":%q,"error":%q}`, w.WorkerID, lease.Job.ID, err.Error())
	}
}

func verdictEntries(manifest *queueadapter.TestcaseSetManifest) []verdict.Entry {
	entries := make([]verdict.Entry, 0, len(manifest.Entries))
	for _, entry := range manifest.Entries {
		entries = append(entries, verdict.Entry{Index: entry.Index, TestcaseID: entry.TestcaseID, TestdataVersionID: entry.TestdataVersionID, ExpectedOutputSHA256: entry.ExpectedOutputSHA256, ExpectedOutput: []byte(entry.ExpectedOutput), CheckerType: entry.CheckerType, CheckerVersion: entry.CheckerVersion, CheckerConfigSHA256: entry.CheckerConfigSHA256})
	}
	return entries
}

func verdictReadyManifest(manifest *queueadapter.TestcaseSetManifest) bool {
	if manifest == nil || len(manifest.Entries) == 0 {
		return false
	}
	for _, entry := range manifest.Entries {
		if entry.CheckerType == "" || entry.ExpectedOutputSHA256 == "" {
			return false
		}
	}
	return true
}

func attachVerdict(raw json.RawMessage, record verdict.AggregateRecord) (json.RawMessage, error) {
	var payload map[string]json.RawMessage
	if json.Unmarshal(raw, &payload) != nil {
		return nil, errors.New("raw verdict payload malformed")
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		return nil, err
	}
	payload["verdict_record"] = encoded
	return json.Marshal(payload)
}

func (w *Worker) observeCancellation(ctx context.Context, lease queueadapter.Lease, cancel context.CancelFunc) {
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if w.cancelRequested(ctx, lease) {
				cancel()
				return
			}
		}
	}
}
func (w *Worker) Cancel(jobID string) bool {
	w.cancelMu.Lock()
	defer w.cancelMu.Unlock()
	cancel, ok := w.cancelJobs[jobID]
	if ok {
		cancel()
	}
	return ok
}
func (w *Worker) ProcessRequest(ctx context.Context, request protocol.ExecutionRequest) (protocol.ExecutionResult, error) {
	started := time.Now().UTC()
	if err := request.Validate(started, w.Capabilities); err != nil {
		return protocol.ExecutionResult{}, err
	}
	outcome, code, runErr := w.Executor.Run(ctx, request.FixtureID)
	completed := time.Now().UTC()
	result := ResultForRequest(w, request, outcome, code, started, completed)
	if err := result.Validate(); err != nil {
		return protocol.ExecutionResult{}, err
	}
	return result, runErr
}
func (w *Worker) Drain(ctx context.Context) error {
	w.shutdownOnce.Do(func() { close(w.drain); w.setState(Draining) })
	deadline, cancel := context.WithTimeout(ctx, time.Duration(w.Config.ShutdownTimeoutMS)*time.Millisecond)
	defer cancel()
	for w.active.Load() > 0 {
		select {
		case <-deadline.Done():
			w.setState(Stopping)
			close(w.stop)
			w.setState(Stopped)
			return deadline.Err()
		case <-time.After(10 * time.Millisecond):
		}
	}
	w.setState(Stopping)
	w.stopOnce.Do(func() { close(w.stop) })
	if w.Queue.Redis != nil {
		_ = w.Queue.Redis.Close()
	}
	w.setState(Stopped)
	return nil
}
func (w *Worker) ServeHealth(ctx context.Context) (*http.Server, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(rw http.ResponseWriter, _ *http.Request) {
		rw.Header().Set("content-type", "application/json")
		_, _ = rw.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/ready", func(rw http.ResponseWriter, _ *http.Request) {
		rw.Header().Set("content-type", "application/json")
		readiness := w.Readiness()
		status := "ok"
		code := http.StatusOK
		if !w.dependenciesReady() || (w.State() != Ready && w.State() != Claiming && w.State() != Busy) {
			status = "degraded"
			code = http.StatusServiceUnavailable
		}
		rw.WriteHeader(code)
		_ = json.NewEncoder(rw).Encode(map[string]any{"status": status, "dependencies": readiness})
	})
	server := &http.Server{Addr: w.Config.HealthAddr, Handler: mux}
	go func() { <-ctx.Done(); _ = server.Shutdown(context.Background()) }()
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			w.logger.Printf(`{"event":"health_server_error"}`)
		}
	}()
	return server, nil
}

func ResultFor(w *Worker, lease queueadapter.Lease, outcome protocol.Outcome, code string, started, completed time.Time) protocol.ExecutionResult {
	return protocol.ExecutionResult{ProtocolVersion: protocol.Version, JudgeJobID: lease.Job.ID, WorkerID: w.WorkerID, WorkerInstanceID: w.InstanceID, Attempt: lease.Job.Attempt, StartedAt: started, CompletedAt: completed, ExecutionStage: "SAFE_FIXTURE", SyntheticQualification: true, Outcome: outcome, DiagnosticCode: code, SafeDiagnosticMessage: "qualification-only result", CorrelationID: lease.Job.ID}
}
func ResultForRequest(w *Worker, request protocol.ExecutionRequest, outcome protocol.Outcome, code string, started, completed time.Time) protocol.ExecutionResult {
	return protocol.ExecutionResult{ProtocolVersion: protocol.Version, JudgeJobID: request.JudgeJobID, WorkerID: w.WorkerID, WorkerInstanceID: w.InstanceID, Attempt: request.Attempt, StartedAt: started, CompletedAt: completed, ExecutionStage: "SAFE_FIXTURE", SyntheticQualification: true, Outcome: outcome, DiagnosticCode: code, SafeDiagnosticMessage: "qualification-only result", CorrelationID: request.CorrelationID}
}
func MarshalSafe(v any) []byte { b, _ := json.Marshal(v); return b }
