package artifact

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const JobContract = "judge-artifact-job-v1"
const ExecutionContract = "artifact-execution-v1"
const MaxTotalBytes int64 = 256 << 20

type Testcase struct {
	Index                int    `json:"index"`
	TestcaseID           string `json:"testcaseId"`
	TestdataVersionID    string `json:"testdataVersionId"`
	Input                Object `json:"input"`
	ExpectedOutput       Object `json:"expectedOutput"`
	InputSHA256          string `json:"inputSha256"`
	ExpectedOutputSHA256 string `json:"expectedOutputSha256"`
	ExecutionProfileID   string `json:"executionProfileId"`
	CheckerType          string `json:"checkerType"`
	CheckerVersion       string `json:"checkerVersion"`
	CheckerConfigSHA256  string `json:"checkerConfigSha256"`
	TimeLimitMs          int64  `json:"timeLimitMs"`
	MemoryLimitBytes     int64  `json:"memoryLimitBytes"`
	OutputLimitBytes     int64  `json:"outputLimitBytes"`
}
type Manifest struct {
	FormatVersion      string     `json:"formatVersion"`
	JudgeDataVersionID string     `json:"judgeDataVersionId"`
	CreatedAt          string     `json:"createdAt"`
	ProblemID          string     `json:"problemId"`
	ProblemRevisionID  string     `json:"problemRevisionId"`
	TestdataVersionID  string     `json:"testdataVersionId"`
	TestcaseSetID      string     `json:"testcaseSetId"`
	ExecutionProfileID string     `json:"executionProfileId"`
	ManifestHash       string     `json:"manifestHash"`
	Entries            []Testcase `json:"entries"`
}
type Reference struct {
	ID                 string   `json:"id"`
	Reference          string   `json:"reference"`
	FormatVersion      string   `json:"formatVersion"`
	JudgeDataVersionID string   `json:"judgeDataVersionId"`
	ContentLength      int64    `json:"contentLength"`
	SHA256             string   `json:"sha256"`
	CreatedAt          string   `json:"createdAt"`
	InputBytes         int64    `json:"inputBytes"`
	OutputBytes        int64    `json:"outputBytes"`
	TestcaseCount      int      `json:"testcaseCount"`
	Manifest           Manifest `json:"manifest"`
}

var identityPattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,128}$`)

func (r *Reference) UnmarshalJSON(data []byte) error {
	type plain Reference
	var decoded plain
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return failure("INVALID_ARTIFACT_CONTRACT", false)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return failure("INVALID_ARTIFACT_CONTRACT", false)
	}
	*r = Reference(decoded)
	return r.Validate()
}

func ManifestBytes(m Manifest) ([]byte, error) {
	encoded, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	var object map[string]any
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	if err := decoder.Decode(&object); err != nil {
		return nil, err
	}
	var canonical bytes.Buffer
	encoder := json.NewEncoder(&canonical)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(object); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(canonical.Bytes(), []byte("\n")), nil
}

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }

func (r Reference) Validate() error {
	invalid := func() error { return failure("INVALID_ARTIFACT_CONTRACT", false) }
	m := r.Manifest
	if !digestPattern.MatchString(r.ID) || r.SHA256 != r.ID || r.Reference != "judge-artifact:"+r.ID || r.FormatVersion != FormatVersion || !identityPattern.MatchString(r.JudgeDataVersionID) || r.ContentLength < 1 || r.ContentLength > MaxManifestBytes || r.InputBytes < 0 || r.InputBytes > MaxTotalBytes || r.OutputBytes < 0 || r.OutputBytes > MaxTotalBytes || r.TestcaseCount < 1 || r.TestcaseCount > 64 {
		return invalid()
	}
	if _, err := time.Parse(time.RFC3339Nano, r.CreatedAt); err != nil {
		return invalid()
	}
	if m.FormatVersion != FormatVersion || m.JudgeDataVersionID != r.JudgeDataVersionID || m.CreatedAt != r.CreatedAt || m.ExecutionProfileID != "cpp20-gcc-13-v1" || len(m.Entries) != r.TestcaseCount {
		return invalid()
	}
	for _, id := range []string{m.ProblemID, m.ProblemRevisionID, m.TestdataVersionID, m.TestcaseSetID} {
		if !identityPattern.MatchString(id) {
			return invalid()
		}
	}
	seen := map[string]bool{}
	var inputBytes, outputBytes int64
	parts := []string{"2C.4", m.ProblemID, m.ProblemRevisionID, m.TestdataVersionID, m.TestcaseSetID, m.ExecutionProfileID, strconv.Itoa(len(m.Entries))}
	for index, entry := range m.Entries {
		if entry.Index != index || !identityPattern.MatchString(entry.TestcaseID) || seen[entry.TestcaseID] || entry.TestdataVersionID != m.TestdataVersionID || entry.ExecutionProfileID != m.ExecutionProfileID || (entry.CheckerType != "EXACT_BYTES" && entry.CheckerType != "TOKEN_WHITESPACE") || entry.CheckerVersion != "builtin-v1" || entry.CheckerConfigSHA256 != digest([]byte(entry.CheckerType+"\x00builtin-v1")) || entry.TimeLimitMs < 1 || entry.TimeLimitMs > 600000 || entry.MemoryLimitBytes < 1 || entry.MemoryLimitBytes > 4<<30 || entry.OutputLimitBytes < 1 || entry.OutputLimitBytes > 64<<10 {
			return invalid()
		}
		seen[entry.TestcaseID] = true
		for _, object := range []Object{entry.Input, entry.ExpectedOutput} {
			if !objectPattern.MatchString(object.ObjectID) || object.ObjectID == "manifest" || object.SizeBytes < 0 || object.SizeBytes > MaxFileBytes || !digestPattern.MatchString(object.SHA256) {
				return invalid()
			}
		}
		if entry.Input.SHA256 != entry.InputSHA256 || entry.ExpectedOutput.SHA256 != entry.ExpectedOutputSHA256 {
			return invalid()
		}
		inputBytes += entry.Input.SizeBytes
		outputBytes += entry.ExpectedOutput.SizeBytes
		parts = append(parts, strconv.Itoa(index), entry.TestcaseID, entry.TestdataVersionID, entry.InputSHA256, entry.ExecutionProfileID, entry.ExpectedOutputSHA256, "2C.5", entry.CheckerType, entry.CheckerVersion, entry.CheckerConfigSHA256)
	}
	if inputBytes != r.InputBytes || outputBytes != r.OutputBytes || digest([]byte(strings.Join(parts, "\x00"))) != m.ManifestHash {
		return invalid()
	}
	data, err := ManifestBytes(m)
	if err != nil || int64(len(data)) != r.ContentLength || digest(data) != r.ID {
		return invalid()
	}
	return nil
}
