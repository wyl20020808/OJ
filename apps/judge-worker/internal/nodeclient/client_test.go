package nodeclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClaimDecodesValidAssignment(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/v1/nodes/node-a/assignments/claim" {
			t.Errorf("path = %s, want claim path", r.URL.Path)
		}
		if got := r.Header.Get("x-judge-node-token"); got != "node-token" {
			t.Errorf("node token = %q, want node-token", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("content-type", "application/json")
		fmt.Fprint(w, `{"assignment":{"assignmentId":"assignment-1","judgeJobId":"job-1","nodeId":"node-a","incarnation":"inc-1","attemptGeneration":1,"status":"LEASED","assignedAt":"2030-01-01T00:00:00Z","futureAssignmentField":true},"job":{"id":"job-1","submissionId":"submission-1","evaluationGeneration":1,"executionMode":"REAL_SANDBOXED_EXECUTION","status":"LEASED","attempt":1,"leaseOwner":"node-a:inc-1","leaseToken":"lease-1","leaseExpiresAt":"2030-01-01T00:01:00Z","futureJobField":true},"leaseToken":"lease-1","futureResponseField":true}`)
	}))
	defer server.Close()

	claim, err := (Client{BaseURL: server.URL, Token: "node-token", HTTP: server.Client()}).Claim(context.Background(), "node-a", "inc-1")
	if err != nil {
		t.Fatalf("Claim() error = %v", err)
	}
	if claim == nil {
		t.Fatal("Claim() returned nil assignment")
	}
	if claim.Assignment.AssignmentID != "assignment-1" || claim.Job.ID != "job-1" || claim.LeaseToken != "lease-1" {
		t.Fatalf("decoded claim = %+v", claim)
	}
	if got := body["incarnation"]; got != "inc-1" {
		t.Fatalf("request incarnation = %v, want inc-1", got)
	}
}

func TestClaimReturnsNoAssignmentWithoutError(t *testing.T) {
	for _, response := range []string{
		`{"assignment":null,"reason":"NO_COMPATIBLE_JUDGE_NODE"}`,
	} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("content-type", "application/json")
			fmt.Fprint(w, response)
		}))

		claim, err := (Client{BaseURL: server.URL, HTTP: server.Client()}).Claim(context.Background(), "node-a", "inc-1")
		server.Close()
		if err != nil {
			t.Fatalf("Claim(%s) error = %v", response, err)
		}
		if claim != nil {
			t.Fatalf("Claim(%s) = %+v, want nil", response, claim)
		}
	}
}

func TestClaimRejectsPartialAssignment(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		fmt.Fprint(w, `{"assignment":{"assignmentId":"assignment-1"},"leaseToken":"lease-1"}`)
	}))
	defer server.Close()

	claim, err := (Client{BaseURL: server.URL, HTTP: server.Client()}).Claim(context.Background(), "node-a", "inc-1")
	if err == nil {
		t.Fatalf("Claim() accepted partial response: claim=%+v", claim)
	}
}

func TestCancellationRequestedUsesAssignmentBoundEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/v1/nodes/node-a/assignments/assignment-1/cancellation-status" {
			t.Errorf("path = %s, want cancellation status path", r.URL.Path)
		}
		if got := r.Header.Get("x-judge-node-token"); got != "node-token" {
			t.Errorf("node token = %q, want node-token", got)
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if body["incarnation"] != "inc-1" {
			t.Errorf("incarnation = %q, want inc-1", body["incarnation"])
		}
		w.Header().Set("content-type", "application/json")
		fmt.Fprint(w, `{"cancelRequested":true}`)
	}))
	defer server.Close()

	requested, err := (Client{BaseURL: server.URL, Token: "node-token", HTTP: server.Client()}).CancellationRequested(context.Background(), "node-a", "assignment-1", "inc-1")
	if err != nil {
		t.Fatalf("CancellationRequested() error = %v", err)
	}
	if !requested {
		t.Fatal("CancellationRequested() = false, want true")
	}
}

func TestCancellationRequestedRejectsMissingOrMultipleJSONValues(t *testing.T) {
	for _, response := range []string{
		`{}`,
		`null`,
		`{"cancelRequested":false}{"cancelRequested":true}`,
	} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("content-type", "application/json")
			fmt.Fprint(w, response)
		}))
		_, err := (Client{BaseURL: server.URL, HTTP: server.Client()}).CancellationRequested(context.Background(), "node-a", "assignment-1", "inc-1")
		server.Close()
		if err == nil {
			t.Fatalf("CancellationRequested(%s) accepted invalid response", response)
		}
	}
}
