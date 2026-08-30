package supervisorclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func validRequest() Request {
	return Request{
		ProtocolVersion: ProtocolVersion, ExecutionRequestID: "job:1", JudgeJobID: "job", SubmissionID: "submission", Attempt: 1,
		CorrelationID: "job", ProblemRevisionID: "revision", TestdataVersionRef: "testdata", LanguageProfileID: CPP20ProfileID,
		SourceSnapshotRef: "submission:submission", SourceBytes: "int main(){}", SourceSHA256: "7febc7bf845d25c8185cd640117a8470ebe91a4e791b6064cd594404fb67bc39",
		ControlledInputID: "stdin-empty-v1", DeadlineAt: time.Now().Add(time.Minute),
	}
}

func TestPreflightAndExecute(t *testing.T) {
	request := validRequest()
	var polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		switch r.URL.Path {
		case "/v1/health":
			_, _ = w.Write([]byte(`{"execution_contract_version":"2C.1","real_submission_execution":true,"supervisor_uid":1000}`))
		case "/v1/executions/capabilities":
			_, _ = w.Write([]byte(`{"protocol_version":"2C.1","real_submission_execution":true,"language_profiles":["cpp20-gcc-13-v1"],"compiler_rootfs_identity":"rootfs","compiler_version":"g++ 13","command_template_sha256":"command"}`))
		case "/v1/executions/start":
			_, _ = w.Write([]byte(`{"status":"ACTIVE","execution_request_id":"job:1"}`))
		case "/v1/executions/status":
			if polls.Add(1) == 1 {
				_, _ = w.Write([]byte(`{"status":"ACTIVE"}`))
				return
			}
			result := map[string]any{"protocol_version": "2C.1", "execution_request_id": "job:1", "judge_job_id": "job", "submission_id": "submission", "attempt": 1, "source_sha256": request.SourceSHA256, "pipeline_outcome": "PIPELINE_COMPLETED", "compile": map[string]any{"outcome": "COMPILE_SUCCEEDED"}, "started_at": time.Now().Add(-time.Second), "completed_at": time.Now(), "clean": true}
			_ = json.NewEncoder(w).Encode(result)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if err = client.Preflight(context.Background()); err != nil {
		t.Fatal(err)
	}
	execution, err := client.Execute(context.Background(), request)
	if err != nil || execution.Result.PipelineOutcome != "PIPELINE_COMPLETED" || !json.Valid(execution.Raw) {
		t.Fatalf("execution=%+v err=%v", execution.Result, err)
	}
}

func TestPreflightFailsClosedAndResultIdentityIsBound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"execution_contract_version":"2C.1","real_submission_execution":true,"supervisor_uid":0}`))
	}))
	defer server.Close()
	client, _ := New(server.URL)
	if err := client.Preflight(context.Background()); err == nil {
		t.Fatal("UID0 Supervisor accepted")
	}
	request := validRequest()
	result := Result{ProtocolVersion: ProtocolVersion, ExecutionRequestID: request.ExecutionRequestID, JudgeJobID: "other", SubmissionID: request.SubmissionID, Attempt: request.Attempt, SourceSHA256: request.SourceSHA256, PipelineOutcome: "PIPELINE_COMPLETED", Compile: json.RawMessage(`{}`), StartedAt: time.Now(), CompletedAt: time.Now()}
	if validateResult(request, result) == nil {
		t.Fatal("cross-job result accepted")
	}
}
