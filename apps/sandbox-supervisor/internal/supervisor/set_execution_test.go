package supervisor

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"github.com/ojplatform/sandbox-supervisor/internal/model"
)

func setInputHash(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

func validSetRequestForTest() model.RealExecutionSetRequest {
	entries := []model.TestcaseSetEntry{}
	for index, input := range []string{"one\n", "two\n", "three\n"} {
		entries = append(entries, model.TestcaseSetEntry{Index: index, TestcaseID: "case-" + string(rune('1'+index)), TestdataVersionID: "testdata-v1", Input: []byte(input), InputSHA256: setInputHash(input), ExecutionProfileID: CPP20ProfileID})
	}
	manifest := model.TestcaseSetManifest{ProblemID: "problem", ProblemRevisionID: "revision", TestdataVersionID: "testdata-v1", TestcaseSetID: "set", ExecutionProfileID: CPP20ProfileID, Entries: entries}
	manifest.ManifestHash = TestcaseSetManifestHash(manifest)
	source := "int main(){}"
	return model.RealExecutionSetRequest{ProtocolVersion: model.ExecutionSetContractVersion, ExecutionSetRequestID: "job:1", JudgeJobID: "job", SubmissionID: "submission", Attempt: 1, CorrelationID: "corr", Manifest: manifest, ExecutionPolicy: "RUN_ALL", LanguageProfileID: CPP20ProfileID, SourceSnapshotRef: "snapshot", SourceBytes: source, SourceSHA256: setInputHash(source), DeadlineAt: time.Now().Add(time.Minute)}
}

func TestValidateRealExecutionSetRequestRejectsManifestTampering(t *testing.T) {
	request := validSetRequestForTest()
	if err := ValidateRealExecutionSetRequest(request); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*model.RealExecutionSetRequest){
		"order": func(value *model.RealExecutionSetRequest) {
			value.Manifest.Entries[0], value.Manifest.Entries[1] = value.Manifest.Entries[1], value.Manifest.Entries[0]
		},
		"duplicate": func(value *model.RealExecutionSetRequest) {
			value.Manifest.Entries[1].TestcaseID = value.Manifest.Entries[0].TestcaseID
		},
		"latest": func(value *model.RealExecutionSetRequest) { value.Manifest.TestdataVersionID = "latest" },
		"input":  func(value *model.RealExecutionSetRequest) { value.Manifest.Entries[0].Input = []byte("tampered") },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			copyRequest := validSetRequestForTest()
			mutate(&copyRequest)
			if name == "latest" {
				copyRequest.Manifest.Entries[0].TestdataVersionID = "latest"
			}
			if ValidateRealExecutionSetRequest(copyRequest) == nil {
				t.Fatal("tampered set accepted")
			}
		})
	}
}

func TestBuildAggregateExecutionSetRecordReordersAndMarksPartialMembers(t *testing.T) {
	request := validSetRequestForTest()
	result := model.RealExecutionSetResult{Clean: true, Artifact: &model.ArtifactResult{SHA256: strings.Repeat("a", 64)}}
	members := []model.TestcaseSetMemberResult{{Index: 1, TestcaseID: "case-2", InputSHA256: request.Manifest.Entries[1].InputSHA256, TestdataVersionID: "testdata-v1", ExecutionProfileID: CPP20ProfileID, Status: "RAW_COMPLETED"}}
	record := BuildAggregateExecutionSetRecord(request, result, members, "RAW_EXECUTION_BLOCKING_EVENT")
	if record == nil || len(record.Testcases) != 3 || record.Testcases[0].Index != 0 || record.Testcases[1].Index != 1 || record.Testcases[2].Index != 2 || record.Testcases[0].Status != "SKIPPED_BY_SET_POLICY" || record.Testcases[1].Status != "RAW_COMPLETED" || record.Testcases[2].Status != "SKIPPED_BY_SET_POLICY" || record.StartedTestcaseCount != 1 || record.CompletedTestcaseCount != 1 || record.Digest == "" {
		t.Fatalf("unexpected aggregate: %+v", record)
	}
	if record.Digest == strings.Repeat("0", 64) {
		t.Fatal("aggregate digest was not computed")
	}
}
