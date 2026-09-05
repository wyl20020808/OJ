package queueadapter

import (
	"errors"
	"github.com/ojplatform/judge-worker/internal/artifact"
)

func ValidateArtifactJob(j Job) error {
	if j.JudgeArtifact == nil || j.JobContract != artifact.JobContract || j.JudgeArtifact.Validate() != nil || j.ExecutionMode != "REAL_SANDBOXED_EXECUTION" || j.TestcaseSet != nil || j.TestcaseID != "" || j.TestcaseInput != "" || j.TestcaseInputSHA256 != "" || j.ExecutionProfileID != "" || j.RequestID == "" || len(j.RequestID) > 256 || j.ExecutionSetPolicy != "RUN_ALL" && j.ExecutionSetPolicy != "STOP_ON_EXECUTION_BLOCKING_EVENT" {
		return errors.New("invalid artifact job contract")
	}
	m := j.JudgeArtifact.Manifest
	if m.ProblemID != j.ProblemID || m.ProblemRevisionID != j.ProblemRevisionID || m.TestdataVersionID != j.TestdataVersionRef || j.LanguageProfileID != m.ExecutionProfileID || j.SourceSHA256 != digest([]byte(j.SourceBytes)) || len(j.SourceBytes) == 0 || len(j.SourceBytes) > 256<<10 {
		return errors.New("artifact job binding mismatch")
	}
	return nil
}

// TestcaseMetadata projects identities for result verification only. Artifact
// bytes are never fetched or copied into a persisted/claimed Job.
func (j Job) TestcaseMetadata() *TestcaseSetManifest {
	if j.JudgeArtifact == nil {
		return j.TestcaseSet
	}
	m := j.JudgeArtifact.Manifest
	result := &TestcaseSetManifest{ProblemID: m.ProblemID, ProblemRevisionID: m.ProblemRevisionID, TestdataVersionID: m.TestdataVersionID, TestcaseSetID: m.TestcaseSetID, ExecutionProfileID: m.ExecutionProfileID, ManifestHash: m.ManifestHash}
	for _, e := range m.Entries {
		result.Entries = append(result.Entries, TestcaseSetEntry{Index: e.Index, TestcaseID: e.TestcaseID, TestdataVersionID: e.TestdataVersionID, InputSHA256: e.InputSHA256, ExpectedOutputSHA256: e.ExpectedOutputSHA256, ExecutionProfileID: e.ExecutionProfileID, CheckerType: e.CheckerType, CheckerVersion: e.CheckerVersion, CheckerConfigSHA256: e.CheckerConfigSHA256})
	}
	return result
}
