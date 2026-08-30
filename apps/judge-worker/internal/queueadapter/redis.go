package queueadapter

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Job struct {
	ID                     string          `json:"id"`
	SubmissionID           string          `json:"submissionId"`
	IdempotencyKey         string          `json:"idempotencyKey"`
	OwnerUserID            string          `json:"ownerUserId"`
	ProblemID              string          `json:"problemId"`
	ProblemRevisionID      string          `json:"problemRevisionId"`
	TestdataVersionRef     string          `json:"testdataVersionRef"`
	LanguageID             string          `json:"languageId"`
	ExecutionMode          string          `json:"executionMode"`
	LanguageProfileID      string          `json:"languageProfileId"`
	SourceSnapshotRef      string          `json:"sourceSnapshotRef"`
	SourceBytes            string          `json:"sourceBytes"`
	SourceSHA256           string          `json:"sourceSha256"`
	ControlledInputID      string          `json:"controlledInputId"`
	RawExecutionResult     json.RawMessage `json:"rawExecutionResult,omitempty"`
	Status                 string          `json:"status"`
	Attempt                int             `json:"attempt"`
	MaxAttempts            int             `json:"maxAttempts"`
	LeaseOwner             string          `json:"leaseOwner"`
	LeaseToken             string          `json:"leaseToken"`
	LeaseExpiresAt         time.Time       `json:"leaseExpiresAt"`
	FixtureID              string          `json:"fixtureId"`
	FailureReason          string          `json:"failureReason"`
	SyntheticFixtureID     string          `json:"syntheticFixtureId"`
	CompletedAt            string          `json:"completedAt"`
	CreatedAt              string          `json:"createdAt"`
	UpdatedAt              string          `json:"updatedAt"`
	ExecutionRequestID     string          `json:"executionRequestId"`
	ExecutionAttemptID     string          `json:"executionAttemptId"`
	ResultGeneration       int64           `json:"resultGeneration"`
	ResultDigest           string          `json:"rawResultDigest"`
	CancellationGeneration int64           `json:"cancellationGeneration"`
}

type rawExecutionResultIdentity struct {
	ProtocolVersion    string          `json:"protocol_version"`
	ExecutionRequestID string          `json:"execution_request_id"`
	JudgeJobID         string          `json:"judge_job_id"`
	SubmissionID       string          `json:"submission_id"`
	Attempt            int             `json:"attempt"`
	ExecutionAttemptID string          `json:"execution_attempt_id"`
	ResultGeneration   int64           `json:"result_generation"`
	LanguageProfileID  string          `json:"language_profile_id"`
	SourceSHA256       string          `json:"source_sha256"`
	PipelineOutcome    string          `json:"pipeline_outcome"`
	Compile            json.RawMessage `json:"compile"`
}

func validateRawExecutionResult(result json.RawMessage, job Job) error {
	var identity rawExecutionResultIdentity
	if !json.Valid(result) || json.Unmarshal(result, &identity) != nil {
		return errors.New("invalid raw execution result")
	}
	allowedOutcome := map[string]bool{
		"PIPELINE_COMPLETED":      true,
		"PIPELINE_COMPILE_FAILED": true,
		"PIPELINE_LIMIT_HIT":      true,
		"PIPELINE_CANCELLED":      true,
		"PIPELINE_INFRA_FAILURE":  true,
	}
	if identity.ProtocolVersion != "2C.1" ||
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
	return nil
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

type Lease struct {
	Job   Job
	Token string
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
	ExecutionMode, LanguageProfileID, SourceSnapshotRef, SourceBytes, SourceSHA256, ControlledInputID string
	FixtureID                                                                                         string
	MaxAttempts                                                                                       int
}

func (q Queue) Enqueue(ctx context.Context, in CreateInput) (Job, error) {
	if in.ID == "" || in.SubmissionID == "" || in.OwnerUserID == "" || in.ProblemID == "" || in.ProblemRevisionID == "" || in.TestdataVersionRef == "" || in.LanguageID == "" {
		return Job{}, errors.New("missing immutable linkage")
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
		return j, e
	}
	max := in.MaxAttempts
	if max < 1 {
		max = 3
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	j := Job{ID: in.ID, SubmissionID: in.SubmissionID, IdempotencyKey: "submission:" + in.SubmissionID, OwnerUserID: in.OwnerUserID, ProblemID: in.ProblemID, ProblemRevisionID: in.ProblemRevisionID, TestdataVersionRef: in.TestdataVersionRef, LanguageID: in.LanguageID, ExecutionMode: in.ExecutionMode, LanguageProfileID: in.LanguageProfileID, SourceSnapshotRef: in.SourceSnapshotRef, SourceBytes: in.SourceBytes, SourceSHA256: in.SourceSHA256, ControlledInputID: in.ControlledInputID, FixtureID: in.FixtureID, Status: "QUEUED", MaxAttempts: max, CreatedAt: now, UpdatedAt: now}
	if j.ExecutionMode == "" {
		j.ExecutionMode = "SAFE_FIXTURE_QUALIFICATION"
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
	token := fmt.Sprintf("%d", time.Now().UnixNano())
	ok, err := q.Redis.SetNX(ctx, lock, token, 5*time.Second)
	if err != nil || !ok {
		return err
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
	if (status == "COMPLETED") != (j.ExecutionMode == "REAL_SANDBOXED_EXECUTION") {
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
