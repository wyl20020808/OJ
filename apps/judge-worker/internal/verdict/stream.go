package verdict

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// A differing prefix is not enough to authorize WA: drain and verify the
// complete expected output before producing any user verdict.
func matchExpectedStream(entry Entry, actual []byte) (bool, string, error) {
	if entry.ExpectedOutputBytes < 0 || entry.ExpectedOutputBytes > 100<<20 || len(actual) > 64<<10 {
		return false, "", errors.New("checker size rejected")
	}
	file, err := entry.OpenExpectedOutput()
	if err != nil {
		return false, "", err
	}
	limit := &io.LimitedReader{R: file, N: entry.ExpectedOutputBytes + 1}
	digest := sha256.New()
	expected := bufio.NewReaderSize(io.TeeReader(limit, digest), 64<<10)
	observed := bufio.NewReader(bytes.NewReader(actual))
	var matched bool
	var diagnostic string
	var compareErr error
	switch entry.CheckerType {
	case "EXACT_BYTES":
		matched, diagnostic, compareErr = compareByteStreams(expected.ReadByte, observed.ReadByte, false)
	case "TOKEN_WHITESPACE":
		left, right := normalizedTokens{reader: expected}, normalizedTokens{reader: observed}
		matched, diagnostic, compareErr = compareByteStreams(left.next, right.next, true)
	default:
		compareErr = errors.New("unsupported checker")
	}
	_, drainErr := io.Copy(io.Discard, expected)
	closeErr := file.Close()
	if compareErr != nil || drainErr != nil || closeErr != nil || limit.N != 1 || hex.EncodeToString(digest.Sum(nil)) != entry.ExpectedOutputSHA256 {
		return false, "", errors.New("checker expected output integrity failure")
	}
	return matched, diagnostic, nil
}

func compareByteStreams(left, right func() (byte, error), tokens bool) (bool, string, error) {
	position, ordinal := 0, 0
	for {
		a, ae := left()
		b, be := right()
		if ae != nil && ae != io.EOF {
			return false, "", ae
		}
		if be != nil && be != io.EOF {
			return false, "", be
		}
		if ae == io.EOF && be == io.EOF {
			return true, "", nil
		}
		if ae != be || a != b {
			if tokens {
				return false, fmt.Sprintf("token_mismatch_index=%d", ordinal), nil
			}
			return false, fmt.Sprintf("first_mismatch_offset=%d", position), nil
		}
		position++
		if tokens && a == ' ' {
			ordinal++
		}
	}
}

// Normalize only ASCII whitespace, exactly matching builtin-v1. Long tokens
// are consumed byte by byte and never accumulated in a scanner buffer.
type normalizedTokens struct {
	reader     *bufio.Reader
	inToken    bool
	pending    byte
	hasPending bool
}

func (r *normalizedTokens) next() (byte, error) {
	if r.hasPending {
		r.hasPending = false
		r.inToken = true
		return r.pending, nil
	}
	for {
		b, err := r.reader.ReadByte()
		if err != nil {
			return 0, err
		}
		if !asciiWS(b) {
			r.inToken = true
			return b, nil
		}
		if !r.inToken {
			continue
		}
		for {
			b, err = r.reader.ReadByte()
			if err != nil {
				return 0, err
			}
			if !asciiWS(b) {
				r.pending = b
				r.hasPending = true
				r.inToken = false
				return ' ', nil
			}
		}
	}
}
