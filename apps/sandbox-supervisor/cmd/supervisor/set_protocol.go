package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

type executionSetRecord struct {
	RequestIdentity   string                       `json:"request_identity"`
	SourceSnapshotRef string                       `json:"source_snapshot_ref"`
	Manifest          model.TestcaseSetManifest    `json:"manifest"`
	Result            model.RealExecutionSetResult `json:"result"`
	run               context.CancelFunc           `json:"-"`
	Active            bool                         `json:"active"`
	PersistenceFailed bool                         `json:"-"`
}

// The worker contract permits 64 testcase inputs of up to 100 MiB each and a
// 256 KiB source snapshot. JSON/base64 encoding needs a finite envelope larger
// than the raw byte limits while remaining bounded at this trust boundary.
const maxExecutionSetRequestBytes int64 = 384 << 20

func executionSetRecordRoot(sandboxRoot string) string {
	if configured := os.Getenv("OJPLATFORM_EXECUTION_SET_RECORD_ROOT"); configured != "" {
		return configured
	}
	return sandboxRoot + "-execution-set-records"
}

func (s *protocolServer) executionSetRecordPath(id string) string {
	digest := sha256.Sum256([]byte(id))
	return filepath.Join(s.executionSetRecordRoot, hex.EncodeToString(digest[:])+".json")
}

func setRequestIdentity(request model.RealExecutionSetRequest) string {
	encoded, _ := json.Marshal(request)
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func (s *protocolServer) persistExecutionSetRecord(id string) error {
	record := s.executionSets[id]
	if record == nil {
		return errors.New("execution-set record missing")
	}
	if err := os.MkdirAll(s.executionSetRecordRoot, 0o700); err != nil {
		return err
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		return err
	}
	target := s.executionSetRecordPath(id)
	if existing, readErr := os.ReadFile(target); readErr == nil {
		var prior executionSetRecord
		if json.Unmarshal(existing, &prior) == nil && !prior.Active && !record.Active && prior.Result.AggregateExecutionRecord != nil && record.Result.AggregateExecutionRecord != nil && prior.Result.AggregateExecutionRecord.Digest != record.Result.AggregateExecutionRecord.Digest {
			return errors.New("immutable execution-set record conflict")
		}
	}
	temporary, err := os.CreateTemp(s.executionSetRecordRoot, ".record-")
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

func (s *protocolServer) loadExecutionSetRecords() error {
	if err := os.MkdirAll(s.executionSetRecordRoot, 0o700); err != nil {
		return err
	}
	entries, err := os.ReadDir(s.executionSetRecordRoot)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(s.executionSetRecordRoot, entry.Name()))
		if readErr != nil {
			return readErr
		}
		var record executionSetRecord
		if json.Unmarshal(data, &record) != nil || record.RequestIdentity == "" || record.SourceSnapshotRef == "" || record.Result.ExecutionSetRequestID == "" {
			return errors.New("malformed persisted execution-set record")
		}
		if record.Active {
			record.Active = false
			record.Result.PipelineOutcome = supervisor.PipelineInfraFailure
			record.Result.Clean = true
			record.Result.CompletedAt = time.Now().UTC()
			record.Result.AggregateExecutionRecord = recoveredSetRecord(record.Result, record.Manifest, record.SourceSnapshotRef)
		}
		id := record.Result.ExecutionSetRequestID
		s.executionSets[id] = &record
		if err := s.persistExecutionSetRecord(id); err != nil {
			return err
		}
	}
	return nil
}

func recoveredSetRecord(result model.RealExecutionSetResult, manifest model.TestcaseSetManifest, sourceSnapshotRef string) *model.AggregateExecutionSetRecord {
	members := make([]model.TestcaseSetMemberResult, 0, len(manifest.Entries))
	for _, entry := range manifest.Entries {
		members = append(members, model.TestcaseSetMemberResult{
			Index: entry.Index, TestcaseID: entry.TestcaseID, InputSHA256: entry.InputSHA256,
			TestdataVersionID: entry.TestdataVersionID, ExecutionProfileID: entry.ExecutionProfileID,
			Status: "CANCELLED_BEFORE_START",
		})
	}
	record := &model.AggregateExecutionSetRecord{
		RecordVersion: model.ExecutionSetContractVersion,
		RecordID:      result.ExecutionSetRequestID + ":record",
		SubmissionID:  result.SubmissionID, SnapshotID: sourceSnapshotRef,
		SourceSHA256: result.SourceSHA256, ArtifactSHA256: "",
		ProblemID: result.ProblemID, ProblemRevisionID: result.ProblemRevisionID,
		TestdataVersionID: result.TestdataVersionID, TestcaseSetID: result.TestcaseSetID,
		ManifestHash: result.TestcaseSetManifestHash, ExecutionSetRequestID: result.ExecutionSetRequestID,
		ExecutionSetAttemptID: result.ExecutionSetAttemptID, ExecutionProfileID: result.ExecutionProfileID,
		ExecutionPolicy: result.ExecutionSetPolicy, TotalTestcaseCount: len(members), Testcases: members,
		StopReason: "INFRASTRUCTURE_FAILURE", SetInfrastructureFailure: true,
		CleanupVerified: true,
	}
	withoutDigest := *record
	withoutDigest.Digest = ""
	encoded, _ := json.Marshal(withoutDigest)
	digest := sha256.Sum256(encoded)
	record.Digest = hex.EncodeToString(digest[:])
	return record
}

func (s *protocolServer) startExecutionSet(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !s.realExecutionEnabled {
		http.Error(w, "real submission execution disabled", http.StatusForbidden)
		return
	}
	var request model.RealExecutionSetRequest
	if err := decodeStrict(w, r, &request, maxExecutionSetRequestBytes); err != nil {
		http.Error(w, "invalid execution-set request: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := supervisor.ValidateRealExecutionSetRequest(request); err != nil {
		http.Error(w, "invalid execution-set request: "+err.Error(), http.StatusBadRequest)
		return
	}
	identity := setRequestIdentity(request)
	s.startPreparedExecutionSet(w, request, identity, "", nil)
}

func (s *protocolServer) startPreparedExecutionSet(w http.ResponseWriter, request model.RealExecutionSetRequest, identity, artifactID string, inputs map[int]supervisor.FileInput) bool {
	s.mu.Lock()
	s.pruneExecutionSetRecords(time.Now())
	if existing := s.executionSets[request.ExecutionSetRequestID]; existing != nil {
		if existing.RequestIdentity != identity {
			s.mu.Unlock()
			http.Error(w, "execution-set request identity conflict", http.StatusConflict)
			return false
		}
		active := existing.Active
		s.mu.Unlock()
		status := http.StatusOK
		state := "COMPLETED"
		if active {
			status, state = http.StatusAccepted, "ACTIVE"
		}
		w.WriteHeader(status)
		writeJSON(w, map[string]any{"status": state, "execution_set_request_id": request.ExecutionSetRequestID})
		return false
	}
	active := 0
	for _, execution := range s.executions {
		if execution.Active {
			active++
		}
	}
	for _, execution := range s.executionSets {
		if execution.Active {
			active++
		}
	}
	if active >= maxRealExecutions {
		s.mu.Unlock()
		http.Error(w, "execution concurrency limit", http.StatusTooManyRequests)
		return false
	}
	ctx, cancel := context.WithDeadline(context.Background(), request.DeadlineAt)
	initial := model.RealExecutionSetResult{
		ProtocolVersion: model.ExecutionSetContractVersion, ExecutionSetRequestID: request.ExecutionSetRequestID,
		ExecutionSetAttemptID: request.ExecutionSetRequestID + ":attempt", JudgeJobID: request.JudgeJobID,
		SubmissionID: request.SubmissionID, Attempt: request.Attempt, ResultGeneration: int64(request.Attempt),
		CorrelationID: request.CorrelationID, LanguageProfileID: request.LanguageProfileID, SourceSHA256: request.SourceSHA256,
		ProblemID: request.Manifest.ProblemID, ProblemRevisionID: request.Manifest.ProblemRevisionID,
		TestdataVersionID: request.Manifest.TestdataVersionID, TestcaseSetID: request.Manifest.TestcaseSetID,
		TestcaseSetManifestHash: request.Manifest.ManifestHash, ExecutionProfileID: request.Manifest.ExecutionProfileID,
		ExecutionSetPolicy: request.ExecutionPolicy, StartedAt: time.Now().UTC(),
	}
	if inputs != nil {
		initial.ProtocolVersion = supervisor.ArtifactExecutionContract
		initial.JudgeArtifactID = artifactID
	}
	s.executionSets[request.ExecutionSetRequestID] = &executionSetRecord{RequestIdentity: identity, SourceSnapshotRef: request.SourceSnapshotRef, Manifest: request.Manifest, Result: initial, run: cancel, Active: true}
	if err := s.persistExecutionSetRecord(request.ExecutionSetRequestID); err != nil {
		delete(s.executionSets, request.ExecutionSetRequestID)
		cancel()
		s.mu.Unlock()
		http.Error(w, "execution-set record persistence failed", http.StatusInternalServerError)
		return false
	}
	s.mu.Unlock()
	go s.executePreparedSet(ctx, request, inputs, artifactID)
	w.WriteHeader(http.StatusAccepted)
	writeJSON(w, map[string]any{"status": "ACTIVE", "execution_set_request_id": request.ExecutionSetRequestID})
	return true
}

func (s *protocolServer) pruneExecutionSetRecords(now time.Time) {
	for id, record := range s.executionSets {
		if record.Active || record.Result.CompletedAt.IsZero() {
			continue
		}
		if now.Sub(record.Result.CompletedAt) >= executionRetention {
			delete(s.executionSets, id)
			_ = os.Remove(s.executionSetRecordPath(id))
		}
	}
}

func (s *protocolServer) executeRealSet(ctx context.Context, request model.RealExecutionSetRequest) {
	s.executePreparedSet(ctx, request, nil, "")
}

func (s *protocolServer) executePreparedSet(ctx context.Context, request model.RealExecutionSetRequest, inputs map[int]supervisor.FileInput, artifactID string) {
	runtime := supervisor.New(s.root, s.runc, s.probePath)
	var result model.RealExecutionSetResult
	if inputs == nil {
		result, _ = runtime.ExecuteCPP20Set(ctx, request, s.compilerRootfs)
	} else {
		result, _ = runtime.ExecuteCPP20Artifact(ctx, request, s.compilerRootfs, inputs, artifactID)
		for _, input := range inputs {
			if err := input.File.Close(); err != nil {
				supervisor.MarkArtifactCleanupFailure(&result)
			}
		}
		if err := s.artifactStaging.ReleaseExecution(artifactID, request.ExecutionSetRequestID); err != nil {
			supervisor.MarkArtifactCleanupFailure(&result)
			log.Printf(`{"event":"artifact_cleanup_failed","execution_request_id":%q,"artifact_id":%q}`, request.ExecutionSetRequestID, artifactID)
		}
	}
	s.mu.Lock()
	if record := s.executionSets[request.ExecutionSetRequestID]; record != nil && record.Active {
		record.Result, record.run, record.Active = result, nil, false
		if err := s.persistExecutionSetRecord(request.ExecutionSetRequestID); err != nil {
			record.PersistenceFailed = true
			log.Printf(`{"event":"execution_result_persistence_failed","execution_request_id":%q}`, request.ExecutionSetRequestID)
		}
	}
	s.mu.Unlock()
}

func (s *protocolServer) executionSetStatus(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	id := r.URL.Query().Get("execution_set_request_id")
	s.mu.Lock()
	record := s.executionSets[id]
	if record == nil {
		s.mu.Unlock()
		http.Error(w, "execution-set not found", http.StatusNotFound)
		return
	}
	active, result, persistenceFailed := record.Active, record.Result, record.PersistenceFailed
	s.mu.Unlock()
	if result.JudgeArtifactID != "" && !s.authorizeArtifact(w, r) {
		return
	}
	if persistenceFailed {
		http.Error(w, "EXECUTION_RESULT_PERSISTENCE_FAILED", http.StatusServiceUnavailable)
		return
	}
	if active {
		writeJSON(w, map[string]any{"status": "ACTIVE", "execution_set_request_id": id})
		return
	}
	writeJSON(w, result)
}

func (s *protocolServer) cancelExecutionSet(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	var input struct {
		ExecutionSetRequestID string `json:"execution_set_request_id"`
	}
	if err := decodeStrict(w, r, &input, 4096); err != nil || input.ExecutionSetRequestID == "" {
		http.Error(w, "invalid execution-set cancellation", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	record := s.executionSets[input.ExecutionSetRequestID]
	if record == nil {
		s.mu.Unlock()
		http.Error(w, "execution-set not found", http.StatusNotFound)
		return
	}
	if record.Result.JudgeArtifactID != "" && !s.authorizeArtifact(w, r) {
		s.mu.Unlock()
		return
	}
	if !record.Active || record.run == nil {
		result := record.Result
		s.mu.Unlock()
		writeJSON(w, map[string]any{"status": "COMPLETED", "execution_set_request_id": input.ExecutionSetRequestID, "pipeline_outcome": result.PipelineOutcome})
		return
	}
	record.run()
	s.mu.Unlock()
	writeJSON(w, map[string]any{"status": "CANCELLATION_PENDING", "execution_set_request_id": input.ExecutionSetRequestID})
}
