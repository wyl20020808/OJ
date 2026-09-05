package verdict

import (
	"errors"
	"io"
	"strings"
	"testing"
)

func streamEntry(data, checker string) Entry {
	return Entry{ExpectedOutputBytes: int64(len(data)), ExpectedOutputSHA256: sha([]byte(data)), CheckerType: checker,
		OpenExpectedOutput: func() (io.ReadCloser, error) { return io.NopCloser(strings.NewReader(data)), nil }}
}

func TestStreamCheckerMatchesLegacySemantics(t *testing.T) {
	for _, pair := range [][2]string{{"", ""}, {" 1\n2 \t", "1 2"}, {"1", "12"}, {"1 2", "1"}, {"1", "1 2"}, {"x\x00y", "x\x00y"}, {"\u00a0", " "}, {"\t\r\n\v\f ", ""}, {"1 23", "1 24"}} {
		for _, checker := range []string{"EXACT_BYTES", "TOKEN_WHITESPACE"} {
			want, _ := exactMatch([]byte(pair[0]), []byte(pair[1]))
			if checker == "TOKEN_WHITESPACE" {
				want, _ = tokenMatch([]byte(pair[0]), []byte(pair[1]))
			}
			got, _, err := matchExpectedStream(streamEntry(pair[0], checker), []byte(pair[1]))
			if err != nil || got != want {
				t.Fatalf("%s %q %q: matched=%v want=%v error=%v", checker, pair[0], pair[1], got, want, err)
			}
		}
	}
}

func TestStreamCheckerRejectsCorruptionAfterMismatch(t *testing.T) {
	for _, checker := range []string{"EXACT_BYTES", "TOKEN_WHITESPACE"} {
		entry := streamEntry(strings.Repeat("x", 200000), checker)
		entry.ExpectedOutputSHA256 = sha([]byte("wrong"))
		if _, _, err := matchExpectedStream(entry, []byte("a")); err == nil {
			t.Fatal("corruption accepted after mismatch")
		}
	}
}

func TestStreamCheckerLargeTokenAndTrailingWhitespace(t *testing.T) {
	data := strings.Repeat("x", 2<<20)
	matched, _, err := matchExpectedStream(streamEntry(data, "TOKEN_WHITESPACE"), []byte("x"))
	if err != nil || matched {
		t.Fatalf("long token: %v %v", matched, err)
	}
	data = "answer" + strings.Repeat(" \n", 1<<20)
	matched, _, err = matchExpectedStream(streamEntry(data, "TOKEN_WHITESPACE"), []byte("answer"))
	if err != nil || !matched {
		t.Fatalf("trailing whitespace: %v %v", matched, err)
	}
}

func TestStreamCheckerRejectsSizeAndReadFailures(t *testing.T) {
	for _, size := range []int64{2, 4, -1, 100<<20 + 1} {
		entry := streamEntry("abc", "EXACT_BYTES")
		entry.ExpectedOutputBytes = size
		if _, _, err := matchExpectedStream(entry, []byte("abc")); err == nil {
			t.Fatal("wrong size accepted")
		}
	}
	entry := streamEntry("abc", "EXACT_BYTES")
	entry.OpenExpectedOutput = func() (io.ReadCloser, error) { return nil, errors.New("unavailable") }
	if _, _, err := matchExpectedStream(entry, []byte("abc")); err == nil {
		t.Fatal("open failure ignored")
	}
}
