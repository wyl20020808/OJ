package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

type artifactInputDescriptor struct {
	Index            int    `json:"index"`
	Handle           string `json:"handle"`
	SizeBytes        int64  `json:"size_bytes"`
	SHA256           string `json:"sha256"`
	TimeLimitMs      int    `json:"time_limit_ms"`
	MemoryLimitBytes int64  `json:"memory_limit_bytes"`
	OutputLimitBytes int    `json:"output_limit_bytes"`
}
type artifactExecutionRequest struct {
	model.RealExecutionSetRequest
	JudgeArtifactID string                    `json:"judge_artifact_id"`
	Inputs          []artifactInputDescriptor `json:"inputs"`
}

func (s *protocolServer) authorizeArtifact(w http.ResponseWriter, r *http.Request) bool {
	if s.artifactToken == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("x-supervisor-artifact-token")), []byte(s.artifactToken)) != 1 {
		http.Error(w, "UNAUTHENTICATED", http.StatusUnauthorized)
		return false
	}
	if s.artifactStaging == nil || !s.realExecutionEnabled {
		http.Error(w, "ARTIFACT_EXECUTION_UNAVAILABLE", http.StatusServiceUnavailable)
		return false
	}
	return true
}

func (s *protocolServer) stageArtifactInput(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeArtifact(w, r) || !requireMethod(w, r, http.MethodPost) {
		return
	}
	size, err := strconv.ParseInt(r.Header.Get("x-input-size"), 10, 64)
	if err != nil || size < 0 || size > 100<<20 || r.ContentLength != size {
		http.Error(w, "INVALID_ARTIFACT_CONTRACT", http.StatusBadRequest)
		return
	}
	if err := http.NewResponseController(w).SetReadDeadline(time.Now().Add(2 * time.Minute)); err != nil {
		http.Error(w, "ARTIFACT_STREAM_UNAVAILABLE", http.StatusServiceUnavailable)
		return
	}
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(2 * time.Minute)); err != nil {
		http.Error(w, "ARTIFACT_STREAM_UNAVAILABLE", http.StatusServiceUnavailable)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, size)
	entry, err := s.artifactStaging.Stage(r.Context(), r.Body, size, r.Header.Get("x-input-sha256"), r.Header.Get("x-judge-artifact-id"), r.Header.Get("x-execution-request-id"))
	if err != nil {
		http.Error(w, "ARTIFACT_INPUT_REJECTED", http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, entry)
}

func (s *protocolServer) startArtifactExecution(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeArtifact(w, r) || !requireMethod(w, r, http.MethodPost) {
		return
	}
	var request artifactExecutionRequest
	if decodeStrict(w, r, &request, 1<<20) != nil || request.ProtocolVersion != supervisor.ArtifactExecutionContract || len(request.Inputs) < 1 || len(request.Inputs) > 64 || len(request.Inputs) != len(request.Manifest.Entries) {
		http.Error(w, "INVALID_ARTIFACT_CONTRACT", http.StatusBadRequest)
		return
	}
	encoded, _ := json.Marshal(request)
	digest := sha256.Sum256(encoded)
	identity := hex.EncodeToString(digest[:])
	// Check replay before acquiring one-shot handles already held by an active run.
	s.mu.Lock()
	existing := s.executionSets[request.ExecutionSetRequestID]
	if existing != nil {
		conflict, active := existing.RequestIdentity != identity, existing.Active
		s.mu.Unlock()
		if conflict {
			http.Error(w, "ARTIFACT_EXECUTION_CONFLICT", http.StatusConflict)
			return
		}
		status := "COMPLETED"
		if active {
			status = "ACTIVE"
			w.WriteHeader(http.StatusAccepted)
		}
		writeJSON(w, map[string]any{"status": status, "execution_set_request_id": request.ExecutionSetRequestID})
		return
	}
	s.mu.Unlock()
	inputs := make(map[int]supervisor.FileInput)
	accepted := false
	defer func() {
		if !accepted {
			for _, input := range inputs {
				input.File.Close()
			}
			for index := range inputs {
				if err := s.artifactStaging.Release(request.Inputs[index].Handle, request.JudgeArtifactID, request.ExecutionSetRequestID); err != nil {
					log.Printf(`{"event":"artifact_cleanup_failed","execution_request_id":%q,"artifact_id":%q}`, request.ExecutionSetRequestID, request.JudgeArtifactID)
				}
			}
		}
	}()
	for index, descriptor := range request.Inputs {
		entry := request.Manifest.Entries[index]
		if descriptor.Index != index || descriptor.SHA256 != entry.InputSHA256 || len(entry.Input) != 0 {
			http.Error(w, "INVALID_ARTIFACT_CONTRACT", http.StatusBadRequest)
			return
		}
		file, err := s.artifactStaging.Acquire(descriptor.Handle, request.JudgeArtifactID, request.ExecutionSetRequestID, descriptor.SizeBytes, descriptor.SHA256)
		if err != nil {
			http.Error(w, "ARTIFACT_INPUT_REJECTED", http.StatusConflict)
			return
		}
		limits := supervisor.RuntimeResourceLimits()
		limits.WallTimeMS = descriptor.TimeLimitMs
		limits.MemoryBytes = descriptor.MemoryLimitBytes
		limits.OutputBytes = descriptor.OutputLimitBytes
		inputs[index] = supervisor.FileInput{File: file, SizeBytes: descriptor.SizeBytes, Limits: limits}
	}
	internal := request.RealExecutionSetRequest
	internal.ProtocolVersion = model.ExecutionSetContractVersion
	if supervisor.ValidateArtifactExecution(internal, inputs, request.JudgeArtifactID) != nil {
		http.Error(w, "INVALID_ARTIFACT_CONTRACT", http.StatusBadRequest)
		return
	}
	accepted = s.startPreparedExecutionSet(w, internal, identity, request.JudgeArtifactID, inputs)
}

func (s *protocolServer) artifactExecutionStatus(w http.ResponseWriter, r *http.Request) {
	if s.authorizeArtifact(w, r) {
		s.executionSetStatus(w, r)
	}
}
func (s *protocolServer) cancelArtifactExecution(w http.ResponseWriter, r *http.Request) {
	if s.authorizeArtifact(w, r) {
		s.cancelExecutionSet(w, r)
	}
}

func (s *protocolServer) releaseArtifactInputs(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeArtifact(w, r) || !requireMethod(w, r, http.MethodPost) {
		return
	}
	var input struct {
		ArtifactID  string `json:"artifact_id"`
		ExecutionID string `json:"execution_request_id"`
	}
	if decodeStrict(w, r, &input, 4096) != nil || len(input.ArtifactID) != 64 || input.ExecutionID == "" {
		http.Error(w, "INVALID_ARTIFACT_CONTRACT", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if record := s.executionSets[input.ExecutionID]; record != nil && record.Active {
		http.Error(w, "ARTIFACT_EXECUTION_ACTIVE", http.StatusConflict)
		return
	}
	if err := s.artifactStaging.ReleaseUnusedExecution(input.ArtifactID, input.ExecutionID); err != nil {
		log.Printf(`{"event":"artifact_cleanup_failed","execution_request_id":%q,"artifact_id":%q}`, input.ExecutionID, input.ArtifactID)
		http.Error(w, "ARTIFACT_CLEANUP_FAILED", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": "RELEASED"})
}
