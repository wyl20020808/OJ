package queueadapter

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/judge-worker/internal/verdict"
)

func TestRedisURLSupportsACLUsernameAndPassword(t *testing.T) {
	client, err := New("redis://oj-judge-worker:p%40ssword-value@127.0.0.1:56379/0")
	if err != nil {
		t.Fatal(err)
	}
	if client.addr != "127.0.0.1:56379" || client.username != "oj-judge-worker" || client.password != "p@ssword-value" {
		t.Fatal("Redis ACL URL was not parsed correctly")
	}
	for _, raw := range []string{
		"rediss://oj-judge-worker:password-value@127.0.0.1:56379/0",
		"redis://oj-judge-worker@127.0.0.1:56379/0",
		"redis://oj-judge-worker:password-value@127.0.0.1:56379/1",
		"redis://oj-judge-worker:password-value@127.0.0.1:56379/0?fallback=true",
	} {
		if _, err := New(raw); err == nil {
			t.Fatalf("invalid Redis URL accepted: %s", raw)
		}
	}
}

func TestRedisACLConnectionIntegration(t *testing.T) {
	rawURL := os.Getenv("REDIS_ACL_TEST_URL")
	prefix := os.Getenv("REDIS_ACL_TEST_PREFIX")
	if rawURL == "" || prefix == "" {
		t.Skip("REDIS_ACL_TEST_URL and REDIS_ACL_TEST_PREFIX are required")
	}
	client, err := New(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err = client.Connect(ctx); err != nil {
		t.Fatal(err)
	}
	if err = client.Set(ctx, prefix+":workers:acl-integration", "ok", time.Second); err != nil {
		t.Fatal(err)
	}
	if _, err = client.Get(ctx, prefix+":workers:acl-integration"); err == nil || !strings.Contains(err.Error(), "NOPERM") {
		t.Fatal("Worker credential read outside its command scope was not denied")
	}
}

func sealDigest(value map[string]any) {
	delete(value, "digest")
	encoded, _ := json.Marshal(value)
	var normalized any
	_ = json.Unmarshal(encoded, &normalized)
	encoded, _ = json.Marshal(normalized)
	value["digest"] = digest(encoded)
}

func validRawExecutionResult() json.RawMessage {
	return json.RawMessage(`{
		"protocol_version":"2C.1",
		"execution_request_id":"job-1:2",
		"judge_job_id":"job-1",
		"submission_id":"submission-1",
		"attempt":2,
		"execution_attempt_id":"job-1:2:attempt",
		"result_generation":2,
		"language_profile_id":"cpp20-gcc-13-v1",
		"source_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"pipeline_outcome":"PIPELINE_COMPLETED",
		"compile":{"outcome":"COMPILE_SUCCEEDED"}
	}`)
}

func TestValidateRawExecutionResultBindsAuthoritativeJobIdentity(t *testing.T) {
	job := Job{
		ID:                 "job-1",
		SubmissionID:       "submission-1",
		Attempt:            2,
		ExecutionRequestID: "job-1:2",
		ExecutionAttemptID: "job-1:2:attempt",
		ResultGeneration:   2,
		LanguageProfileID:  "cpp20-gcc-13-v1",
		SourceSHA256:       "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	if err := validateRawExecutionResult(validRawExecutionResult(), job); err != nil {
		t.Fatalf("valid result rejected: %v", err)
	}

	for name, mutate := range map[string]func(map[string]any){
		"protocol":          func(v map[string]any) { v["protocol_version"] = "2A.1" },
		"request":           func(v map[string]any) { v["execution_request_id"] = "job-1:1" },
		"job":               func(v map[string]any) { v["judge_job_id"] = "job-2" },
		"submission":        func(v map[string]any) { v["submission_id"] = "submission-2" },
		"attempt":           func(v map[string]any) { v["attempt"] = float64(1) },
		"execution-attempt": func(v map[string]any) { v["execution_attempt_id"] = "job-1:1:attempt" },
		"missing-attempt":   func(v map[string]any) { delete(v, "execution_attempt_id") },
		"generation":        func(v map[string]any) { v["result_generation"] = float64(1) },
		"missing-generation": func(v map[string]any) {
			delete(v, "result_generation")
		},
		"profile": func(v map[string]any) { v["language_profile_id"] = "other" },
		"source": func(v map[string]any) {
			v["source_sha256"] = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
		},
		"outcome": func(v map[string]any) { v["pipeline_outcome"] = "AC" },
		"compile": func(v map[string]any) { v["compile"] = nil },
	} {
		t.Run(name, func(t *testing.T) {
			var value map[string]any
			if err := json.Unmarshal(validRawExecutionResult(), &value); err != nil {
				t.Fatal(err)
			}
			mutate(value)
			raw, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if validateRawExecutionResult(raw, job) == nil {
				t.Fatal("mismatched result accepted")
			}
		})
	}
}

func TestJobPreservesEvaluationGenerationAcrossRedisPayload(t *testing.T) {
	raw := []byte(`{"id":"job-1","submissionId":"submission-1","evaluationGeneration":2,"idempotencyKey":"submission:submission-1:evaluation:2"}`)
	var job Job
	if err := json.Unmarshal(raw, &job); err != nil {
		t.Fatal(err)
	}
	if job.EvaluationGeneration != 2 {
		t.Fatalf("evaluation generation lost: %d", job.EvaluationGeneration)
	}
	encoded, err := json.Marshal(job)
	if err != nil || !strings.Contains(string(encoded), `"evaluationGeneration":2`) {
		t.Fatalf("evaluation generation was not serialized: %v %s", err, encoded)
	}
}

func TestLegacyJobDefaultsToFirstEvaluationGeneration(t *testing.T) {
	job := Job{}
	normalizeEvaluationGeneration(&job)
	if job.EvaluationGeneration != 1 {
		t.Fatalf("legacy job did not default to first generation: %d", job.EvaluationGeneration)
	}
}

func TestJobPreservesEmptyExpectedOutputInVerdictManifest(t *testing.T) {
	job := Job{TestcaseSet: &TestcaseSetManifest{Entries: []TestcaseSetEntry{{
		Index: 0, ExpectedOutput: "", ExpectedOutputSHA256: digest(nil),
		CheckerType: "EXACT_BYTES", CheckerVersion: "builtin-v1",
		CheckerConfigSHA256: digest([]byte("EXACT_BYTES\x00builtin-v1")),
	}}}}
	encoded, err := json.Marshal(job)
	if err != nil || !strings.Contains(string(encoded), `"expectedOutput":""`) {
		t.Fatalf("empty expected output was not serialized: %v %s", err, encoded)
	}
	var decoded Job
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.TestcaseSet == nil || decoded.TestcaseSet.Entries[0].ExpectedOutput != "" {
		t.Fatal("empty expected output was not preserved")
	}
}

func TestValidateRawExecutionResultBindsTestcaseProvenanceAndRecord(t *testing.T) {
	job := Job{
		ID: "job-tcx", SubmissionID: "submission-tcx", ProblemID: "problem-v1",
		ProblemRevisionID: "revision-v1", TestdataVersionRef: "testdata-v1",
		TestcaseID: "case-1", TestcaseInput: "111\n", TestcaseInputSHA256: digest([]byte("111\n")), ExecutionProfileID: "cpp20-gcc-13-v1",
		Attempt: 1, ExecutionRequestID: "job-tcx:1", ExecutionAttemptID: "job-tcx:1:attempt", ResultGeneration: 1,
		LanguageProfileID: "cpp20-gcc-13-v1", SourceSHA256: strings.Repeat("a", 64),
	}
	result := map[string]any{
		"protocol_version": "2C.3", "execution_request_id": "job-tcx:1", "judge_job_id": "job-tcx", "submission_id": "submission-tcx", "attempt": 1,
		"execution_attempt_id": "job-tcx:1:attempt", "compile_attempt_id": "job-tcx:1:compile", "runtime_attempt_id": "job-tcx:1:runtime", "result_generation": 1,
		"language_profile_id": "cpp20-gcc-13-v1", "source_sha256": strings.Repeat("a", 64), "problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1",
		"testcase_id": "case-1", "testcase_input_sha256": job.TestcaseInputSHA256, "execution_profile_id": "cpp20-gcc-13-v1", "pipeline_outcome": "PIPELINE_COMPLETED", "compile": map[string]any{"outcome": "COMPILE_SUCCEEDED", "stdout": "", "stderr": "", "stdout_bytes": 0, "stderr_bytes": 0, "stdout_sha256": digest(nil), "stderr_sha256": digest(nil), "stdout_truncated": false, "stderr_truncated": false},
		"runtime":                map[string]any{"outcome": "EXECUTION_COMPLETED", "stdout": "111\n", "stderr": "", "stdout_bytes": 4, "stderr_bytes": 0, "stdout_sha256": job.TestcaseInputSHA256, "stderr_sha256": digest(nil), "stdout_truncated": false, "stderr_truncated": false},
		"single_testcase_record": map[string]any{"record_version": "2C.3", "record_id": "job-tcx:1:case-1", "digest": strings.Repeat("b", 64), "identity": map[string]any{"problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1", "testcase_id": "case-1", "input_sha256": job.TestcaseInputSHA256, "execution_profile_id": "cpp20-gcc-13-v1", "execution_attempt_id": "job-tcx:1:attempt"}},
	}
	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateRawExecutionResult(raw, job); err != nil {
		t.Fatalf("valid testcase result rejected: %v", err)
	}
	for name, mutate := range map[string]func(map[string]any){
		"testdata": func(v map[string]any) { v["testdata_version_id"] = "testdata-v2" },
		"testcase": func(v map[string]any) { v["testcase_id"] = "case-2" },
		"record":   func(v map[string]any) { v["single_testcase_record"].(map[string]any)["record_id"] = "other" },
	} {
		t.Run(name, func(t *testing.T) {
			var copyValue map[string]any
			encoded, _ := json.Marshal(result)
			_ = json.Unmarshal(encoded, &copyValue)
			mutate(copyValue)
			encoded, _ = json.Marshal(copyValue)
			if validateRawExecutionResult(encoded, job) == nil {
				t.Fatal("provenance mutation accepted")
			}
		})
	}
}

func TestValidateRawExecutionSetResultUsesSetAttemptIdentity(t *testing.T) {
	inputHash := digest([]byte("one\n"))
	manifest := TestcaseSetManifest{
		ProblemID: "problem-v1", ProblemRevisionID: "revision-v1", TestdataVersionID: "testdata-v1",
		TestcaseSetID: "set-v1", ExecutionProfileID: "cpp20-gcc-13-v1",
		Entries: []TestcaseSetEntry{{Index: 0, TestcaseID: "case-1", TestdataVersionID: "testdata-v1", Input: "one\n", InputSHA256: inputHash, ExecutionProfileID: "cpp20-gcc-13-v1"}},
	}
	manifest.ManifestHash = testcaseSetManifestHash(manifest)
	job := Job{
		ID: "job-set", SubmissionID: "submission-set", ProblemID: "problem-v1", ProblemRevisionID: "revision-v1",
		TestdataVersionRef: "testdata-v1", TestcaseSet: &manifest, ExecutionSetPolicy: "RUN_ALL",
		Attempt: 2, ExecutionRequestID: "job-set:2", ExecutionAttemptID: "job-set:2:attempt", ResultGeneration: 2,
		LanguageProfileID: "cpp20-gcc-13-v1", SourceSHA256: strings.Repeat("a", 64),
	}
	record := map[string]any{
		"record_version": "2C.3", "record_id": "job-set:2:testcase:0:case-1",
		"identity":                 map[string]any{"problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1", "testcase_id": "case-1", "input_sha256": inputHash, "execution_profile_id": "cpp20-gcc-13-v1", "execution_attempt_id": "job-set:2:attempt:testcase:0"},
		"execution_set_attempt_id": "job-set:2:attempt", "testcase_index": 0, "testcase_set_manifest_hash": manifest.ManifestHash,
	}
	sealDigest(record)
	aggregate := map[string]any{
		"record_version": "2C.4", "record_id": "job-set:2:record", "submission_id": "submission-set", "source_sha256": strings.Repeat("a", 64),
		"problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1", "testcase_set_id": "set-v1",
		"manifest_hash": manifest.ManifestHash, "execution_set_request_id": "job-set:2", "execution_set_attempt_id": "job-set:2:attempt",
		"execution_profile_id": "cpp20-gcc-13-v1", "execution_policy": "RUN_ALL", "total_testcase_count": 1, "started_testcase_count": 1, "completed_testcase_count": 1,
		"testcases":     []any{map[string]any{"index": 0, "testcase_id": "case-1", "input_sha256": inputHash, "testdata_version_id": "testdata-v1", "execution_profile_id": "cpp20-gcc-13-v1", "status": "RAW_COMPLETED", "record": record}},
		"set_cancelled": false, "set_infrastructure_failure": false, "stop_reason": "COMPLETED", "cleanup_verified": true,
	}
	sealDigest(aggregate)
	result := map[string]any{
		"protocol_version": "2C.4", "execution_set_request_id": "job-set:2", "execution_set_attempt_id": "job-set:2:attempt",
		"judge_job_id": "job-set", "submission_id": "submission-set", "attempt": 2, "result_generation": 2,
		"language_profile_id": "cpp20-gcc-13-v1", "source_sha256": strings.Repeat("a", 64),
		"problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1", "testcase_set_id": "set-v1",
		"testcase_set_manifest_hash": manifest.ManifestHash, "execution_profile_id": "cpp20-gcc-13-v1", "execution_set_policy": "RUN_ALL",
		"pipeline_outcome": "PIPELINE_COMPLETED", "compile": map[string]any{"stdout": "", "stderr": "", "stdout_bytes": 0, "stderr_bytes": 0, "stdout_sha256": digest(nil), "stderr_sha256": digest(nil), "stdout_truncated": false, "stderr_truncated": false},
		"aggregate_execution_set_record": aggregate,
	}
	raw, _ := json.Marshal(result)
	if err := validateRawExecutionResult(raw, job); err != nil {
		t.Fatalf("valid testcase-set result rejected: %v", err)
	}
	result["execution_set_attempt_id"] = "job-set:1:attempt"
	raw, _ = json.Marshal(result)
	if validateRawExecutionResult(raw, job) == nil {
		t.Fatal("stale testcase-set attempt accepted")
	}
}

func TestValidateVerdictRecordRejectsTampering(t *testing.T) {
	expected := []byte("ok\n")
	checkerConfig := digest([]byte("EXACT_BYTES\x00builtin-v1"))
	inputHash := digest([]byte("input\n"))
	manifest := TestcaseSetManifest{ProblemID: "problem-v1", ProblemRevisionID: "revision-v1", TestdataVersionID: "testdata-v1", TestcaseSetID: "set-v1", ExecutionProfileID: "cpp20-gcc-13-v1", Entries: []TestcaseSetEntry{{Index: 0, TestcaseID: "case-1", TestdataVersionID: "testdata-v1", Input: "input\n", InputSHA256: inputHash, ExecutionProfileID: "cpp20-gcc-13-v1", ExpectedOutput: string(expected), ExpectedOutputSHA256: digest(expected), CheckerType: "EXACT_BYTES", CheckerVersion: "builtin-v1", CheckerConfigSHA256: checkerConfig}}}
	manifest.ManifestHash = testcaseSetManifestHash(manifest)
	job := Job{ID: "job-set", SubmissionID: "submission-set", ProblemID: "problem-v1", ProblemRevisionID: "revision-v1", TestdataVersionRef: "testdata-v1", TestcaseSet: &manifest, ExecutionSetPolicy: "RUN_ALL", Attempt: 1, ExecutionRequestID: "job-set:1", ExecutionAttemptID: "job-set:1:attempt", ResultGeneration: 1, LanguageProfileID: "cpp20-gcc-13-v1", SourceSHA256: strings.Repeat("a", 64)}
	stdout := []byte("ok\n")
	record := map[string]any{"record_version": "2C.3", "record_id": "job-set:1:testcase:0:case-1", "identity": map[string]any{"problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1", "testcase_id": "case-1", "input_sha256": inputHash, "execution_profile_id": "cpp20-gcc-13-v1", "execution_attempt_id": "job-set:1:attempt:testcase:0"}, "execution_set_attempt_id": "job-set:1:attempt", "testcase_index": 0, "testcase_set_manifest_hash": manifest.ManifestHash, "facts": map[string]any{"process_exited": true, "exit_code": 0, "cleanup_verified": true}}
	sealDigest(record)
	aggregate := map[string]any{"record_version": "2C.4", "record_id": "job-set:1:record", "submission_id": "submission-set", "source_sha256": strings.Repeat("a", 64), "problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1", "testcase_set_id": "set-v1", "manifest_hash": manifest.ManifestHash, "execution_set_request_id": "job-set:1", "execution_set_attempt_id": "job-set:1:attempt", "execution_profile_id": "cpp20-gcc-13-v1", "execution_policy": "RUN_ALL", "total_testcase_count": 1, "started_testcase_count": 1, "completed_testcase_count": 1, "testcases": []any{map[string]any{"index": 0, "testcase_id": "case-1", "input_sha256": inputHash, "testdata_version_id": "testdata-v1", "execution_profile_id": "cpp20-gcc-13-v1", "status": "RAW_COMPLETED", "record": record, "actual_stdout": stdout, "actual_stdout_sha256": digest(stdout), "actual_stdout_bytes": len(stdout)}}, "set_cancelled": false, "set_infrastructure_failure": false, "stop_reason": "COMPLETED", "cleanup_verified": true}
	sealDigest(aggregate)
	payload := map[string]any{"protocol_version": "2C.4", "execution_set_request_id": "job-set:1", "execution_set_attempt_id": "job-set:1:attempt", "judge_job_id": "job-set", "submission_id": "submission-set", "attempt": 1, "result_generation": 1, "language_profile_id": "cpp20-gcc-13-v1", "source_sha256": strings.Repeat("a", 64), "problem_id": "problem-v1", "problem_revision_id": "revision-v1", "testdata_version_id": "testdata-v1", "testcase_set_id": "set-v1", "testcase_set_manifest_hash": manifest.ManifestHash, "execution_profile_id": "cpp20-gcc-13-v1", "execution_set_policy": "RUN_ALL", "pipeline_outcome": "PIPELINE_COMPLETED", "compile": map[string]any{"stdout": "", "stderr": "", "stdout_bytes": 0, "stderr_bytes": 0, "stdout_sha256": digest(nil), "stderr_sha256": digest(nil), "stdout_truncated": false, "stderr_truncated": false}, "aggregate_execution_set_record": aggregate}
	raw, _ := json.Marshal(payload)
	derived, err := verdict.Derive(verdict.Input{SubmissionID: job.SubmissionID, ExecutionSetRequestID: job.ExecutionRequestID, ExecutionSetAttemptID: job.ExecutionAttemptID, ManifestHash: manifest.ManifestHash, Attempt: job.Attempt, Authoritative: true, Entries: queueVerdictEntries(&manifest), Raw: raw})
	if err != nil {
		t.Fatal(err)
	}
	payload["verdict_record"] = derived
	raw, _ = json.Marshal(payload)
	if err = validateRawExecutionResult(raw, job); err != nil {
		t.Fatalf("valid verdict rejected: %v", err)
	}
	derived.OverallUserVerdict = "WA"
	payload["verdict_record"] = derived
	raw, _ = json.Marshal(payload)
	if validateRawExecutionResult(raw, job) == nil {
		t.Fatal("tampered verdict accepted")
	}
}
