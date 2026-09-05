package artifact

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

const FormatVersion = "judge-artifact-v1"
const MaxFileBytes int64 = 100 << 20
const MaxManifestBytes int64 = 256 << 10

var digestPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var objectPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type Object struct {
	ObjectID  string `json:"objectId"`
	SizeBytes int64  `json:"sizeBytes"`
	SHA256    string `json:"sha256"`
}

type FetchError struct {
	Code      string
	Retryable bool
}

func (e *FetchError) Error() string             { return e.Code }
func failure(code string, retryable bool) error { return &FetchError{code, retryable} }

// Client only addresses the configured Product data API. Redirects are disabled
// so the service credential cannot escape to an artifact-controlled host.
type Client struct {
	baseURL, token string
	http           *http.Client
}

func NewClient(baseURL, token string) (*Client, error) {
	u, err := url.Parse(baseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || token == "" {
		return nil, failure("INVALID_ARTIFACT_CONTRACT", false)
	}
	return &Client{strings.TrimRight(baseURL, "/"), token, &http.Client{
		Timeout:       2 * time.Minute,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}, nil
}

// Materialized owns a private directory. Only a completely verified file is
// returned; callers must close it after the testcase/checker has finished.
type Materialized struct {
	Path  string
	root  string
	Bytes int64
}

func (m *Materialized) Close() error { return os.RemoveAll(m.root) }

func (c *Client) Fetch(ctx context.Context, artifactID string, object Object, parent string) (*Materialized, error) {
	limit := MaxFileBytes
	if object.ObjectID == "manifest" {
		limit = MaxManifestBytes
	}
	if !digestPattern.MatchString(artifactID) || !objectPattern.MatchString(object.ObjectID) || !digestPattern.MatchString(object.SHA256) || object.SizeBytes < 0 || object.SizeBytes > limit || (object.ObjectID == "manifest" && object.SHA256 != artifactID) {
		return nil, failure("INVALID_ARTIFACT_CONTRACT", false)
	}
	for attempt := 0; attempt < 3; attempt++ {
		result, err := c.fetchOnce(ctx, artifactID, object, parent)
		if err == nil {
			return result, nil
		}
		var fetchErr *FetchError
		if !errors.As(err, &fetchErr) || !fetchErr.Retryable || attempt == 2 || ctx.Err() != nil {
			return nil, err
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, failure("ARTIFACT_FETCH_TIMEOUT", true)
		case <-timer.C:
		}
	}
	return nil, failure("ARTIFACT_UNAVAILABLE", true)
}

func (c *Client) fetchOnce(ctx context.Context, artifactID string, object Object, parent string) (result *Materialized, retErr error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/internal/judge-artifacts/v1/"+artifactID+"/"+object.ObjectID, nil)
	if err != nil {
		return nil, failure("INVALID_ARTIFACT_CONTRACT", false)
	}
	request.Header.Set("x-judge-artifact-token", c.token)
	request.Header.Set("Accept-Encoding", "identity")
	response, err := c.http.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, failure("ARTIFACT_FETCH_TIMEOUT", true)
		}
		var timeout interface{ Timeout() bool }
		if errors.As(err, &timeout) && timeout.Timeout() {
			return nil, failure("ARTIFACT_FETCH_TIMEOUT", true)
		}
		return nil, failure("ARTIFACT_UNAVAILABLE", true)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, failure("ARTIFACT_UNAVAILABLE", response.StatusCode == 429 || response.StatusCode >= 500)
	}
	if response.Header.Get("x-judge-artifact-id") != artifactID || response.Header.Get("x-judge-artifact-format") != FormatVersion || response.Header.Get("x-content-sha256") != object.SHA256 || response.Header.Get("Content-Encoding") != "" {
		return nil, failure("INVALID_ARTIFACT_CONTRACT", false)
	}
	if response.ContentLength >= 0 && response.ContentLength != object.SizeBytes {
		return nil, failure("ARTIFACT_CHECKSUM_MISMATCH", false)
	}
	root, err := os.MkdirTemp(parent, "judge-artifact-")
	if err != nil {
		return nil, failure("ARTIFACT_CAPACITY_UNAVAILABLE", true)
	}
	defer func() {
		if result == nil {
			if err := os.RemoveAll(root); err != nil {
				retErr = failure("ARTIFACT_CLEANUP_FAILED", false)
			}
		}
	}()
	file, err := os.CreateTemp(root, "object-")
	if err != nil {
		return nil, failure("ARTIFACT_CAPACITY_UNAVAILABLE", true)
	}
	digest := sha256.New()
	count, copyErr := io.CopyBuffer(io.MultiWriter(file, digest), io.LimitReader(response.Body, object.SizeBytes+1), make([]byte, 64<<10))
	closeErr := file.Close()
	if ctx.Err() != nil {
		return nil, failure("ARTIFACT_FETCH_TIMEOUT", true)
	}
	if count != object.SizeBytes || hex.EncodeToString(digest.Sum(nil)) != object.SHA256 {
		return nil, failure("ARTIFACT_CHECKSUM_MISMATCH", false)
	}
	if copyErr != nil {
		return nil, failure("ARTIFACT_UNAVAILABLE", true)
	}
	if closeErr != nil {
		return nil, failure("ARTIFACT_CAPACITY_UNAVAILABLE", true)
	}
	if err := os.Chmod(file.Name(), 0o400); err != nil {
		return nil, failure("ARTIFACT_CAPACITY_UNAVAILABLE", true)
	}
	return &Materialized{Path: file.Name(), root: root, Bytes: count}, nil
}
