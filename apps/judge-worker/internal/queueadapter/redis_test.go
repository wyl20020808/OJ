package queueadapter

import (
	"encoding/json"
	"strings"
	"testing"
)

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
