package supervisorclient

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ojplatform/judge-worker/internal/artifact"
)

func TestArtifactStagingStreamsRawBytesAndValidatesResponse(t *testing.T) {
	input := bytes.Repeat([]byte("input\n"), 20000)
	path := filepath.Join(t.TempDir(), "verified-input")
	if err := os.WriteFile(path, input, 0600); err != nil {
		t.Fatal(err)
	}
	hash, id, handle := setDigest(input), strings.Repeat("a", 64), strings.Repeat("b", 64)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/health" {
			json.NewEncoder(w).Encode(map[string]string{"artifact_execution_contract_version": artifact.ExecutionContract})
			return
		}
		if r.URL.Path != "/v1/artifact-inputs" || r.Header.Get("x-supervisor-artifact-token") != "test-only-token" || r.Header.Get("x-judge-artifact-id") != id || r.Header.Get("x-execution-request-id") != "execution-1" || r.ContentLength != int64(len(input)) {
			t.Error("staging request binding or raw content length mismatch")
			http.Error(w, "rejected", 400)
			return
		}
		digest := sha256.New()
		n, err := io.Copy(digest, r.Body)
		if err != nil || n != int64(len(input)) || hex.EncodeToString(digest.Sum(nil)) != hash {
			t.Error("input was encoded or corrupted")
		}
		json.NewEncoder(w).Encode(map[string]any{"handle": handle, "size_bytes": len(input), "sha256": hash})
	}))
	defer server.Close()
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if err := client.EnableArtifacts(context.Background(), "test-only-token"); err != nil {
		t.Fatal(err)
	}
	entry := artifact.Testcase{Input: artifact.Object{SizeBytes: int64(len(input)), SHA256: hash}, TimeLimitMs: 1000, MemoryLimitBytes: 64 << 20, OutputLimitBytes: 64 << 10}
	result, err := client.StageArtifactInput(context.Background(), id, "execution-1", &artifact.Materialized{Path: path, Bytes: int64(len(input))}, entry)
	if err != nil || result.Handle != handle || result.SizeBytes != int64(len(input)) {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	encoded, _ := json.Marshal(result)
	if len(encoded) > 512 || bytes.Contains(encoded, []byte(path)) {
		t.Fatal("staging descriptor exposes data or host path")
	}
}

func TestArtifactControlBoundedAndLegacySupervisorRejected(t *testing.T) {
	request := validSetRequest()
	request.ProtocolVersion = artifact.ExecutionContract
	request.JudgeArtifactID = strings.Repeat("a", 64)
	for index := range request.Manifest.Entries {
		entry := &request.Manifest.Entries[index]
		entry.Input = nil
		request.Inputs = append(request.Inputs, ArtifactInput{Index: index, Handle: strings.Repeat("b", 64), SHA256: entry.InputSHA256, SizeBytes: 100 << 20, TimeLimitMs: 1000, MemoryLimitBytes: 64 << 20, OutputLimitBytes: 64 << 10})
	}
	if err := validateArtifactSetRequest(request); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(request)
	if len(encoded) > 4096 || bytes.Contains(encoded, []byte("b25lCg==")) {
		t.Fatal("200 MiB metadata expanded control payload")
	}
	request.Inputs[0].Handle = "/etc/passwd"
	if validateArtifactSetRequest(request) == nil {
		t.Fatal("host path accepted as handle")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"execution_set_contract_version": "2C.4"})
	}))
	defer server.Close()
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if err := client.EnableArtifacts(context.Background(), "test-only-token"); err == nil {
		t.Fatal("legacy Supervisor accepted")
	}
}
