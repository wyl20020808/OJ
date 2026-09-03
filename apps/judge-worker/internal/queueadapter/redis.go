package queueadapter

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ojplatform/judge-worker/internal/verdict"
)

type Job struct {
	ID                     string               `json:"id"`
	SubmissionID           string               `json:"submissionId"`
	EvaluationGeneration   int                  `json:"evaluationGeneration"`
	IdempotencyKey         string               `json:"idempotencyKey"`
	OwnerUserID            string               `json:"ownerUserId"`
	ProblemID              string               `json:"problemId"`
	ProblemRevisionID      string               `json:"problemRevisionId"`
	TestdataVersionRef     string               `json:"testdataVersionRef"`
	TestcaseID             string               `json:"testcaseId"`
	TestcaseInput          string               `json:"testcaseInput"`
	TestcaseInputSHA256    string               `json:"testcaseInputSha256"`
	ExecutionProfileID     string               `json:"executionProfileId"`
	TestcaseSet            *TestcaseSetManifest `json:"testcaseSet,omitempty"`
	ExecutionSetPolicy     string               `json:"executionSetPolicy,omitempty"`
	LanguageID             string               `json:"languageId"`
	ExecutionMode          string               `json:"executionMode"`
	LanguageProfileID      string               `json:"languageProfileId"`
	SourceSnapshotRef      string               `json:"sourceSnapshotRef"`
	SourceBytes            string               `json:"sourceBytes"`
	SourceSHA256           string               `json:"sourceSha256"`
	ControlledInputID      string               `json:"controlledInputId"`
	RawExecutionResult     json.RawMessage      `json:"rawExecutionResult,omitempty"`
	Status                 string               `json:"status"`
	Attempt                int                  `json:"attempt"`
	MaxAttempts            int                  `json:"maxAttempts"`
	LeaseOwner             string               `json:"leaseOwner"`
	LeaseToken             string               `json:"leaseToken"`
	LeaseExpiresAt         time.Time            `json:"leaseExpiresAt"`
	FixtureID              string               `json:"fixtureId"`
	FailureReason          string               `json:"failureReason"`
	SyntheticFixtureID     string               `json:"syntheticFixtureId"`
	CompletedAt            string               `json:"completedAt"`
	CreatedAt              string               `json:"createdAt"`
	UpdatedAt              string               `json:"updatedAt"`
	ExecutionRequestID     string               `json:"executionRequestId"`
	ExecutionAttemptID     string               `json:"executionAttemptId"`
	ResultGeneration       int64                `json:"resultGeneration"`
	ResultDigest           string               `json:"rawResultDigest"`
	CancellationGeneration int64                `json:"cancellationGeneration"`
}

func normalizeEvaluationGeneration(job *Job) {
	if job.EvaluationGeneration == 0 {
		job.EvaluationGeneration = 1
	}
}

type TestcaseSetEntry struct {
	Index                int    `json:"index"`
	TestcaseID           string `json:"testcaseId"`
	TestdataVersionID    string `json:"testdataVersionId"`
	Input                string `json:"input"`
	InputSHA256          string `json:"inputSha256"`
	ExecutionProfileID   string `json:"executionProfileId"`
	ExpectedOutputSHA256 string `json:"expectedOutputSha256,omitempty"`
	ExpectedOutput       string `json:"expectedOutput"`
	CheckerType          string `json:"checkerType,omitempty"`
	CheckerVersion       string `json:"checkerVersion,omitempty"`
	CheckerConfigSHA256  string `json:"checkerConfigSha256,omitempty"`
}

type TestcaseSetManifest struct {
	ProblemID          string             `json:"problemId"`
	ProblemRevisionID  string             `json:"problemRevisionId"`
	TestdataVersionID  string             `json:"testdataVersionId"`
	TestcaseSetID      string             `json:"testcaseSetId"`
	ExecutionProfileID string             `json:"executionProfileId"`
	Entries            []TestcaseSetEntry `json:"entries"`
	ManifestHash       string             `json:"manifestHash"`
}

type rawExecutionResultIdentity struct {
	ProtocolVersion         string `json:"protocol_version"`
	ExecutionRequestID      string `json:"execution_request_id"`
	ExecutionSetRequestID   string `json:"execution_set_request_id"`
	JudgeJobID              string `json:"judge_job_id"`
	SubmissionID            string `json:"submission_id"`
	Attempt                 int    `json:"attempt"`
	ExecutionAttemptID      string `json:"execution_attempt_id"`
	ResultGeneration        int64  `json:"result_generation"`
	LanguageProfileID       string `json:"language_profile_id"`
	SourceSHA256            string `json:"source_sha256"`
	TestcaseID              string `json:"testcase_id"`
	TestcaseInputSHA256     string `json:"testcase_input_sha256"`
	ExecutionProfileID      string `json:"execution_profile_id"`
	TestcaseSetID           string `json:"testcase_set_id"`
	TestcaseSetManifestHash string `json:"testcase_set_manifest_hash"`
	ExecutionSetAttemptID   string `json:"execution_set_attempt_id"`
	ExecutionSetPolicy      string `json:"execution_set_policy"`
	ProblemID               string `json:"problem_id"`
	ProblemRevisionID       string `json:"problem_revision_id"`
	TestdataVersionID       string `json:"testdata_version_id"`
	SingleTestcaseRecord    *struct {
		RecordVersion string `json:"record_version"`
		RecordID      string `json:"record_id"`
		Digest        string `json:"digest"`
		Identity      struct {
			ProblemID          string `json:"problem_id"`
			ProblemRevisionID  string `json:"problem_revision_id"`
			TestdataVersionID  string `json:"testdata_version_id"`
			TestcaseID         string `json:"testcase_id"`
			InputSHA256        string `json:"input_sha256"`
			ExecutionProfileID string `json:"execution_profile_id"`
			ExecutionAttemptID string `json:"execution_attempt_id"`
		} `json:"identity"`
	} `json:"single_testcase_record"`
	PipelineOutcome             string          `json:"pipeline_outcome"`
	Compile                     json.RawMessage `json:"compile"`
	Runtime                     json.RawMessage `json:"runtime"`
	AggregateExecutionSetRecord json.RawMessage `json:"aggregate_execution_set_record"`
}

func validateRawExecutionResult(result json.RawMessage, job Job) error {
	var identity rawExecutionResultIdentity
	if !json.Valid(result) || json.Unmarshal(result, &identity) != nil {
		return errors.New("invalid raw execution result")
	}
	if job.TestcaseSet != nil {
		return validateRawExecutionSetResult(result, identity, job)
	}
	allowedOutcome := map[string]bool{
		"PIPELINE_COMPLETED":      true,
		"PIPELINE_COMPILE_FAILED": true,
		"PIPELINE_LIMIT_HIT":      true,
		"PIPELINE_CANCELLED":      true,
		"PIPELINE_INFRA_FAILURE":  true,
	}
	if identity.ProtocolVersion != "2C.3" && identity.ProtocolVersion != "2C.1" ||
		identity.ExecutionRequestID != executionRequestID(job) ||
		identity.JudgeJobID != job.ID ||
		identity.SubmissionID != job.SubmissionID ||
		identity.Attempt != job.Attempt ||
		identity.LanguageProfileID != job.LanguageProfileID ||
		identity.SourceSHA256 != job.SourceSHA256 ||
		!allowedOutcome[identity.PipelineOutcome] ||
		len(identity.Compile) == 0 || string(identity.Compile) == "null" ||
		identity.ExecutionAttemptID != job.ExecutionAttemptID ||
		identity.ResultGeneration != job.ResultGeneration {
		return errors.New("raw execution result identity mismatch")
	}
	testcaseJob := job.TestcaseID != ""
	if testcaseJob && (identity.ProtocolVersion != "2C.3" || identity.TestcaseID != job.TestcaseID || identity.TestcaseInputSHA256 != job.TestcaseInputSHA256 || identity.ExecutionProfileID != job.ExecutionProfileID) {
		return errors.New("raw testcase result identity mismatch")
	}
	if testcaseJob && (identity.ProblemID != job.ProblemID || identity.ProblemRevisionID != job.ProblemRevisionID || identity.TestdataVersionID != job.TestdataVersionRef) {
		return errors.New("raw provenance result identity mismatch")
	}
	if testcaseJob && (identity.SingleTestcaseRecord == nil || identity.SingleTestcaseRecord.RecordVersion != "2C.3" || identity.SingleTestcaseRecord.RecordID != identity.ExecutionRequestID+":"+job.TestcaseID || !isSHA256(identity.SingleTestcaseRecord.Digest) || identity.SingleTestcaseRecord.Identity.ProblemID != job.ProblemID || identity.SingleTestcaseRecord.Identity.ProblemRevisionID != job.ProblemRevisionID || identity.SingleTestcaseRecord.Identity.TestdataVersionID != job.TestdataVersionRef || identity.SingleTestcaseRecord.Identity.TestcaseID != job.TestcaseID || identity.SingleTestcaseRecord.Identity.InputSHA256 != job.TestcaseInputSHA256 || identity.SingleTestcaseRecord.Identity.ExecutionProfileID != job.ExecutionProfileID || identity.SingleTestcaseRecord.Identity.ExecutionAttemptID != identity.ExecutionAttemptID) {
		return errors.New("missing immutable testcase execution record")
	}
	if testcaseJob && (!validRawStageOutput(identity.Compile) || (len(identity.Runtime) > 0 && string(identity.Runtime) != "null" && !validRawStageOutput(identity.Runtime))) {
		return errors.New("invalid bounded output metadata")
	}
	return nil
}

type rawSetAggregate struct {
	RecordVersion            string         `json:"record_version"`
	RecordID                 string         `json:"record_id"`
	SubmissionID             string         `json:"submission_id"`
	SourceSHA256             string         `json:"source_sha256"`
	ProblemID                string         `json:"problem_id"`
	ProblemRevisionID        string         `json:"problem_revision_id"`
	TestdataVersionID        string         `json:"testdata_version_id"`
	TestcaseSetID            string         `json:"testcase_set_id"`
	ManifestHash             string         `json:"manifest_hash"`
	ExecutionSetRequestID    string         `json:"execution_set_request_id"`
	ExecutionSetAttemptID    string         `json:"execution_set_attempt_id"`
	ExecutionProfileID       string         `json:"execution_profile_id"`
	ExecutionPolicy          string         `json:"execution_policy"`
	TotalTestcaseCount       int            `json:"total_testcase_count"`
	StartedTestcaseCount     int            `json:"started_testcase_count"`
	CompletedTestcaseCount   int            `json:"completed_testcase_count"`
	Testcases                []rawSetMember `json:"testcases"`
	SetCancelled             bool           `json:"set_cancelled"`
	SetInfrastructureFailure bool           `json:"set_infrastructure_failure"`
	StopReason               string         `json:"stop_reason"`
	CleanupVerified          bool           `json:"cleanup_verified"`
	Digest                   string         `json:"digest"`
}

type rawSetMember struct {
	Index                 int             `json:"index"`
	TestcaseID            string          `json:"testcase_id"`
	InputSHA256           string          `json:"input_sha256"`
	TestdataVersionID     string          `json:"testdata_version_id"`
	ExecutionProfileID    string          `json:"execution_profile_id"`
	Status                string          `json:"status"`
	Record                json.RawMessage `json:"record"`
	ActualStdout          []byte          `json:"actual_stdout"`
	ActualStdoutSHA256    string          `json:"actual_stdout_sha256"`
	ActualStdoutBytes     int             `json:"actual_stdout_bytes"`
	ActualStdoutTruncated bool            `json:"actual_stdout_truncated"`
}

func validateRawExecutionSetResult(result json.RawMessage, identity rawExecutionResultIdentity, job Job) error {
	manifest := job.TestcaseSet
	if err := validateRawExecutionSetIdentity(identity, job, manifest); err != nil {
		return err
	}
	var aggregate rawSetAggregate
	if json.Unmarshal(identity.AggregateExecutionSetRecord, &aggregate) != nil || !verdict.VerifyDigest(identity.AggregateExecutionSetRecord) || aggregate.RecordVersion != "2C.4" || aggregate.RecordID != executionRequestID(job)+":record" || aggregate.SubmissionID != job.SubmissionID || aggregate.SourceSHA256 != job.SourceSHA256 || aggregate.ProblemID != job.ProblemID || aggregate.ProblemRevisionID != job.ProblemRevisionID || aggregate.TestdataVersionID != job.TestdataVersionRef || aggregate.TestcaseSetID != manifest.TestcaseSetID || aggregate.ManifestHash != manifest.ManifestHash || aggregate.ExecutionSetRequestID != executionRequestID(job) || aggregate.ExecutionSetAttemptID != job.ExecutionAttemptID || aggregate.ExecutionProfileID != manifest.ExecutionProfileID || aggregate.ExecutionPolicy != effectiveSetPolicy(job) || aggregate.TotalTestcaseCount != len(manifest.Entries) || len(aggregate.Testcases) != len(manifest.Entries) || !isSHA256(aggregate.Digest) || !validSetPipelineOutcome(identity.PipelineOutcome) || !validSetStopReason(aggregate.StopReason) || aggregate.SetCancelled != (aggregate.StopReason == "CANCELLED") || aggregate.SetInfrastructureFailure != (aggregate.StopReason == "INFRASTRUCTURE_FAILURE") {
		return errors.New("invalid testcase-set aggregate")
	}
	started, completed := 0, 0
	for index, member := range aggregate.Testcases {
		entry := manifest.Entries[index]
		if member.Index != entry.Index || member.TestcaseID != entry.TestcaseID || member.InputSHA256 != entry.InputSHA256 || member.TestdataVersionID != entry.TestdataVersionID || member.ExecutionProfileID != entry.ExecutionProfileID || !validSetMemberStatus(member.Status) {
			return errors.New("testcase-set aggregate membership mismatch")
		}
		if member.Status != "CANCELLED_BEFORE_START" && member.Status != "SKIPPED_BY_SET_POLICY" && member.Status != "NOT_STARTED" {
			started++
		}
		if member.Status == "RAW_COMPLETED" {
			completed++
			if len(member.Record) == 0 || string(member.Record) == "null" {
				return errors.New("completed testcase is missing immutable record")
			}
		}
		if member.Status == "RAW_COMPLETED" && entry.CheckerType != "" && (member.ActualStdoutBytes < 0 || member.ActualStdoutBytes > 64<<10 || len(member.ActualStdout) > 64<<10 || !isSHA256(member.ActualStdoutSHA256) || member.ActualStdoutBytes != len(member.ActualStdout) || member.ActualStdoutSHA256 != digest(member.ActualStdout)) {
			return errors.New("invalid testcase stdout evidence")
		}
		if len(member.Record) > 0 && string(member.Record) != "null" {
			var record struct {
				RecordVersion string `json:"record_version"`
				Digest        string `json:"digest"`
				Identity      struct {
					ProblemID          string `json:"problem_id"`
					ProblemRevisionID  string `json:"problem_revision_id"`
					TestdataVersionID  string `json:"testdata_version_id"`
					TestcaseID         string `json:"testcase_id"`
					InputSHA256        string `json:"input_sha256"`
					ExecutionProfileID string `json:"execution_profile_id"`
					ExecutionAttemptID string `json:"execution_attempt_id"`
				} `json:"identity"`
				ExecutionSetAttemptID   string `json:"execution_set_attempt_id"`
				TestcaseIndex           int    `json:"testcase_index"`
				TestcaseSetManifestHash string `json:"testcase_set_manifest_hash"`
			}
			if json.Unmarshal(member.Record, &record) != nil || !verdict.VerifyDigest(member.Record) || record.RecordVersion != "2C.3" || !isSHA256(record.Digest) || record.Identity.ProblemID != job.ProblemID || record.Identity.ProblemRevisionID != job.ProblemRevisionID || record.Identity.TestdataVersionID != entry.TestdataVersionID || record.Identity.TestcaseID != entry.TestcaseID || record.Identity.InputSHA256 != entry.InputSHA256 || record.Identity.ExecutionProfileID != entry.ExecutionProfileID || record.Identity.ExecutionAttemptID == "" || record.ExecutionSetAttemptID != job.ExecutionAttemptID || record.TestcaseIndex != entry.Index || record.TestcaseSetManifestHash != manifest.ManifestHash {
				return errors.New("invalid testcase record binding")
			}
		}
	}
	if aggregate.StartedTestcaseCount != started || aggregate.CompletedTestcaseCount != completed || aggregate.CompletedTestcaseCount > aggregate.StartedTestcaseCount {
		return errors.New("invalid testcase-set aggregate counts or compile output")
	}
	if identity.PipelineOutcome != "PIPELINE_INFRA_FAILURE" && !validRawStageOutput(identity.Compile) {
		return errors.New("invalid testcase-set compile output")
	}
	if verdictReady(manifest) {
		var envelope struct {
			VerdictRecord verdict.AggregateRecord `json:"verdict_record"`
		}
		if json.Unmarshal(result, &envelope) != nil || envelope.VerdictRecord.Digest == "" {
			return errors.New("missing verdict record")
		}
		expected, err := verdict.Derive(verdict.Input{SubmissionID: job.SubmissionID, ExecutionSetRequestID: executionRequestID(job), ExecutionSetAttemptID: job.ExecutionAttemptID, ManifestHash: manifest.ManifestHash, Attempt: job.Attempt, Authoritative: true, Entries: queueVerdictEntries(manifest), Raw: result})
		if err != nil || !reflect.DeepEqual(expected, envelope.VerdictRecord) {
			return errors.New("verdict record validation failed")
		}
	}
	return nil
}

func queueVerdictEntries(manifest *TestcaseSetManifest) []verdict.Entry {
	entries := make([]verdict.Entry, 0, len(manifest.Entries))
	for _, entry := range manifest.Entries {
		entries = append(entries, verdict.Entry{Index: entry.Index, TestcaseID: entry.TestcaseID, TestdataVersionID: entry.TestdataVersionID, ExpectedOutputSHA256: entry.ExpectedOutputSHA256, ExpectedOutput: []byte(entry.ExpectedOutput), CheckerType: entry.CheckerType, CheckerVersion: entry.CheckerVersion, CheckerConfigSHA256: entry.CheckerConfigSHA256})
	}
	return entries
}

func verdictReady(manifest *TestcaseSetManifest) bool {
	if manifest == nil || len(manifest.Entries) == 0 {
		return false
	}
	for _, entry := range manifest.Entries {
		if entry.CheckerType == "" {
			return false
		}
	}
	return true
}

func validateRawExecutionSetIdentity(identity rawExecutionResultIdentity, job Job, manifest *TestcaseSetManifest) error {
	if manifest == nil {
		return errors.New("raw testcase-set result identity mismatch: missing manifest")
	}
	checks := []struct {
		name, actual, expected string
	}{
		{"protocol_version", identity.ProtocolVersion, "2C.4"},
		{"execution_set_request_id", identity.ExecutionSetRequestID, executionRequestID(job)},
		{"judge_job_id", identity.JudgeJobID, job.ID},
		{"submission_id", identity.SubmissionID, job.SubmissionID},
		{"language_profile_id", identity.LanguageProfileID, job.LanguageProfileID},
		{"source_sha256", identity.SourceSHA256, job.SourceSHA256},
		{"problem_id", identity.ProblemID, job.ProblemID},
		{"problem_revision_id", identity.ProblemRevisionID, job.ProblemRevisionID},
		{"testdata_version_id", identity.TestdataVersionID, job.TestdataVersionRef},
		{"testcase_set_id", identity.TestcaseSetID, manifest.TestcaseSetID},
		{"testcase_set_manifest_hash", identity.TestcaseSetManifestHash, manifest.ManifestHash},
		{"execution_set_attempt_id", identity.ExecutionSetAttemptID, job.ExecutionAttemptID},
		{"execution_set_policy", identity.ExecutionSetPolicy, effectiveSetPolicy(job)},
	}
	for _, check := range checks {
		if check.actual != check.expected {
			return fmt.Errorf("raw testcase-set result identity mismatch: %s", check.name)
		}
	}
	if identity.Attempt != job.Attempt {
		return errors.New("raw testcase-set result identity mismatch: attempt")
	}
	if identity.ResultGeneration != job.ResultGeneration {
		return errors.New("raw testcase-set result identity mismatch: result_generation")
	}
	return nil
}

func effectiveSetPolicy(job Job) string {
	if job.ExecutionSetPolicy == "" {
		return "RUN_ALL"
	}
	return job.ExecutionSetPolicy
}

func validSetMemberStatus(status string) bool {
	switch status {
	case "RAW_COMPLETED", "CANCELLED", "CANCELLED_BEFORE_START", "INFRA_FAILED", "SKIPPED_BY_SET_POLICY", "NOT_STARTED":
		return true
	default:
		return false
	}
}

func validSetPipelineOutcome(outcome string) bool {
	switch outcome {
	case "PIPELINE_COMPLETED", "PIPELINE_COMPILE_FAILED", "PIPELINE_LIMIT_HIT", "PIPELINE_CANCELLED", "PIPELINE_INFRA_FAILURE":
		return true
	default:
		return false
	}
}

func validSetStopReason(reason string) bool {
	switch reason {
	case "COMPLETED", "CANCELLED", "RAW_EXECUTION_BLOCKING_EVENT", "INFRASTRUCTURE_FAILURE":
		return true
	default:
		return false
	}
}

func validRawStageOutput(raw json.RawMessage) bool {
	var stage struct {
		Stdout          string `json:"stdout"`
		Stderr          string `json:"stderr"`
		StdoutBytes     int    `json:"stdout_bytes"`
		StderrBytes     int    `json:"stderr_bytes"`
		StdoutSHA256    string `json:"stdout_sha256"`
		StderrSHA256    string `json:"stderr_sha256"`
		StdoutTruncated bool   `json:"stdout_truncated"`
		StderrTruncated bool   `json:"stderr_truncated"`
	}
	if len(raw) == 0 || string(raw) == "null" || json.Unmarshal(raw, &stage) != nil {
		return false
	}
	return len([]byte(stage.Stdout)) <= 64<<10 && len([]byte(stage.Stderr)) <= 64<<10 && stage.StdoutBytes == len([]byte(stage.Stdout)) && stage.StdoutBytes >= 0 && stage.StdoutBytes <= 64<<10 && stage.StderrBytes == len([]byte(stage.Stderr)) && stage.StderrBytes >= 0 && stage.StderrBytes <= 64<<10 && isSHA256(stage.StdoutSHA256) && stage.StdoutSHA256 == digest([]byte(stage.Stdout)) && isSHA256(stage.StderrSHA256) && stage.StderrSHA256 == digest([]byte(stage.Stderr))
}

func validateTestcaseJob(j Job) error {
	if j.TestcaseSet != nil {
		if j.ExecutionMode != "REAL_SANDBOXED_EXECUTION" || j.TestcaseID != "" || j.TestcaseInput != "" || j.TestcaseInputSHA256 != "" || j.ExecutionProfileID != "" {
			return errors.New("invalid testcase-set job shape")
		}
		if j.ExecutionSetPolicy == "" {
			j.ExecutionSetPolicy = "RUN_ALL"
		}
		if j.ExecutionSetPolicy != "RUN_ALL" && j.ExecutionSetPolicy != "STOP_ON_EXECUTION_BLOCKING_EVENT" {
			return errors.New("invalid testcase-set policy")
		}
		return validateTestcaseSet(*j.TestcaseSet, j.ProblemID, j.ProblemRevisionID, j.TestdataVersionRef)
	}
	hasTestcase := j.TestcaseID != "" || j.TestcaseInput != "" || j.TestcaseInputSHA256 != "" || j.ExecutionProfileID != ""
	if !hasTestcase {
		return nil
	}
	if j.ExecutionMode != "REAL_SANDBOXED_EXECUTION" || j.ProblemID == "" || j.ProblemRevisionID == "" || j.TestdataVersionRef == "" || strings.EqualFold(j.TestdataVersionRef, "latest") || j.TestcaseID == "." || j.TestcaseID == ".." || len(j.TestcaseID) > 128 || strings.ContainsAny(j.TestcaseID, "/\\\x00") || j.ExecutionProfileID != "cpp20-gcc-13-v1" || len(j.TestcaseInput) > 100<<20 || !isSHA256(j.TestcaseInputSHA256) || j.TestcaseInputSHA256 != digest([]byte(j.TestcaseInput)) {
		return errors.New("invalid testcase job contract")
	}
	return nil
}

func validateTestcaseSet(manifest TestcaseSetManifest, problemID, revisionID, testdataVersion string) error {
	if manifest.ProblemID == "" || manifest.ProblemID != problemID || manifest.ProblemRevisionID == "" || manifest.ProblemRevisionID != revisionID || manifest.TestdataVersionID == "" || manifest.TestdataVersionID != testdataVersion || strings.EqualFold(manifest.TestdataVersionID, "latest") || manifest.TestcaseSetID == "" || manifest.ExecutionProfileID != "cpp20-gcc-13-v1" || len(manifest.Entries) == 0 || len(manifest.Entries) > 64 || !isSHA256(manifest.ManifestHash) || manifest.ManifestHash != testcaseSetManifestHash(manifest) {
		return errors.New("invalid testcase-set manifest")
	}
	seen := make(map[string]struct{}, len(manifest.Entries))
	var totalInputBytes int64
	for index, entry := range manifest.Entries {
		totalInputBytes += int64(len(entry.Input))
		verdictBinding := entry.ExpectedOutput != "" || entry.CheckerType != "" || entry.CheckerVersion != "" || entry.CheckerConfigSHA256 != ""
		if totalInputBytes > 256<<20 || entry.Index != index || !validSetID(entry.TestcaseID) || entry.TestdataVersionID != manifest.TestdataVersionID || entry.ExecutionProfileID != manifest.ExecutionProfileID || len(entry.Input) > 100<<20 || !isSHA256(entry.InputSHA256) || entry.InputSHA256 != digest([]byte(entry.Input)) || entry.ExpectedOutputSHA256 != "" && !isSHA256(entry.ExpectedOutputSHA256) || verdictBinding && (len(entry.ExpectedOutput) > 100<<20 || !isSHA256(entry.ExpectedOutputSHA256) || entry.ExpectedOutputSHA256 != digest([]byte(entry.ExpectedOutput)) || (entry.CheckerType != "EXACT_BYTES" && entry.CheckerType != "TOKEN_WHITESPACE") || entry.CheckerVersion != "builtin-v1" || entry.CheckerConfigSHA256 != digest([]byte(entry.CheckerType+"\x00"+entry.CheckerVersion))) {
			return errors.New("invalid testcase-set entry")
		}
		if _, exists := seen[entry.TestcaseID]; exists {
			return errors.New("duplicate testcase-set entry")
		}
		seen[entry.TestcaseID] = struct{}{}
	}
	return nil
}

func testcaseSetManifestHash(manifest TestcaseSetManifest) string {
	parts := []string{"2C.4", manifest.ProblemID, manifest.ProblemRevisionID, manifest.TestdataVersionID, manifest.TestcaseSetID, manifest.ExecutionProfileID, strconv.Itoa(len(manifest.Entries))}
	for _, entry := range manifest.Entries {
		parts = append(parts, strconv.Itoa(entry.Index), entry.TestcaseID, entry.TestdataVersionID, entry.InputSHA256, entry.ExecutionProfileID, entry.ExpectedOutputSHA256)
		if entry.CheckerType != "" || entry.CheckerVersion != "" || entry.CheckerConfigSHA256 != "" {
			parts = append(parts, "2C.5", entry.CheckerType, entry.CheckerVersion, entry.CheckerConfigSHA256)
		}
	}
	return digest([]byte(strings.Join(parts, "\x00")))
}

func validSetID(value string) bool {
	return value != "" && value != "." && value != ".." && len(value) <= 128 && value == strings.TrimSpace(value) && !strings.ContainsAny(value, "/\\\x00")
}

func isSHA256(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && value == strings.ToLower(value)
}

func executionRequestID(job Job) string {
	if job.ExecutionRequestID != "" {
		return job.ExecutionRequestID
	}
	return fmt.Sprintf("%s:%d", job.ID, job.Attempt)
}

func resultDigest(result json.RawMessage) string {
	compact := &bytes.Buffer{}
	if json.Compact(compact, result) != nil {
		return ""
	}
	digest := sha256.Sum256(compact.Bytes())
	return fmt.Sprintf("%x", digest[:])
}

func digest(value []byte) string {
	h := sha256.Sum256(value)
	return fmt.Sprintf("%x", h[:])
}

type Lease struct {
	Job          Job
	Token        string
	AssignmentID string
}
type Client struct {
	addr   string
	mu     sync.Mutex
	conn   net.Conn
	reader *bufio.Reader
}

func New(redisURL string) (*Client, error) {
	u, err := url.Parse(redisURL)
	if err != nil || u.Host == "" {
		return nil, errors.New("invalid redis url")
	}
	return &Client{addr: u.Host}, nil
}
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		return nil
	}
	d := net.Dialer{}
	conn, err := d.DialContext(ctx, "tcp", c.addr)
	if err != nil {
		return err
	}
	c.conn = conn
	c.reader = bufio.NewReader(conn)
	if _, err = c.command("PING"); err != nil {
		_ = conn.Close()
		c.conn = nil
		return err
	}
	return nil
}
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		err := c.conn.Close()
		c.conn = nil
		return err
	}
	return nil
}
func (c *Client) command(args ...string) (any, error) {
	if c.conn == nil {
		return nil, errors.New("redis disconnected")
	}
	var b strings.Builder
	fmt.Fprintf(&b, "*%d\r\n", len(args))
	for _, a := range args {
		fmt.Fprintf(&b, "$%d\r\n%s\r\n", len(a), a)
	}
	if _, err := c.conn.Write([]byte(b.String())); err != nil {
		c.conn = nil
		return nil, err
	}
	value, err := readRESP(c.reader)
	if err != nil {
		_ = c.conn.Close()
		c.conn = nil
	}
	return value, err
}
func readRESP(r *bufio.Reader) (any, error) {
	prefix, err := r.ReadByte()
	if err != nil {
		return nil, err
	}
	line, err := r.ReadString('\n')
	if err != nil {
		return nil, err
	}
	line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
	switch prefix {
	case '+':
		return line, nil
	case '-':
		return nil, errors.New(line)
	case ':':
		return strconv.ParseInt(line, 10, 64)
	case '$':
		n, _ := strconv.Atoi(line)
		if n < 0 {
			return nil, nil
		}
		data := make([]byte, n+2)
		if _, err = io.ReadFull(r, data); err != nil {
			return nil, err
		}
		return string(data[:n]), nil
	case '*':
		n, _ := strconv.Atoi(line)
		out := make([]any, n)
		for i := range out {
			out[i], err = readRESP(r)
			if err != nil {
				return nil, err
			}
		}
		return out, nil
	}
	return nil, errors.New("bad redis response")
}
func (c *Client) do(ctx context.Context, args ...string) (any, error) {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		if err := c.Connect(ctx); err != nil {
			lastErr = err
			continue
		}
		c.mu.Lock()
		value, err := c.command(args...)
		c.mu.Unlock()
		if err == nil {
			return value, nil
		}
		lastErr = err
		_ = c.Close()
	}
	return nil, lastErr
}
func (c *Client) String(ctx context.Context, args ...string) (string, error) {
	v, err := c.do(ctx, args...)
	if err != nil {
		return "", err
	}
	if v == nil {
		return "", nil
	}
	return fmt.Sprint(v), nil
}
func (c *Client) SetNX(ctx context.Context, key, value string, ttl time.Duration) (bool, error) {
	v, err := c.String(ctx, "SET", key, value, "NX", "PX", strconv.FormatInt(ttl.Milliseconds(), 10))
	return v == "OK", err
}
func (c *Client) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	_, err := c.String(ctx, "SET", key, value, "PX", strconv.FormatInt(ttl.Milliseconds(), 10))
	return err
}
func (c *Client) Del(ctx context.Context, key string) error {
	_, err := c.String(ctx, "DEL", key)
	return err
}
func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.String(ctx, "GET", key)
}
func (c *Client) Push(ctx context.Context, key, value string) error {
	_, err := c.String(ctx, "LPUSH", key, value)
	return err
}
func (c *Client) Pop(ctx context.Context, key string) (string, error) {
	return c.String(ctx, "RPOP", key)
}
func (c *Client) Keys(ctx context.Context, pattern string) ([]string, error) {
	v, err := c.do(ctx, "KEYS", pattern)
	if err != nil {
		return nil, err
	}
	items, ok := v.([]any)
	if !ok {
		return nil, errors.New("invalid redis keys response")
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		result = append(result, fmt.Sprint(item))
	}
	return result, nil
}

type Queue struct {
	Redis  *Client
	Prefix string
}

type CreateInput struct {
	ID, SubmissionID, OwnerUserID, ProblemID, ProblemRevisionID, TestdataVersionRef, LanguageID       string
	TestcaseID, TestcaseInput, TestcaseInputSHA256, ExecutionProfileID                                string
	TestcaseSet                                                                                       *TestcaseSetManifest
	ExecutionSetPolicy                                                                                string
	ExecutionMode, LanguageProfileID, SourceSnapshotRef, SourceBytes, SourceSHA256, ControlledInputID string
	FixtureID                                                                                         string
	MaxAttempts                                                                                       int
}

func (q Queue) Enqueue(ctx context.Context, in CreateInput) (Job, error) {
	if in.ID == "" || in.SubmissionID == "" || in.OwnerUserID == "" || in.ProblemID == "" || in.ProblemRevisionID == "" || in.TestdataVersionRef == "" || strings.EqualFold(in.TestdataVersionRef, "latest") || in.LanguageID == "" {
		return Job{}, errors.New("missing immutable linkage")
	}
	hasTestcase := in.TestcaseID != "" || in.TestcaseInput != "" || in.TestcaseInputSHA256 != "" || in.ExecutionProfileID != ""
	if hasTestcase {
		candidate := Job{ExecutionMode: in.ExecutionMode, ProblemID: in.ProblemID, ProblemRevisionID: in.ProblemRevisionID, TestdataVersionRef: in.TestdataVersionRef, TestcaseID: in.TestcaseID, TestcaseInput: in.TestcaseInput, TestcaseInputSHA256: in.TestcaseInputSHA256, ExecutionProfileID: in.ExecutionProfileID}
		if err := validateTestcaseJob(candidate); err != nil {
			return Job{}, errors.New("invalid testcase contract")
		}
	}
	if in.TestcaseSet != nil {
		candidate := Job{ExecutionMode: in.ExecutionMode, ProblemID: in.ProblemID, ProblemRevisionID: in.ProblemRevisionID, TestdataVersionRef: in.TestdataVersionRef, TestcaseSet: in.TestcaseSet, ExecutionSetPolicy: in.ExecutionSetPolicy}
		if err := validateTestcaseJob(candidate); err != nil {
			return Job{}, errors.New("invalid testcase-set contract")
		}
	}
	lock := q.key("mutation-lock", "")
	lockToken := fmt.Sprintf("%d", time.Now().UnixNano())
	ok, err := q.Redis.SetNX(ctx, lock, lockToken, 5*time.Second)
	if err != nil || !ok {
		return Job{}, err
	}
	defer func() { _ = q.Redis.Del(context.Background(), lock) }()
	index := q.key("submission", in.SubmissionID)
	existing, err := q.Redis.Get(ctx, index)
	if err != nil {
		return Job{}, err
	}
	if existing != "" {
		raw, e := q.Redis.Get(ctx, q.key("job", existing))
		if e != nil {
			return Job{}, e
		}
		var j Job
		e = json.Unmarshal([]byte(raw), &j)
		normalizeEvaluationGeneration(&j)
		if e == nil {
			e = validateTestcaseJob(j)
		}
		return j, e
	}
	max := in.MaxAttempts
	if max < 1 {
		max = 3
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	j := Job{ID: in.ID, SubmissionID: in.SubmissionID, EvaluationGeneration: 1, IdempotencyKey: "submission:" + in.SubmissionID, OwnerUserID: in.OwnerUserID, ProblemID: in.ProblemID, ProblemRevisionID: in.ProblemRevisionID, TestdataVersionRef: in.TestdataVersionRef, TestcaseID: in.TestcaseID, TestcaseInput: in.TestcaseInput, TestcaseInputSHA256: in.TestcaseInputSHA256, ExecutionProfileID: in.ExecutionProfileID, TestcaseSet: in.TestcaseSet, ExecutionSetPolicy: in.ExecutionSetPolicy, LanguageID: in.LanguageID, ExecutionMode: in.ExecutionMode, LanguageProfileID: in.LanguageProfileID, SourceSnapshotRef: in.SourceSnapshotRef, SourceBytes: in.SourceBytes, SourceSHA256: in.SourceSHA256, ControlledInputID: in.ControlledInputID, FixtureID: in.FixtureID, Status: "QUEUED", MaxAttempts: max, CreatedAt: now, UpdatedAt: now}
	if j.ExecutionMode == "" {
		j.ExecutionMode = "SAFE_FIXTURE_QUALIFICATION"
	}
	if j.TestcaseSet != nil && j.ExecutionSetPolicy == "" {
		j.ExecutionSetPolicy = "RUN_ALL"
	}
	encoded, _ := json.Marshal(j)
	if _, err = q.Redis.String(ctx, "SET", q.key("job", j.ID), string(encoded)); err != nil {
		return Job{}, err
	}
	if _, err = q.Redis.String(ctx, "SET", index, j.ID); err != nil {
		return Job{}, err
	}
	if err = q.Redis.Push(ctx, q.key("queue", ""), j.ID); err != nil {
		return Job{}, err
	}
	return j, nil
}

func (q Queue) key(kind, id string) string {
	if id == "" {
		return q.Prefix + ":" + kind
	}
	return q.Prefix + ":" + kind + ":" + id
}
func (q Queue) claim(ctx context.Context, worker string, lease time.Duration) (*Lease, error) {
	lock := q.key("mutation-lock", "")
	token := fmt.Sprintf("%d", time.Now().UnixNano())
	ok, err := q.Redis.SetNX(ctx, lock, token, 5*time.Second)
	if err != nil || !ok {
		return nil, err
	}
	defer func() { _ = q.Redis.Del(context.Background(), lock) }()
	if err := q.recoverStaleLocked(ctx); err != nil {
		return nil, err
	}
	id, err := q.Redis.Pop(ctx, q.key("queue", ""))
	if err != nil || id == "" {
		return nil, err
	}
	raw, err := q.Redis.Get(ctx, q.key("job", id))
	if err != nil {
		return nil, err
	}
	var j Job
	if err = json.Unmarshal([]byte(raw), &j); err != nil {
		return nil, err
	}
	normalizeEvaluationGeneration(&j)
	if err = validateTestcaseJob(j); err != nil {
		return nil, err
	}
	if j.ExecutionMode == "" {
		j.ExecutionMode = "SAFE_FIXTURE_QUALIFICATION"
	}
	if j.Status != "QUEUED" && j.Status != "FAILED_RETRYABLE" {
		return nil, nil
	}
	if j.ExecutionMode == "REAL_SANDBOXED_EXECUTION" {
		j.Status = "LEASED"
	} else {
		j.Status = "LEASED_FAKE"
	}
	j.Attempt++
	if j.ExecutionMode == "REAL_SANDBOXED_EXECUTION" {
		j.ExecutionRequestID = fmt.Sprintf("%s:%d", j.ID, j.Attempt)
		j.ExecutionAttemptID = j.ExecutionRequestID + ":attempt"
		j.ResultGeneration = int64(j.Attempt)
		j.ResultDigest = ""
	}
	j.LeaseOwner = worker
	j.LeaseToken = fmt.Sprintf("%d", time.Now().UnixNano())
	j.LeaseExpiresAt = time.Now().Add(lease).UTC()
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	encoded, _ := json.Marshal(j)
	if _, err = q.Redis.String(ctx, "SET", q.key("job", j.ID), string(encoded)); err != nil {
		return nil, err
	}
	return &Lease{Job: j, Token: j.LeaseToken}, nil
}
func (q Queue) Claim(ctx context.Context, worker string, lease time.Duration) (*Lease, error) {
	return q.claim(ctx, worker, lease)
}
func (q Queue) recoverStaleLocked(ctx context.Context) error {
	keys, err := q.Redis.Keys(ctx, q.key("job", "")+"*")
	if err != nil {
		return err
	}
	for _, key := range keys {
		raw, err := q.Redis.Get(ctx, key)
		if err != nil || raw == "" {
			continue
		}
		var j Job
		if json.Unmarshal([]byte(raw), &j) != nil {
			continue
		}
		normalizeEvaluationGeneration(&j)
		if (j.Status != "LEASED_FAKE" && j.Status != "LEASED") || j.LeaseExpiresAt.IsZero() || time.Now().Before(j.LeaseExpiresAt) {
			continue
		}
		j.LeaseOwner, j.LeaseToken = "", ""
		j.LeaseExpiresAt = time.Time{}
		j.ExecutionRequestID, j.ExecutionAttemptID, j.ResultDigest = "", "", ""
		j.ResultGeneration = 0
		j.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		if j.Attempt >= j.MaxAttempts {
			j.Status = "FAILED_TERMINAL"
		} else {
			j.Status = "FAILED_RETRYABLE"
		}
		encoded, _ := json.Marshal(j)
		if _, err = q.Redis.String(ctx, "SET", key, string(encoded)); err != nil {
			return err
		}
		if j.Status == "FAILED_RETRYABLE" {
			if err = q.Redis.Push(ctx, q.key("queue", ""), j.ID); err != nil {
				return err
			}
		}
	}
	return nil
}
func (q Queue) update(ctx context.Context, l Lease, status, reason string, result json.RawMessage) error {
	lock := q.key("mutation-lock", "")
	var token string
	var err error
	for attempt := 0; attempt < 40; attempt++ {
		token = fmt.Sprintf("%d", time.Now().UnixNano())
		var ok bool
		ok, err = q.Redis.SetNX(ctx, lock, token, 5*time.Second)
		if err != nil {
			return err
		}
		if ok {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(10 * time.Millisecond):
		}
		if attempt == 39 {
			return errors.New("mutation lock busy")
		}
	}
	defer func() { _ = q.Redis.Del(context.Background(), lock) }()
	raw, err := q.Redis.Get(ctx, q.key("job", l.Job.ID))
	if err != nil {
		return err
	}
	var j Job
	if err = json.Unmarshal([]byte(raw), &j); err != nil {
		return err
	}
	normalizeEvaluationGeneration(&j)
	if err = validateTestcaseJob(j); err != nil {
		return err
	}
	if j.Status == "SUCCEEDED_FAKE" || j.Status == "COMPLETED" || j.Status == "FAILED_TERMINAL" || j.Status == "CANCELLED" {
		if j.Status == status && (status != "COMPLETED" || (j.ResultDigest != "" && j.ResultDigest == resultDigest(result))) {
			return nil
		}
		return errors.New("terminal result conflict")
	}
	expectedLease := "LEASED_FAKE"
	if j.ExecutionMode == "REAL_SANDBOXED_EXECUTION" {
		expectedLease = "LEASED"
	}
	if j.Status != expectedLease || j.LeaseToken != l.Token || time.Now().After(j.LeaseExpiresAt) {
		return errors.New("lease conflict")
	}
	if status == "COMPLETED" && j.ExecutionMode != "REAL_SANDBOXED_EXECUTION" {
		return errors.New("execution mode completion mismatch")
	}
	if status == "COMPLETED" {
		if err = validateRawExecutionResult(result, j); err != nil {
			return err
		}
	}
	if status == "CANCELLED" {
		j.CancellationGeneration++
	}
	j.Status = status
	if status == "FAILED_RETRYABLE" && j.Attempt >= j.MaxAttempts {
		j.Status = "FAILED_TERMINAL"
	}
	j.LeaseToken = ""
	j.LeaseOwner = ""
	j.LeaseExpiresAt = time.Time{}
	j.FailureReason = reason
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if status == "SUCCEEDED_FAKE" {
		j.SyntheticFixtureID = l.Job.FixtureID
		j.CompletedAt = j.UpdatedAt
	}
	if status == "COMPLETED" {
		j.RawExecutionResult = append(json.RawMessage(nil), result...)
		j.ResultDigest = resultDigest(result)
		j.CompletedAt = j.UpdatedAt
	}
	if status == "FAILED_RETRYABLE" {
		j.ExecutionRequestID, j.ExecutionAttemptID, j.ResultDigest = "", "", ""
		j.ResultGeneration = 0
	}
	encoded, _ := json.Marshal(j)
	if _, err = q.Redis.String(ctx, "SET", q.key("job", j.ID), string(encoded)); err != nil {
		return err
	}
	if j.Status == "FAILED_RETRYABLE" {
		return q.Redis.Push(ctx, q.key("queue", ""), j.ID)
	}
	return nil
}
func (q Queue) Complete(ctx context.Context, l Lease) error {
	return q.update(ctx, l, "SUCCEEDED_FAKE", "", nil)
}
func (q Queue) CompleteReal(ctx context.Context, l Lease, result json.RawMessage) error {
	return q.update(ctx, l, "COMPLETED", "", result)
}
func (q Queue) Retry(ctx context.Context, l Lease, reason string) error {
	return q.update(ctx, l, "FAILED_RETRYABLE", reason, nil)
}
func (q Queue) FailTerminal(ctx context.Context, l Lease, reason string) error {
	return q.update(ctx, l, "FAILED_TERMINAL", reason, nil)
}
func (q Queue) Cancel(ctx context.Context, l Lease) error {
	return q.update(ctx, l, "CANCELLED", "cancelled", nil)
}

func (q Queue) CancellationRequested(ctx context.Context, jobID string) (bool, error) {
	value, err := q.Redis.Get(ctx, q.key("cancel", jobID))
	return value != "", err
}
