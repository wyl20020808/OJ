package supervisorclient

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func setDigest(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}

func sealSetDigest(value map[string]any) {
	delete(value, "digest")
	encoded, _ := json.Marshal(value)
	var normalized any
	_ = json.Unmarshal(encoded, &normalized)
	encoded, _ = json.Marshal(normalized)
	value["digest"] = setDigest(encoded)
}

func setManifest() TestcaseSetManifest {
	entries := []TestcaseSetEntry{}
	for index, input := range []string{"one\n", "two\n"} {
		entries = append(entries, TestcaseSetEntry{Index: index, TestcaseID: "case-" + string(rune('1'+index)), TestdataVersionID: "testdata-v1", Input: []byte(input), InputSHA256: setDigest([]byte(input)), ExecutionProfileID: CPP20ProfileID})
	}
	manifest := TestcaseSetManifest{ProblemID: "problem", ProblemRevisionID: "revision", TestdataVersionID: "testdata-v1", TestcaseSetID: "set-1", ExecutionProfileID: CPP20ProfileID, Entries: entries}
	manifest.ManifestHash = TestcaseSetManifestHash(manifest)
	return manifest
}

func validSetRequest() SetRequest {
	source := "int main(){}"
	return SetRequest{ProtocolVersion: SetProtocolVersion, ExecutionSetRequestID: "job:1", ExecutionSetAttemptID: "job:1:attempt", JudgeJobID: "job", SubmissionID: "submission", Attempt: 1, CorrelationID: "job", Manifest: setManifest(), ExecutionPolicy: "RUN_ALL", LanguageProfileID: CPP20ProfileID, SourceSnapshotRef: "submission:submission", SourceBytes: source, SourceSHA256: setDigest([]byte(source)), DeadlineAt: time.Now().Add(time.Minute)}
}

func setStage() map[string]any {
	return map[string]any{"stdout": "", "stderr": "", "stdout_bytes": 0, "stderr_bytes": 0, "stdout_sha256": setDigest(nil), "stderr_sha256": setDigest(nil), "stdout_truncated": false, "stderr_truncated": false}
}

func TestSetManifestHashAndResultBinding(t *testing.T) {
	request := validSetRequest()
	if err := validateSetRequest(request); err != nil {
		t.Fatal(err)
	}
	var members []map[string]any
	for _, entry := range request.Manifest.Entries {
		members = append(members, map[string]any{"index": entry.Index, "testcase_id": entry.TestcaseID, "input_sha256": entry.InputSHA256, "testdata_version_id": entry.TestdataVersionID, "execution_profile_id": entry.ExecutionProfileID, "status": "CANCELLED_BEFORE_START"})
	}
	aggregate := map[string]any{"record_version": "2C.4", "record_id": "job:1:record", "submission_id": request.SubmissionID, "snapshot_id": request.SourceSnapshotRef, "source_sha256": request.SourceSHA256, "problem_id": request.Manifest.ProblemID, "problem_revision_id": request.Manifest.ProblemRevisionID, "testdata_version_id": request.Manifest.TestdataVersionID, "testcase_set_id": request.Manifest.TestcaseSetID, "manifest_hash": request.Manifest.ManifestHash, "execution_set_request_id": request.ExecutionSetRequestID, "execution_set_attempt_id": request.ExecutionSetAttemptID, "execution_profile_id": request.Manifest.ExecutionProfileID, "execution_policy": request.ExecutionPolicy, "total_testcase_count": 2, "started_testcase_count": 0, "completed_testcase_count": 0, "testcases": members, "set_cancelled": false, "set_infrastructure_failure": false, "stop_reason": "COMPLETED", "cleanup_verified": true}
	sealSetDigest(aggregate)
	aggregateBytes, _ := json.Marshal(aggregate)
	result := SetResult{ProtocolVersion: SetProtocolVersion, ExecutionSetRequestID: request.ExecutionSetRequestID, ExecutionSetAttemptID: request.ExecutionSetAttemptID, JudgeJobID: request.JudgeJobID, SubmissionID: request.SubmissionID, Attempt: 1, ResultGeneration: 1, CorrelationID: request.CorrelationID, LanguageProfileID: request.LanguageProfileID, SourceSHA256: request.SourceSHA256, ProblemID: request.Manifest.ProblemID, ProblemRevisionID: request.Manifest.ProblemRevisionID, TestdataVersionID: request.Manifest.TestdataVersionID, TestcaseSetID: request.Manifest.TestcaseSetID, TestcaseSetManifestHash: request.Manifest.ManifestHash, ExecutionProfileID: request.Manifest.ExecutionProfileID, ExecutionSetPolicy: request.ExecutionPolicy, PipelineOutcome: pipelineCompleted, Compile: mustJSON(setStage()), AggregateExecutionRecord: aggregateBytes, StartedAt: time.Now().Add(-time.Second), CompletedAt: time.Now(), Clean: true}
	if err := validateSetResult(request, result); err != nil {
		t.Fatal(err)
	}
	aggregate["snapshot_id"] = "submission:other"
	aggregateBytes, _ = json.Marshal(aggregate)
	result.AggregateExecutionRecord = aggregateBytes
	if err := validateSetResult(request, result); err == nil {
		t.Fatal("cross-snapshot aggregate accepted")
	}
	aggregate["snapshot_id"] = request.SourceSnapshotRef
	members[1]["testcase_id"] = "other"
	aggregateBytes, _ = json.Marshal(aggregate)
	result.AggregateExecutionRecord = aggregateBytes
	if err := validateSetResult(request, result); err == nil {
		t.Fatal("cross-manifest member accepted")
	}
}

func mustJSON(value any) json.RawMessage {
	encoded, _ := json.Marshal(value)
	return encoded
}

func TestExecuteSetPollsAndReturnsRawResult(t *testing.T) {
	request := validSetRequest()
	polls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		switch r.URL.Path {
		case "/v1/execution-sets/start":
			_, _ = w.Write([]byte(`{"status":"ACTIVE","execution_set_request_id":"job:1"}`))
		case "/v1/execution-sets/status":
			polls++
			if polls == 1 {
				_, _ = w.Write([]byte(`{"status":"ACTIVE"}`))
				return
			}
			members := []map[string]any{}
			for _, entry := range request.Manifest.Entries {
				members = append(members, map[string]any{"index": entry.Index, "testcase_id": entry.TestcaseID, "input_sha256": entry.InputSHA256, "testdata_version_id": entry.TestdataVersionID, "execution_profile_id": entry.ExecutionProfileID, "status": "CANCELLED_BEFORE_START"})
			}
			aggregate := map[string]any{"record_version": "2C.4", "record_id": "job:1:record", "submission_id": request.SubmissionID, "snapshot_id": request.SourceSnapshotRef, "source_sha256": request.SourceSHA256, "problem_id": request.Manifest.ProblemID, "problem_revision_id": request.Manifest.ProblemRevisionID, "testdata_version_id": request.Manifest.TestdataVersionID, "testcase_set_id": request.Manifest.TestcaseSetID, "manifest_hash": request.Manifest.ManifestHash, "execution_set_request_id": request.ExecutionSetRequestID, "execution_set_attempt_id": request.ExecutionSetAttemptID, "execution_profile_id": request.Manifest.ExecutionProfileID, "execution_policy": request.ExecutionPolicy, "total_testcase_count": 2, "started_testcase_count": 0, "completed_testcase_count": 0, "testcases": members, "set_cancelled": false, "set_infrastructure_failure": false, "stop_reason": "COMPLETED", "cleanup_verified": true}
			result := map[string]any{"protocol_version": SetProtocolVersion, "execution_set_request_id": request.ExecutionSetRequestID, "execution_set_attempt_id": request.ExecutionSetAttemptID, "judge_job_id": request.JudgeJobID, "submission_id": request.SubmissionID, "attempt": 1, "result_generation": 1, "correlation_id": request.CorrelationID, "language_profile_id": request.LanguageProfileID, "source_sha256": request.SourceSHA256, "problem_id": request.Manifest.ProblemID, "problem_revision_id": request.Manifest.ProblemRevisionID, "testdata_version_id": request.Manifest.TestdataVersionID, "testcase_set_id": request.Manifest.TestcaseSetID, "testcase_set_manifest_hash": request.Manifest.ManifestHash, "execution_profile_id": request.Manifest.ExecutionProfileID, "execution_set_policy": request.ExecutionPolicy, "pipeline_outcome": pipelineCompleted, "compile": setStage(), "aggregate_execution_set_record": aggregate, "started_at": time.Now().Add(-time.Second), "completed_at": time.Now(), "clean": true}
			sealSetDigest(aggregate)
			_ = json.NewEncoder(w).Encode(result)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	execution, err := client.ExecuteSet(context.Background(), request)
	if err != nil || execution.Result.PipelineOutcome != pipelineCompleted || !json.Valid(execution.Raw) {
		t.Fatalf("execution=%+v err=%v", execution.Result, err)
	}
}
