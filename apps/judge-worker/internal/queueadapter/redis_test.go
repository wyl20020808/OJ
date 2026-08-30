package queueadapter

import (
	"encoding/json"
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
