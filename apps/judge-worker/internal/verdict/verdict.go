// Package verdict converts trusted, immutable raw execution facts into the
// deliberately small Phase 2C.5 user-verdict vocabulary.
package verdict

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

const EngineVersion = "2C.5-builtin-v1"

type Entry struct {
	Index                                               int
	TestcaseID, TestdataVersionID, ExpectedOutputSHA256 string
	ExpectedOutput                                      []byte
	ExpectedOutputBytes                                 int64
	OpenExpectedOutput                                  func() (io.ReadCloser, error)
	CheckerType, CheckerVersion, CheckerConfigSHA256    string
}

type Input struct {
	SubmissionID, ExecutionSetRequestID, ExecutionSetAttemptID, ManifestHash string
	Attempt                                                                  int
	Authoritative                                                            bool
	SupersededBy                                                             string
	Entries                                                                  []Entry
	Raw                                                                      json.RawMessage
}

type CaseRecord struct {
	RecordVersion         string `json:"record_version"`
	RecordID              string `json:"record_id"`
	SubmissionID          string `json:"submission_id"`
	ExecutionSetRequestID string `json:"execution_set_request_id"`
	ExecutionSetAttemptID string `json:"execution_set_attempt_id"`
	Attempt               int    `json:"attempt"`
	ManifestHash          string `json:"manifest_hash"`
	Authoritative         bool   `json:"authoritative"`
	SupersededBy          string `json:"superseded_by,omitempty"`
	StartedAt             string `json:"started_at,omitempty"`
	CompletedAt           string `json:"completed_at,omitempty"`
	TestcaseIndex         int    `json:"testcase_index"`
	TestcaseID            string `json:"testcase_id"`
	TestdataVersionID     string `json:"testdata_version_id"`
	RawRecordDigest       string `json:"raw_record_digest,omitempty"`
	CheckerType           string `json:"checker_type,omitempty"`
	CheckerVersion        string `json:"checker_version,omitempty"`
	CheckerConfigSHA256   string `json:"checker_config_sha256,omitempty"`
	ExpectedOutputSHA256  string `json:"expected_output_sha256,omitempty"`
	ActualStdoutSHA256    string `json:"actual_stdout_sha256,omitempty"`
	Verdict               string `json:"verdict,omitempty"`
	EvaluationState       string `json:"evaluation_state"`
	ReasonCode            string `json:"reason_code"`
	Diagnostic            string `json:"diagnostic,omitempty"`
	Digest                string `json:"digest"`
}

type AggregateRecord struct {
	RecordVersion         string       `json:"record_version"`
	RecordID              string       `json:"record_id"`
	SubmissionID          string       `json:"submission_id"`
	ExecutionSetRequestID string       `json:"execution_set_request_id"`
	ExecutionSetAttemptID string       `json:"execution_set_attempt_id"`
	Attempt               int          `json:"attempt"`
	ManifestHash          string       `json:"manifest_hash"`
	Authoritative         bool         `json:"authoritative"`
	SupersededBy          string       `json:"superseded_by,omitempty"`
	StartedAt             string       `json:"started_at,omitempty"`
	CompletedAt           string       `json:"completed_at,omitempty"`
	RawResultDigest       string       `json:"raw_result_digest"`
	CompileVerdict        string       `json:"compile_verdict,omitempty"`
	OverallUserVerdict    string       `json:"overall_user_verdict,omitempty"`
	EvaluationState       string       `json:"evaluation_state"`
	Cases                 []CaseRecord `json:"cases"`
	Digest                string       `json:"digest"`
}

type rawFacts struct {
	ProcessExited      bool   `json:"process_exited"`
	ExitCode           int    `json:"exit_code"`
	TerminationSignal  string `json:"termination_signal"`
	WallLimitReached   bool   `json:"wall_limit_reached"`
	MemoryLimitEvent   bool   `json:"memory_limit_event"`
	PidsLimitEvent     bool   `json:"pids_limit_event"`
	StdoutTruncated    bool   `json:"stdout_truncated"`
	StderrTruncated    bool   `json:"stderr_truncated"`
	Cancelled          bool   `json:"cancelled"`
	SandboxSetupFailed bool   `json:"sandbox_setup_failed"`
	RuntimeInfraFailed bool   `json:"runtime_infra_failed"`
	CleanupVerified    bool   `json:"cleanup_verified"`
}
type rawRecord struct {
	Digest string   `json:"digest"`
	Facts  rawFacts `json:"facts"`
}
type rawMember struct {
	Status                string    `json:"status"`
	Record                rawRecord `json:"record"`
	ActualStdout          []byte    `json:"actual_stdout"`
	ActualStdoutSHA256    string    `json:"actual_stdout_sha256"`
	ActualStdoutBytes     int       `json:"actual_stdout_bytes"`
	ActualStdoutTruncated bool      `json:"actual_stdout_truncated"`
}
type rawSet struct {
	PipelineOutcome string `json:"pipeline_outcome"`
	Compile         struct {
		Outcome        string   `json:"outcome"`
		DiagnosticCode string   `json:"diagnostic_code"`
		Facts          rawFacts `json:"raw_facts"`
		Clean          bool     `json:"clean"`
	} `json:"compile"`
	Aggregate struct {
		Digest                   string      `json:"digest"`
		Testcases                []rawMember `json:"testcases"`
		SetCancelled             bool        `json:"set_cancelled"`
		SetInfrastructureFailure bool        `json:"set_infrastructure_failure"`
		CleanupVerified          bool        `json:"cleanup_verified"`
	} `json:"aggregate_execution_set_record"`
	StartedAt   string `json:"started_at"`
	CompletedAt string `json:"completed_at"`
}

func Derive(input Input) (AggregateRecord, error) {
	if input.SubmissionID == "" || input.ExecutionSetRequestID == "" || input.ExecutionSetAttemptID == "" || input.Attempt < 1 || len(input.Entries) == 0 || !json.Valid(input.Raw) {
		return AggregateRecord{}, errors.New("invalid verdict input")
	}
	var raw rawSet
	if err := json.Unmarshal(input.Raw, &raw); err != nil {
		return AggregateRecord{}, errors.New("invalid raw testcase-set result")
	}
	if raw.Aggregate.Digest == "" {
		return AggregateRecord{}, errors.New("raw aggregate digest missing")
	}
	base := AggregateRecord{RecordVersion: EngineVersion, RecordID: input.ExecutionSetRequestID + ":verdict", SubmissionID: input.SubmissionID, ExecutionSetRequestID: input.ExecutionSetRequestID, ExecutionSetAttemptID: input.ExecutionSetAttemptID, Attempt: input.Attempt, ManifestHash: input.ManifestHash, Authoritative: input.Authoritative, SupersededBy: input.SupersededBy, StartedAt: raw.StartedAt, CompletedAt: raw.CompletedAt, RawResultDigest: raw.Aggregate.Digest}
	if !input.Authoritative {
		base.EvaluationState = "STALE_REJECTED"
		base.Cases = make([]CaseRecord, 0, len(input.Entries))
		for _, entry := range input.Entries {
			base.Cases = append(base.Cases, deriveCase(input, entry, rawMember{}))
		}
		return sealAggregate(base), nil
	}
	if raw.PipelineOutcome == "PIPELINE_CANCELLED" || raw.Aggregate.SetCancelled {
		base.EvaluationState = "CANCELLED"
		return sealAggregate(base), nil
	}
	if raw.PipelineOutcome == "PIPELINE_INFRA_FAILURE" || raw.Aggregate.SetInfrastructureFailure || !raw.Aggregate.CleanupVerified || infra(raw.Compile.Facts) {
		base.EvaluationState = "INFRA_FAILED"
		return sealAggregate(base), nil
	}
	if raw.PipelineOutcome == "PIPELINE_COMPILE_FAILED" && raw.Compile.Outcome == "COMPILE_FAILED" && raw.Compile.DiagnosticCode == "SOURCE_COMPILE_FAILED" && raw.Compile.Clean && raw.Compile.Facts.ProcessExited && raw.Compile.Facts.ExitCode > 0 && raw.Compile.Facts.TerminationSignal == "" && !compileInfra(raw.Compile.Facts) && !raw.Compile.Facts.Cancelled {
		base.Cases = make([]CaseRecord, 0)
		base.CompileVerdict, base.OverallUserVerdict, base.EvaluationState = "CE", "CE", "COMPLETE"
		return sealAggregate(base), nil
	}
	if raw.Compile.Outcome != "COMPILE_SUCCEEDED" {
		base.EvaluationState = "INFRA_FAILED"
		return sealAggregate(base), nil
	}
	if len(raw.Aggregate.Testcases) != len(input.Entries) {
		return AggregateRecord{}, errors.New("invalid raw testcase-set result")
	}
	base.Cases = make([]CaseRecord, 0, len(input.Entries))
	for i, entry := range input.Entries {
		base.Cases = append(base.Cases, deriveCase(input, entry, raw.Aggregate.Testcases[i]))
	}
	for _, c := range base.Cases {
		if c.EvaluationState != "COMPLETE" {
			base.EvaluationState = c.EvaluationState
			return sealAggregate(base), nil
		}
	}
	if raw.PipelineOutcome == "PIPELINE_LIMIT_HIT" && !hasResourceVerdict(base.Cases) {
		base.EvaluationState = "INFRA_FAILED"
		return sealAggregate(base), nil
	}
	base.EvaluationState = "COMPLETE"
	for _, c := range base.Cases {
		if c.Verdict != "AC" {
			base.OverallUserVerdict = c.Verdict
			return sealAggregate(base), nil
		}
	}
	base.OverallUserVerdict = "AC"
	return sealAggregate(base), nil
}

func hasResourceVerdict(cases []CaseRecord) bool {
	for _, c := range cases {
		if c.Verdict == "TLE" || c.Verdict == "MLE" {
			return true
		}
	}
	return false
}

func deriveCase(input Input, entry Entry, member rawMember) CaseRecord {
	c := CaseRecord{RecordVersion: EngineVersion, RecordID: fmt.Sprintf("%s:verdict:%d", input.ExecutionSetRequestID, entry.Index), SubmissionID: input.SubmissionID, ExecutionSetRequestID: input.ExecutionSetRequestID, ExecutionSetAttemptID: input.ExecutionSetAttemptID, Attempt: input.Attempt, ManifestHash: input.ManifestHash, Authoritative: input.Authoritative, SupersededBy: input.SupersededBy, StartedAt: rawStartedAt(input.Raw), CompletedAt: rawCompletedAt(input.Raw), TestcaseIndex: entry.Index, TestcaseID: entry.TestcaseID, TestdataVersionID: entry.TestdataVersionID, RawRecordDigest: member.Record.Digest, CheckerType: entry.CheckerType, CheckerVersion: entry.CheckerVersion, CheckerConfigSHA256: entry.CheckerConfigSHA256, ExpectedOutputSHA256: entry.ExpectedOutputSHA256, ActualStdoutSHA256: member.ActualStdoutSHA256}
	if !input.Authoritative {
		c.EvaluationState, c.ReasonCode = "STALE_REJECTED", "STALE_ATTEMPT"
		return sealCase(c)
	}
	if member.Status == "CANCELLED" || member.Status == "CANCELLED_BEFORE_START" || member.Record.Facts.Cancelled {
		c.EvaluationState, c.ReasonCode = "CANCELLED", "CANCELLED"
		return sealCase(c)
	}
	if member.Status != "RAW_COMPLETED" || infra(member.Record.Facts) || member.Record.Facts.PidsLimitEvent || member.Record.Facts.StdoutTruncated || member.Record.Facts.StderrTruncated || member.ActualStdoutTruncated || member.ActualStdoutBytes < 0 || member.ActualStdoutBytes > 64*1024 || len(member.ActualStdout) != member.ActualStdoutBytes || sha(member.ActualStdout) != member.ActualStdoutSHA256 {
		c.EvaluationState, c.ReasonCode = "INFRA_FAILED", "RAW_FACTS_UNQUALIFIED"
		return sealCase(c)
	}
	if member.Record.Facts.MemoryLimitEvent {
		c.EvaluationState, c.Verdict, c.ReasonCode = "COMPLETE", "MLE", "MEMORY_LIMIT_ENFORCED"
		return sealCase(c)
	}
	if member.Record.Facts.WallLimitReached {
		c.EvaluationState, c.Verdict, c.ReasonCode = "COMPLETE", "TLE", "TIME_LIMIT_ENFORCED"
		return sealCase(c)
	}
	if member.Record.Facts.ProcessExited && ((member.Record.Facts.ExitCode > 0 && member.Record.Facts.TerminationSignal == "") || (member.Record.Facts.ExitCode != 0 && userFailureSignal(member.Record.Facts.TerminationSignal))) {
		c.EvaluationState, c.Verdict, c.ReasonCode = "COMPLETE", "RE", "USER_RUNTIME_FAILURE"
		return sealCase(c)
	}
	if !member.Record.Facts.ProcessExited || member.Record.Facts.ExitCode != 0 || member.Record.Facts.TerminationSignal != "" {
		c.EvaluationState, c.ReasonCode = "NO_VERDICT", "NORMAL_COMPLETION_UNPROVEN"
		return sealCase(c)
	}
	if entry.CheckerType == "" || entry.CheckerVersion != "builtin-v1" || (entry.OpenExpectedOutput == nil && sha(entry.ExpectedOutput) != entry.ExpectedOutputSHA256) || sha([]byte(entry.CheckerType+"\x00"+entry.CheckerVersion)) != entry.CheckerConfigSHA256 || sha(member.ActualStdout) != member.ActualStdoutSHA256 {
		c.EvaluationState, c.ReasonCode = "INFRA_FAILED", "CHECKER_INPUT_INTEGRITY"
		return sealCase(c)
	}
	matched := false
	diagnostic := ""
	if entry.OpenExpectedOutput != nil {
		var err error
		matched, diagnostic, err = matchExpectedStream(entry, member.ActualStdout)
		if err != nil {
			c.EvaluationState, c.ReasonCode = "INFRA_FAILED", "CHECKER_INPUT_INTEGRITY"
			return sealCase(c)
		}
	} else {
		switch entry.CheckerType {
		case "EXACT_BYTES":
			matched, diagnostic = exactMatch(entry.ExpectedOutput, member.ActualStdout)
		case "TOKEN_WHITESPACE":
			matched, diagnostic = tokenMatch(entry.ExpectedOutput, member.ActualStdout)
		default:
			c.EvaluationState, c.ReasonCode = "INFRA_FAILED", "CHECKER_UNSUPPORTED"
			return sealCase(c)
		}
	}
	c.EvaluationState, c.ReasonCode, c.Diagnostic = "COMPLETE", "CHECKER_MATCH", diagnostic
	if matched {
		c.Verdict = "AC"
	} else {
		c.Verdict, c.ReasonCode = "WA", "CHECKER_MISMATCH"
	}
	return sealCase(c)
}
func infra(f rawFacts) bool {
	return f.SandboxSetupFailed || f.RuntimeInfraFailed || !f.CleanupVerified
}
func compileInfra(f rawFacts) bool {
	return infra(f) || f.PidsLimitEvent || f.StdoutTruncated || f.StderrTruncated || f.WallLimitReached || f.MemoryLimitEvent
}
func userFailureSignal(signal string) bool {
	switch signal {
	case "SIGABRT", "SIGBUS", "SIGFPE", "SIGILL", "SIGSEGV", "SIGTERM", "SIGQUIT", "SIGHUP":
		return true
	default:
		return false
	}
}
func equalTokens(a, b []byte) bool {
	matched, _ := tokenMatch(a, b)
	return matched
}
func exactMatch(a, b []byte) (bool, string) {
	limit := len(a)
	if len(b) < limit {
		limit = len(b)
	}
	for i := 0; i < limit; i++ {
		if a[i] != b[i] {
			return false, fmt.Sprintf("first_mismatch_offset=%d", i)
		}
	}
	if len(a) != len(b) {
		return false, fmt.Sprintf("first_mismatch_offset=%d", limit)
	}
	return true, ""
}
func tokenMatch(a, b []byte) (bool, string) {
	ai, bi := 0, 0
	ordinal := 0
	for {
		at, an := token(a, ai)
		bt, bn := token(b, bi)
		if string(at) != string(bt) {
			return false, fmt.Sprintf("token_mismatch_index=%d", ordinal)
		}
		if at == nil {
			return true, ""
		}
		ai, bi = an, bn
		ordinal++
	}
}
func token(b []byte, i int) ([]byte, int) {
	for i < len(b) && asciiWS(b[i]) {
		i++
	}
	if i == len(b) {
		return nil, i
	}
	start := i
	for i < len(b) && !asciiWS(b[i]) {
		i++
	}
	return b[start:i], i
}
func asciiWS(b byte) bool    { return b == 9 || b == 10 || b == 11 || b == 12 || b == 13 || b == 32 }
func sha(v []byte) string    { return digest(v) }
func digest(v []byte) string { sum := sha256.Sum256(v); return hex.EncodeToString(sum[:]) }

// canonicalDigest makes record digests independent of JSON object key order.
func canonicalDigest(v any) (string, error) {
	encoded, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &object); err != nil {
		return "", err
	}
	delete(object, "digest")
	encoded, err = json.Marshal(object)
	if err != nil {
		return "", err
	}
	var normalized any
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		return "", err
	}
	canonical, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return digest(canonical), nil
}

func VerifyDigest(raw json.RawMessage) bool {
	var value map[string]json.RawMessage
	if json.Unmarshal(raw, &value) != nil {
		return false
	}
	claimed, ok := value["digest"]
	if !ok {
		return false
	}
	var digestValue string
	if json.Unmarshal(claimed, &digestValue) != nil || !isDigest(digestValue) {
		return false
	}
	delete(value, "digest")
	actual, err := canonicalDigest(value)
	return err == nil && actual == digestValue
}

func isDigest(v string) bool {
	if len(v) != sha256.Size*2 || v != strings.ToLower(v) {
		return false
	}
	_, err := hex.DecodeString(v)
	return err == nil
}
func sealCase(c CaseRecord) CaseRecord {
	c.Digest = ""
	c.Digest, _ = canonicalDigest(c)
	return c
}
func sealAggregate(a AggregateRecord) AggregateRecord {
	a.Digest = ""
	a.Digest, _ = canonicalDigest(a)
	return a
}

func rawStartedAt(raw json.RawMessage) string {
	var value struct {
		StartedAt string `json:"started_at"`
	}
	_ = json.Unmarshal(raw, &value)
	return value.StartedAt
}

func rawCompletedAt(raw json.RawMessage) string {
	var value struct {
		CompletedAt string `json:"completed_at"`
	}
	_ = json.Unmarshal(raw, &value)
	return value.CompletedAt
}
