package artifact

import (
	"encoding/json"
	"strings"
	"testing"
)

func contractFixture() Reference {
	e := Testcase{Index: 0, TestcaseID: "case-1", TestdataVersionID: "data-1", Input: Object{"input-1", 100 << 20, hash("input")}, ExpectedOutput: Object{"output-1", 2, hash("5\n")}, InputSHA256: hash("input"), ExpectedOutputSHA256: hash("5\n"), ExecutionProfileID: "cpp20-gcc-13-v1", CheckerType: "EXACT_BYTES", CheckerVersion: "builtin-v1", CheckerConfigSHA256: hash("EXACT_BYTES\x00builtin-v1"), TimeLimitMs: 1000, MemoryLimitBytes: 67108864, OutputLimitBytes: 65536}
	m := Manifest{FormatVersion: FormatVersion, JudgeDataVersionID: "version-1", CreatedAt: "2026-09-05T00:00:00.000Z", ProblemID: "problem-1", ProblemRevisionID: "revision-1", TestdataVersionID: "data-1", TestcaseSetID: "set-1", ExecutionProfileID: "cpp20-gcc-13-v1", Entries: []Testcase{e}}
	m.ManifestHash = hash(strings.Join([]string{"2C.4", m.ProblemID, m.ProblemRevisionID, m.TestdataVersionID, m.TestcaseSetID, m.ExecutionProfileID, "1", "0", e.TestcaseID, e.TestdataVersionID, e.InputSHA256, e.ExecutionProfileID, e.ExpectedOutputSHA256, "2C.5", e.CheckerType, e.CheckerVersion, e.CheckerConfigSHA256}, "\x00"))
	data, _ := ManifestBytes(m)
	id := digest(data)
	return Reference{ID: id, Reference: "judge-artifact:" + id, FormatVersion: FormatVersion, JudgeDataVersionID: m.JudgeDataVersionID, ContentLength: int64(len(data)), SHA256: id, CreatedAt: m.CreatedAt, InputBytes: 100 << 20, OutputBytes: 2, TestcaseCount: 1, Manifest: m}
}

func TestArtifactContractCanonicalRoundTrip(t *testing.T) {
	ref := contractFixture()
	if err := ref.Validate(); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(ref)
	var decoded Reference
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.ID != ref.ID || len(data) >= 2048 {
		t.Fatal("unbounded or unstable metadata")
	}
	if ref.ID != "fe868ba9f0c989f1da9429a7fc3a9ae7a8c35349631a2b0ccd0bf908d0abdb86" { t.Fatal("TypeScript/Go canonical fixture mismatch") }
}

func TestArtifactContractRejectsUnknownAndChangedFields(t *testing.T) {
	ref := contractFixture()
	data, _ := json.Marshal(ref)
	for _, bad := range []string{strings.Replace(string(data), `"formatVersion":"judge-artifact-v1"`, `"formatVersion":"2C.4"`, 1), strings.Replace(string(data), `"objectId":"input-1"`, `"objectId":"../secret"`, 1), strings.Replace(string(data), `"sizeBytes":104857600`, `"sizeBytes":104857601`, 1), strings.Replace(string(data), `"index":0`, `"inlineInput":"secret","index":0`, 1)} {
		var decoded Reference
		if json.Unmarshal([]byte(bad), &decoded) == nil {
			t.Fatal("invalid artifact accepted")
		}
	}
}
