package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
	"github.com/ojplatform/sandbox-supervisor/internal/supervisor"
)

func TestExecutionSetHandlerAcceptsMaximumWorkerPayload(t *testing.T) {
	input := bytes.Repeat([]byte{'x'}, 64<<10)
	inputDigest := sha256.Sum256(input)
	entries := make([]model.TestcaseSetEntry, 64)
	for index := range entries {
		entries[index] = model.TestcaseSetEntry{
			Index: index, TestcaseID: "case-" + strconv.Itoa(index),
			TestdataVersionID: "testdata-v1", Input: input,
			InputSHA256: hex.EncodeToString(inputDigest[:]), ExecutionProfileID: supervisor.CPP20ProfileID,
		}
	}
	manifest := model.TestcaseSetManifest{
		ProblemID: "problem", ProblemRevisionID: "revision", TestdataVersionID: "testdata-v1",
		TestcaseSetID: "set-max", ExecutionProfileID: supervisor.CPP20ProfileID, Entries: entries,
	}
	manifest.ManifestHash = supervisor.TestcaseSetManifestHash(manifest)
	source := strings.Repeat("\x00", 256<<10)
	sourceDigest := sha256.Sum256([]byte(source))
	request := model.RealExecutionSetRequest{
		ProtocolVersion: model.ExecutionSetContractVersion, ExecutionSetRequestID: "job:max",
		JudgeJobID: "job:max", SubmissionID: "submission:max", Attempt: 1, CorrelationID: "corr:max",
		Manifest: manifest, ExecutionPolicy: "RUN_ALL", LanguageProfileID: supervisor.CPP20ProfileID,
		SourceSnapshotRef: "submission:max", SourceBytes: source, SourceSHA256: hex.EncodeToString(sourceDigest[:]),
		DeadlineAt: time.Now().Add(time.Minute),
	}
	body, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) <= 1<<20 || int64(len(body)) > maxExecutionSetRequestBytes {
		t.Fatalf("test payload size=%d, want (1 MiB, %d]", len(body), maxExecutionSetRequestBytes)
	}
	server := &protocolServer{
		realExecutionEnabled: true,
		executionSets: map[string]*executionSetRecord{
			request.ExecutionSetRequestID: {
				RequestIdentity: setRequestIdentity(request),
				Result:          model.RealExecutionSetResult{CompletedAt: time.Now().UTC()},
			},
		},
	}
	recorder := httptest.NewRecorder()
	server.startExecutionSet(recorder, httptest.NewRequest(http.MethodPost, "/v1/execution-sets/start", bytes.NewReader(body)))
	if recorder.Code != http.StatusOK {
		t.Fatalf("maximum worker payload rejected: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func setProtocolManifest() model.TestcaseSetManifest {
	input := []byte("one\n")
	digest := sha256.Sum256(input)
	manifest := model.TestcaseSetManifest{ProblemID: "problem", ProblemRevisionID: "revision", TestdataVersionID: "testdata-v1", TestcaseSetID: "set", ExecutionProfileID: supervisor.CPP20ProfileID, Entries: []model.TestcaseSetEntry{{Index: 0, TestcaseID: "case-1", TestdataVersionID: "testdata-v1", Input: input, InputSHA256: hex.EncodeToString(digest[:]), ExecutionProfileID: supervisor.CPP20ProfileID}}}
	manifest.ManifestHash = supervisor.TestcaseSetManifestHash(manifest)
	return manifest
}

func TestActiveExecutionSetRecordRecoversFailClosedWithManifest(t *testing.T) {
	recordRoot := t.TempDir()
	manifest := setProtocolManifest()
	result := model.RealExecutionSetResult{ProtocolVersion: model.ExecutionSetContractVersion, ExecutionSetRequestID: "job:1", ExecutionSetAttemptID: "job:1:attempt", JudgeJobID: "job", SubmissionID: "submission", Attempt: 1, ResultGeneration: 1, LanguageProfileID: supervisor.CPP20ProfileID, SourceSHA256: strings.Repeat("a", 64), ProblemID: manifest.ProblemID, ProblemRevisionID: manifest.ProblemRevisionID, TestdataVersionID: manifest.TestdataVersionID, TestcaseSetID: manifest.TestcaseSetID, TestcaseSetManifestHash: manifest.ManifestHash, ExecutionProfileID: manifest.ExecutionProfileID, ExecutionSetPolicy: "RUN_ALL"}
	first := &protocolServer{executionSetRecordRoot: recordRoot, executionSets: map[string]*executionSetRecord{"job:1": {RequestIdentity: "identity", SourceSnapshotRef: "submission:snapshot", Manifest: manifest, Result: result, Active: true}}}
	if err := first.persistExecutionSetRecord("job:1"); err != nil {
		t.Fatal(err)
	}
	restarted := &protocolServer{executionSetRecordRoot: recordRoot, executionSets: make(map[string]*executionSetRecord)}
	if err := restarted.loadExecutionSetRecords(); err != nil {
		t.Fatal(err)
	}
	recovered := restarted.executionSets["job:1"]
	if recovered == nil || recovered.Active || recovered.Result.PipelineOutcome != supervisor.PipelineInfraFailure || recovered.Result.AggregateExecutionRecord == nil || recovered.Result.AggregateExecutionRecord.SnapshotID != "submission:snapshot" || recovered.Result.AggregateExecutionRecord.TotalTestcaseCount != 1 || len(recovered.Result.AggregateExecutionRecord.Testcases) != 1 || recovered.Result.AggregateExecutionRecord.Testcases[0].Status != "CANCELLED_BEFORE_START" || len(recovered.Result.AggregateExecutionRecord.Digest) != 64 {
		t.Fatalf("active set did not recover fail closed: %+v", recovered)
	}
}
