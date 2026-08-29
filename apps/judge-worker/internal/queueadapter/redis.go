package queueadapter

import (
	"bufio"
	"context"
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
	ID                 string    `json:"id"`
	SubmissionID       string    `json:"submissionId"`
	IdempotencyKey     string    `json:"idempotencyKey"`
	OwnerUserID        string    `json:"ownerUserId"`
	ProblemID          string    `json:"problemId"`
	ProblemRevisionID  string    `json:"problemRevisionId"`
	TestdataVersionRef string    `json:"testdataVersionRef"`
	LanguageID         string    `json:"languageId"`
	Status             string    `json:"status"`
	Attempt            int       `json:"attempt"`
	MaxAttempts        int       `json:"maxAttempts"`
	LeaseOwner         string    `json:"leaseOwner"`
	LeaseToken         string    `json:"leaseToken"`
	LeaseExpiresAt     time.Time `json:"leaseExpiresAt"`
	FixtureID          string    `json:"fixtureId"`
	FailureReason      string    `json:"failureReason"`
	SyntheticFixtureID string    `json:"syntheticFixtureId"`
	CompletedAt        string    `json:"completedAt"`
	CreatedAt          string    `json:"createdAt"`
	UpdatedAt          string    `json:"updatedAt"`
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
	if err := c.Connect(ctx); err != nil {
		return nil, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.command(args...)
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
	ID, SubmissionID, OwnerUserID, ProblemID, ProblemRevisionID, TestdataVersionRef, LanguageID string
	FixtureID                                                                                   string
	MaxAttempts                                                                                 int
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
	j := Job{ID: in.ID, SubmissionID: in.SubmissionID, IdempotencyKey: "submission:" + in.SubmissionID, OwnerUserID: in.OwnerUserID, ProblemID: in.ProblemID, ProblemRevisionID: in.ProblemRevisionID, TestdataVersionRef: in.TestdataVersionRef, LanguageID: in.LanguageID, FixtureID: in.FixtureID, Status: "QUEUED", MaxAttempts: max, CreatedAt: now, UpdatedAt: now}
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
	if j.Status != "QUEUED" && j.Status != "FAILED_RETRYABLE" {
		return nil, nil
	}
	j.Status = "LEASED_FAKE"
	j.Attempt++
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
		if j.Status != "LEASED_FAKE" || j.LeaseExpiresAt.IsZero() || time.Now().Before(j.LeaseExpiresAt) {
			continue
		}
		j.LeaseOwner, j.LeaseToken = "", ""
		j.LeaseExpiresAt = time.Time{}
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
func (q Queue) update(ctx context.Context, l Lease, status, reason string) error {
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
	if j.Status == "SUCCEEDED_FAKE" || j.Status == "FAILED_TERMINAL" || j.Status == "CANCELLED" {
		return nil
	}
	if j.Status != "LEASED_FAKE" || j.LeaseToken != l.Token || time.Now().After(j.LeaseExpiresAt) {
		return errors.New("lease conflict")
	}
	j.Status = status
	j.LeaseToken = ""
	j.LeaseOwner = ""
	j.LeaseExpiresAt = time.Time{}
	j.FailureReason = reason
	j.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if status == "SUCCEEDED_FAKE" {
		j.SyntheticFixtureID = l.Job.FixtureID
		j.CompletedAt = j.UpdatedAt
	}
	encoded, _ := json.Marshal(j)
	if _, err = q.Redis.String(ctx, "SET", q.key("job", j.ID), string(encoded)); err != nil {
		return err
	}
	if status == "FAILED_RETRYABLE" {
		return q.Redis.Push(ctx, q.key("queue", ""), j.ID)
	}
	return nil
}
func (q Queue) Complete(ctx context.Context, l Lease) error {
	return q.update(ctx, l, "SUCCEEDED_FAKE", "")
}
func (q Queue) Retry(ctx context.Context, l Lease, reason string) error {
	return q.update(ctx, l, "FAILED_RETRYABLE", reason)
}
func (q Queue) FailTerminal(ctx context.Context, l Lease, reason string) error {
	return q.update(ctx, l, "FAILED_TERMINAL", reason)
}
func (q Queue) Cancel(ctx context.Context, l Lease) error {
	return q.update(ctx, l, "CANCELLED", "cancelled")
}

func (q Queue) CancellationRequested(ctx context.Context, jobID string) (bool, error) {
	value, err := q.Redis.Get(ctx, q.key("cancel", jobID))
	return value != "", err
}
