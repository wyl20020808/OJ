package artifact

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func hash(data string) string { sum := sha256.Sum256([]byte(data)); return hex.EncodeToString(sum[:]) }
func headers(w http.ResponseWriter, id string, object Object) {
	w.Header().Set("x-judge-artifact-id", id)
	w.Header().Set("x-judge-artifact-format", FormatVersion)
	w.Header().Set("x-content-sha256", object.SHA256)
}
func assertEmpty(t *testing.T, root string) {
	t.Helper()
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 0 {
		t.Fatalf("temporary residue: %v %v", entries, err)
	}
}

func TestFetchVerifiedStreamAndCleanup(t *testing.T) {
	data := strings.Repeat("0123456789abcdef", 8192)
	id := hash("manifest")
	object := Object{"input-1", int64(len(data)), hash(data)}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-judge-artifact-token") != "test-token" || r.URL.Path != "/internal/judge-artifacts/v1/"+id+"/input-1" {
			t.Error("incorrect authorization or path")
		}
		headers(w, id, object)
		for start := 0; start < len(data); start += 1024 {
			fmt.Fprint(w, data[start:start+1024])
			w.(http.Flusher).Flush()
		}
	}))
	defer server.Close()
	client, _ := NewClient(server.URL, "test-token")
	root := t.TempDir()
	result, err := client.Fetch(context.Background(), id, object, root)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(result.Path)
	if err != nil || string(actual) != data || result.Bytes != int64(len(data)) {
		t.Fatal("incorrect materialization")
	}
	if err := result.Close(); err != nil {
		t.Fatal(err)
	}
	assertEmpty(t, root)
}

func TestRejectInvalidDataAndMetadata(t *testing.T) {
	for _, test := range []struct {
		name, body, version, code string
		size                      int64
	}{
		{"truncated", "a", FormatVersion, "ARTIFACT_CHECKSUM_MISMATCH", 3},
		{"oversized", "abcd", FormatVersion, "ARTIFACT_CHECKSUM_MISMATCH", 3},
		{"corrupt", "xyz", FormatVersion, "ARTIFACT_CHECKSUM_MISMATCH", 3},
		{"version", "abc", "2C.4", "INVALID_ARTIFACT_CONTRACT", 3},
	} {
		t.Run(test.name, func(t *testing.T) {
			id := hash("manifest")
			object := Object{"input", test.size, hash("abc")}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				headers(w, id, object)
				w.Header().Set("x-judge-artifact-format", test.version)
				w.(http.Flusher).Flush()
				fmt.Fprint(w, test.body)
			}))
			defer server.Close()
			client, _ := NewClient(server.URL, "test-token")
			root := t.TempDir()
			_, err := client.Fetch(context.Background(), id, object, root)
			if err == nil || err.Error() != test.code {
				t.Fatalf("unexpected error: %v", err)
			}
			assertEmpty(t, root)
		})
	}
}

func TestRetryBoundedAndCancellation(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); w.WriteHeader(503) }))
	defer server.Close()
	client, _ := NewClient(server.URL, "test-token")
	root := t.TempDir()
	_, err := client.Fetch(context.Background(), hash("manifest"), Object{"input", 0, hash("")}, root)
	if err == nil || calls.Load() != 3 {
		t.Fatalf("retry count %d error %v", calls.Load(), err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = client.Fetch(ctx, hash("manifest"), Object{"input", 0, hash("")}, root)
	if err == nil || err.Error() != "ARTIFACT_FETCH_TIMEOUT" {
		t.Fatalf("cancellation: %v", err)
	}
	assertEmpty(t, root)
}

func TestRejectRedirectAndUnsafeReference(t *testing.T) {
	var leaked atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked.Store(true) }))
	defer target.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer server.Close()
	client, _ := NewClient(server.URL, "test-token")
	root := t.TempDir()
	_, err := client.Fetch(context.Background(), hash("manifest"), Object{"input", 0, hash("")}, root)
	if err == nil || leaked.Load() {
		t.Fatal("redirect followed")
	}
	for _, object := range []Object{{"../secret", 0, hash("")}, {"input", MaxFileBytes + 1, hash("")}, {"manifest", 1, hash("wrong")}} {
		_, err := client.Fetch(context.Background(), hash("manifest"), object, root)
		var fetchErr *FetchError
		if !errors.As(err, &fetchErr) || fetchErr.Code != "INVALID_ARTIFACT_CONTRACT" || fetchErr.Retryable {
			t.Fatalf("invalid reference accepted: %v", err)
		}
	}
	assertEmpty(t, root)
}
