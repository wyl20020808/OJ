package verdict

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

func hash(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }
func entry(index int, expected string, kind string) Entry {
	return Entry{Index: index, TestcaseID: "case-" + string(rune('a'+index)), TestdataVersionID: "testdata-v1", ExpectedOutput: []byte(expected), ExpectedOutputSHA256: hash([]byte(expected)), CheckerType: kind, CheckerVersion: "builtin-v1", CheckerConfigSHA256: hash([]byte(kind + "\x00builtin-v1"))}
}
func raw(t *testing.T, outcome string, cases []map[string]any) json.RawMessage {
	t.Helper()
	members := make([]map[string]any, 0, len(cases))
	for _, c := range cases {
		stdout := []byte(c["stdout"].(string))
		facts, _ := c["facts"].(map[string]any)
		if facts == nil {
			facts = map[string]any{}
		}
		facts["process_exited"] = true
		facts["cleanup_verified"] = true
		members = append(members, map[string]any{"status": "RAW_COMPLETED", "record": map[string]any{"digest": hash([]byte("record" + string(rune('0'+len(members))))), "facts": facts}, "actual_stdout": stdout, "actual_stdout_sha256": hash(stdout), "actual_stdout_bytes": len(stdout), "actual_stdout_truncated": false})
	}
	v := map[string]any{"pipeline_outcome": outcome, "compile": map[string]any{"outcome": "COMPILE_SUCCEEDED", "clean": true, "raw_facts": map[string]any{"cleanup_verified": true}}, "aggregate_execution_set_record": map[string]any{"digest": hash([]byte("aggregate")), "testcases": members, "cleanup_verified": true}}
	encoded, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
func derive(t *testing.T, entries []Entry, raw json.RawMessage) AggregateRecord {
	t.Helper()
	got, err := Derive(Input{SubmissionID: "submission-1", ExecutionSetRequestID: "job-1:1", ExecutionSetAttemptID: "job-1:1:attempt", ManifestHash: hash([]byte("manifest")), Attempt: 1, Authoritative: true, Entries: entries, Raw: raw})
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestExactAndTokenCheckersAreDeterministic(t *testing.T) {
	for i := 0; i < 100; i++ {
		got := derive(t, []Entry{entry(0, "a b\n", "TOKEN_WHITESPACE")}, raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "a\t b  \r\n"}}))
		if got.OverallUserVerdict != "AC" || got.Cases[0].Digest == "" {
			t.Fatalf("token checker: %#v", got)
		}
	}
	got := derive(t, []Entry{entry(0, "a b\n", "EXACT_BYTES")}, raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "a b\r\n"}}))
	if got.OverallUserVerdict != "WA" {
		t.Fatalf("exact bytes must differ: %#v", got)
	}
}
func TestDecisionOrderRejectsUnsafeInference(t *testing.T) {
	tests := []struct {
		name  string
		facts map[string]any
		want  string
		state string
	}{
		{"mle", map[string]any{"memory_limit_event": true}, "MLE", "COMPLETE"},
		{"tle", map[string]any{"wall_limit_reached": true}, "TLE", "COMPLETE"},
		{"re", map[string]any{"exit_code": 7}, "RE", "COMPLETE"},
		{"signal re", map[string]any{"exit_code": -1, "termination_signal": "SIGSEGV"}, "RE", "COMPLETE"},
		{"unattributed kill", map[string]any{"exit_code": -1, "termination_signal": "SIGKILL"}, "", "NO_VERDICT"},
		{"pids infra", map[string]any{"pids_limit_event": true}, "", "INFRA_FAILED"},
		{"truncated infra", map[string]any{"stdout_truncated": true}, "", "INFRA_FAILED"},
		{"infra precedes mle", map[string]any{"runtime_infra_failed": true, "memory_limit_event": true}, "", "INFRA_FAILED"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := derive(t, []Entry{entry(0, "ok\n", "EXACT_BYTES")}, raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "ok\n", "facts": tt.facts}}))
			c := got.Cases[0]
			if c.Verdict != tt.want || c.EvaluationState != tt.state {
				t.Fatalf("got %+v", c)
			}
		})
	}
}

func TestCompileResourceAndCancellationCannotBecomeCE(t *testing.T) {
	for _, facts := range []map[string]any{
		{"wall_limit_reached": true},
		{"memory_limit_event": true},
		{"pids_limit_event": true},
		{"stdout_truncated": true},
		{"stderr_truncated": true},
		{"cancelled": true},
	} {
		r := raw(t, "PIPELINE_COMPILE_FAILED", []map[string]any{{"stdout": "", "facts": facts}})
		var payload map[string]any
		if err := json.Unmarshal(r, &payload); err != nil {
			t.Fatal(err)
		}
		payload["compile"] = map[string]any{
			"outcome": "COMPILE_FAILED", "diagnostic_code": "SOURCE_COMPILE_FAILED",
			"clean": true, "raw_facts": map[string]any{"process_exited": true, "exit_code": 0, "cleanup_verified": true, "wall_limit_reached": facts["wall_limit_reached"], "memory_limit_event": facts["memory_limit_event"], "pids_limit_event": facts["pids_limit_event"], "stdout_truncated": facts["stdout_truncated"], "stderr_truncated": facts["stderr_truncated"], "cancelled": facts["cancelled"]},
		}
		r, _ = json.Marshal(payload)
		got := derive(t, []Entry{entry(0, "ok\n", "EXACT_BYTES")}, r)
		if got.OverallUserVerdict != "" || got.CompileVerdict != "" {
			t.Fatalf("unqualified compile must not become CE: facts=%v result=%#v", facts, got)
		}
	}
}
func TestAggregateUsesFirstManifestNonACAndBlocksIncomplete(t *testing.T) {
	entries := []Entry{entry(0, "ok\n", "EXACT_BYTES"), entry(1, "no\n", "EXACT_BYTES"), entry(2, "yes\n", "EXACT_BYTES")}
	got := derive(t, entries, raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "ok\n"}, {"stdout": "bad\n"}, {"stdout": "bad\n", "facts": map[string]any{"wall_limit_reached": true}}}))
	if got.OverallUserVerdict != "WA" {
		t.Fatalf("first non-AC must win: %#v", got)
	}
	got = derive(t, entries, raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "ok\n"}, {"stdout": "bad\n", "facts": map[string]any{"runtime_infra_failed": true}}, {"stdout": "yes\n"}}))
	if got.OverallUserVerdict != "" || got.EvaluationState != "INFRA_FAILED" {
		t.Fatalf("incomplete aggregate: %#v", got)
	}
}
func TestCompileFailureOnlyMakesCEWithQualifiedEvidence(t *testing.T) {
	r := raw(t, "PIPELINE_COMPILE_FAILED", []map[string]any{{"stdout": ""}})
	var v map[string]any
	_ = json.Unmarshal(r, &v)
	v["compile"] = map[string]any{"outcome": "COMPILE_FAILED", "diagnostic_code": "SOURCE_COMPILE_FAILED", "clean": true, "raw_facts": map[string]any{"process_exited": true, "exit_code": 1, "cleanup_verified": true}}
	r, _ = json.Marshal(v)
	got := derive(t, []Entry{entry(0, "ok\n", "EXACT_BYTES")}, r)
	if got.CompileVerdict != "CE" || got.OverallUserVerdict != "CE" || len(got.Cases) != 0 {
		t.Fatalf("qualified CE: %#v", got)
	}
	encoded, err := json.Marshal(got)
	if err != nil || !strings.Contains(string(encoded), `"cases":[]`) {
		t.Fatalf("CE must serialize an empty cases array: %v %s", err, encoded)
	}
	v["compile"] = map[string]any{"outcome": "COMPILE_FAILED", "diagnostic_code": "SOURCE_COMPILE_FAILED", "clean": true, "raw_facts": map[string]any{"process_exited": true, "exit_code": 1, "cleanup_verified": true, "runtime_infra_failed": true}}
	r, _ = json.Marshal(v)
	got = derive(t, []Entry{entry(0, "ok\n", "EXACT_BYTES")}, r)
	if got.OverallUserVerdict != "" || got.EvaluationState != "INFRA_FAILED" {
		t.Fatalf("infra cannot be CE: %#v", got)
	}
}

func TestCancellationAndInfrastructurePrecedeCompileVerdict(t *testing.T) {
	r := raw(t, "PIPELINE_COMPILE_FAILED", []map[string]any{{"stdout": ""}})
	var payload map[string]any
	if err := json.Unmarshal(r, &payload); err != nil {
		t.Fatal(err)
	}
	payload["compile"] = map[string]any{
		"outcome": "COMPILE_FAILED", "diagnostic_code": "SOURCE_COMPILE_FAILED",
		"clean": true, "raw_facts": map[string]any{"cleanup_verified": true},
	}
	aggregate := payload["aggregate_execution_set_record"].(map[string]any)
	aggregate["set_cancelled"] = true
	payload["pipeline_outcome"] = "PIPELINE_CANCELLED"
	r, _ = json.Marshal(payload)
	got := derive(t, []Entry{entry(0, "ok\n", "EXACT_BYTES")}, r)
	if got.OverallUserVerdict != "" || got.EvaluationState != "CANCELLED" || got.CompileVerdict != "" {
		t.Fatalf("cancelled compile must not become CE: %#v", got)
	}

	payload["pipeline_outcome"] = "PIPELINE_INFRA_FAILURE"
	aggregate["set_cancelled"] = false
	aggregate["set_infrastructure_failure"] = true
	r, _ = json.Marshal(payload)
	got = derive(t, []Entry{entry(0, "ok\n", "EXACT_BYTES")}, r)
	if got.OverallUserVerdict != "" || got.EvaluationState != "INFRA_FAILED" || got.CompileVerdict != "" {
		t.Fatalf("infra compile must not become CE: %#v", got)
	}
}

func TestStaleAttemptProducesExplicitNonVerdictRecord(t *testing.T) {
	got, err := Derive(Input{
		SubmissionID: "submission-1", ExecutionSetRequestID: "job-1:1",
		ExecutionSetAttemptID: "job-1:1:attempt", ManifestHash: hash([]byte("manifest")),
		Attempt: 1, Authoritative: false, SupersededBy: "job-1:2:attempt",
		Entries: []Entry{entry(0, "ok\n", "EXACT_BYTES")},
		Raw:     raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "ok\n"}}),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.EvaluationState != "STALE_REJECTED" || got.OverallUserVerdict != "" || got.Authoritative || got.SupersededBy != "job-1:2:attempt" {
		t.Fatalf("stale record: %#v", got)
	}
	if len(got.Cases) != 1 || got.Cases[0].EvaluationState != "STALE_REJECTED" || got.Cases[0].Verdict != "" {
		t.Fatalf("stale case: %#v", got.Cases)
	}
}

func TestCheckerDiagnosticsAreBoundedAndDeterministic(t *testing.T) {
	got := derive(t, []Entry{entry(0, "expected", "EXACT_BYTES")}, raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "actual"}}))
	if got.Cases[0].Diagnostic != "first_mismatch_offset=0" {
		t.Fatalf("exact diagnostic: %#v", got.Cases[0])
	}
	got = derive(t, []Entry{entry(0, "a b", "TOKEN_WHITESPACE")}, raw(t, "PIPELINE_COMPLETED", []map[string]any{{"stdout": "a c"}}))
	if got.Cases[0].Diagnostic != "token_mismatch_index=1" {
		t.Fatalf("token diagnostic: %#v", got.Cases[0])
	}
}
