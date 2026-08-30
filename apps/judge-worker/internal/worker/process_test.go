package worker

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/ojplatform/judge-worker/internal/queueadapter"
)

func TestIndependentWorkerProcessClaimsAndStops(t *testing.T) {
	if os.Getenv("OJPLATFORM_WORKER_PROCESS_TEST") != "true" {
		t.Skip("set OJPLATFORM_WORKER_PROCESS_TEST=true for real process qualification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://127.0.0.1:56379"
	}
	redis, err := queueadapter.New(redisURL)
	if err != nil {
		t.Fatal(err)
	}
	if err = redis.Connect(ctx); err != nil {
		t.Fatal(err)
	}
	prefix := "oj:judge:process-" + fmt.Sprintf("%d", time.Now().UnixNano())
	queue := queueadapter.Queue{Redis: redis, Prefix: prefix}
	job, err := queue.Enqueue(ctx, queueadapter.CreateInput{ID: "process-job", SubmissionID: "process-sub", OwnerUserID: "owner", ProblemID: "problem", ProblemRevisionID: "revision", TestdataVersionRef: "testdata", LanguageID: "qualification"})
	if err != nil {
		t.Fatal(err)
	}
	root, _ := os.Getwd()
	root = filepath.Clean(filepath.Join(root, "..", ".."))
	health := "127.0.0.1:28080"
	binaryName := "judge-worker"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	binary := filepath.Join(t.TempDir(), binaryName)
	build := exec.CommandContext(ctx, "go", "build", "-o", binary, "./cmd/judge-worker")
	build.Dir = root
	if output, buildErr := build.CombinedOutput(); buildErr != nil {
		t.Fatalf("worker build failed: %v: %s", buildErr, output)
	}
	cmd := exec.CommandContext(ctx, binary)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "REDIS_URL="+redisURL, "QUEUE_PREFIX="+prefix, "WORKER_ID=process-worker", "HEALTH_ADDR="+health, "HEARTBEAT_INTERVAL_MS=100", "SHUTDOWN_TIMEOUT_MS=3000")
	var logs strings.Builder
	cmd.Stdout = &logs
	cmd.Stderr = &logs
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Signal(syscall.SIGTERM)
			_ = cmd.Wait()
		}
	}()
	ready := false
	for deadline := time.Now().Add(8 * time.Second); time.Now().Before(deadline); {
		response, requestErr := http.Get("http://" + health + "/ready")
		if requestErr == nil {
			response.Body.Close()
			if response.StatusCode == http.StatusOK {
				ready = true
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !ready {
		t.Fatalf("worker never became ready: %s", logs.String())
	}
	for deadline := time.Now().Add(8 * time.Second); time.Now().Before(deadline); {
		raw, getErr := redis.Get(ctx, prefix+":job:"+job.ID)
		if getErr == nil {
			var got queueadapter.Job
			if json.Unmarshal([]byte(raw), &got) == nil && got.Status == "SUCCEEDED_FAKE" {
				_ = cmd.Process.Signal(syscall.SIGTERM)
				if err = cmd.Wait(); err != nil {
					t.Fatalf("worker shutdown failed: %v: %s", err, logs.String())
				}
				_ = redis.Close()
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("job was not completed by independent worker: %s", logs.String())
}

func TestTwoWorkersAndCrashRecovery(t *testing.T) {
	if os.Getenv("OJPLATFORM_WORKER_PROCESS_TEST") != "true" {
		t.Skip("set OJPLATFORM_WORKER_PROCESS_TEST=true for real process qualification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://127.0.0.1:56379"
	}
	redis, err := queueadapter.New(redisURL)
	if err != nil {
		t.Fatal(err)
	}
	if err = redis.Connect(ctx); err != nil {
		t.Fatal(err)
	}
	root, _ := os.Getwd()
	root = filepath.Clean(filepath.Join(root, "..", ".."))
	binaryName := "judge-worker"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	binary := filepath.Join(t.TempDir(), binaryName)
	build := exec.CommandContext(ctx, "go", "build", "-o", binary, "./cmd/judge-worker")
	build.Dir = root
	if output, buildErr := build.CombinedOutput(); buildErr != nil {
		t.Fatalf("build: %v %s", buildErr, output)
	}
	prefix := "oj:judge:crash-" + fmt.Sprintf("%d", time.Now().UnixNano())
	queue := queueadapter.Queue{Redis: redis, Prefix: prefix}
	job, err := queue.Enqueue(ctx, queueadapter.CreateInput{ID: "crash-job", SubmissionID: "crash-sub", OwnerUserID: "owner", ProblemID: "problem", ProblemRevisionID: "revision", TestdataVersionRef: "td", LanguageID: "qualification"})
	if err != nil {
		t.Fatal(err)
	}
	start := func(id, addr string) (*exec.Cmd, *strings.Builder) {
		cmd := exec.CommandContext(ctx, binary)
		cmd.Dir = root
		cmd.Env = append(os.Environ(), "REDIS_URL="+redisURL, "QUEUE_PREFIX="+prefix, "WORKER_ID="+id, "HEALTH_ADDR="+addr, "HEARTBEAT_INTERVAL_MS=100", "LEASE_MS=100", "SHUTDOWN_TIMEOUT_MS=3000")
		var output strings.Builder
		cmd.Stdout = &output
		cmd.Stderr = &output
		if e := cmd.Start(); e != nil {
			t.Fatal(e)
		}
		return cmd, &output
	}
	first, firstLog := start("worker-a", "127.0.0.1:28180")
	if !waitReady("127.0.0.1:28180", 5*time.Second) {
		t.Fatalf("first not ready: %s", firstLog.String())
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		raw, _ := redis.Get(ctx, prefix+":job:"+job.ID)
		var current queueadapter.Job
		if json.Unmarshal([]byte(raw), &current) == nil && current.Status == "LEASED_FAKE" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err := first.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	_ = first.Wait()
	second, secondLog := start("worker-b", "127.0.0.1:28181")
	defer func() { _ = second.Process.Signal(syscall.SIGTERM); _ = second.Wait() }()
	if !waitReady("127.0.0.1:28181", 5*time.Second) {
		t.Fatalf("second not ready: %s", secondLog.String())
	}
	deadline = time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		raw, _ := redis.Get(ctx, prefix+":job:"+job.ID)
		var current queueadapter.Job
		if json.Unmarshal([]byte(raw), &current) == nil && current.Status == "SUCCEEDED_FAKE" {
			_ = second.Process.Signal(syscall.SIGTERM)
			if err := second.Wait(); err != nil {
				t.Fatalf("worker shutdown failed: %v: %s", err, secondLog.String())
			}
			firstInstance := instanceFromLog(firstLog.String())
			secondInstance := instanceFromLog(secondLog.String())
			if firstInstance == "" || secondInstance == "" || firstInstance == secondInstance {
				t.Fatalf("worker instance identity collision: %q %q", firstInstance, secondInstance)
			}
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("crashed lease was not recovered: %s", secondLog.String())
}

func TestRealWorkerCrashRecoveryUsesNewExecutionAttempt(t *testing.T) {
	if os.Getenv("OJPLATFORM_REAL_WORKER_PROCESS_TEST") != "true" {
		t.Skip("set OJPLATFORM_REAL_WORKER_PROCESS_TEST=true for real execution process qualification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://127.0.0.1:56379"
	}
	supervisorURL := os.Getenv("OJPLATFORM_SANDBOX_SUPERVISOR_URL")
	if supervisorURL == "" {
		supervisorURL = "http://127.0.0.1:19102"
	}
	redis, err := queueadapter.New(redisURL)
	if err != nil {
		t.Fatal(err)
	}
	if err = redis.Connect(ctx); err != nil {
		t.Fatal(err)
	}
	defer redis.Close()
	runID := fmt.Sprintf("%d", time.Now().UnixNano())
	prefix := "oj:judge:real-crash-" + runID
	defer func() {
		keys, _ := redis.Keys(context.Background(), prefix+"*")
		for _, key := range keys {
			_ = redis.Del(context.Background(), key)
		}
	}()
	source := "#include <iostream>\nint main(){std::cout << \"worker-recovered\\n\";}\n"
	digest := sha256.Sum256([]byte(source))
	queue := queueadapter.Queue{Redis: redis, Prefix: prefix}
	job, err := queue.Enqueue(ctx, queueadapter.CreateInput{
		ID: "real-crash-job-" + runID, SubmissionID: "real-crash-submission-" + runID, OwnerUserID: "owner",
		ProblemID: "problem", ProblemRevisionID: "revision", TestdataVersionRef: "testdata-v1",
		LanguageID: "cpp20", ExecutionMode: "REAL_SANDBOXED_EXECUTION",
		LanguageProfileID: "cpp20-gcc-13-v1", SourceSnapshotRef: "submission:real-crash-submission:" + runID,
		SourceBytes: source, SourceSHA256: fmt.Sprintf("%x", digest[:]), ControlledInputID: "stdin-empty-v1",
		MaxAttempts: 3,
	})
	if err != nil {
		t.Fatal(err)
	}
	root, _ := os.Getwd()
	root = filepath.Clean(filepath.Join(root, "..", ".."))
	binaryName := "judge-worker"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	binary := filepath.Join(t.TempDir(), binaryName)
	build := exec.CommandContext(ctx, "go", "build", "-o", binary, "./cmd/judge-worker")
	build.Dir = root
	if output, buildErr := build.CombinedOutput(); buildErr != nil {
		t.Fatalf("worker build failed: %v: %s", buildErr, output)
	}
	start := func(id, health string) (*exec.Cmd, *strings.Builder) {
		cmd := exec.CommandContext(ctx, binary)
		cmd.Dir = root
		cmd.Env = append(os.Environ(),
			"REDIS_URL="+redisURL, "QUEUE_PREFIX="+prefix, "WORKER_ID="+id,
			"HEALTH_ADDR="+health, "HEARTBEAT_INTERVAL_MS=100", "LIVENESS_TIMEOUT_MS=1000",
			"LEASE_MS=10000", "SHUTDOWN_TIMEOUT_MS=3000", "REAL_SUBMISSION_EXECUTION=true",
			"OJPLATFORM_SANDBOX_SUPERVISOR_URL="+supervisorURL,
		)
		var output strings.Builder
		cmd.Stdout, cmd.Stderr = &output, &output
		if startErr := cmd.Start(); startErr != nil {
			t.Fatal(startErr)
		}
		return cmd, &output
	}
	first, firstLog := start("real-worker-a", "127.0.0.1:28280")
	if !waitReady("127.0.0.1:28280", 8*time.Second) {
		t.Fatalf("first real worker not ready: %s", firstLog.String())
	}
	leased := false
	for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); {
		raw, _ := redis.Get(ctx, prefix+":job:"+job.ID)
		var current queueadapter.Job
		if json.Unmarshal([]byte(raw), &current) == nil && current.Status == "LEASED" && current.Attempt == 1 {
			leased = true
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if !leased {
		_ = first.Process.Kill()
		_ = first.Wait()
		t.Fatalf("first real attempt was not observed active: %s", firstLog.String())
	}
	if err = first.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	_ = first.Wait()

	second, secondLog := start("real-worker-b", "127.0.0.1:28281")
	defer stopTestProcess(second)
	if !waitReady("127.0.0.1:28281", 8*time.Second) {
		t.Fatalf("second real worker not ready: %s", secondLog.String())
	}
	for deadline := time.Now().Add(20 * time.Second); time.Now().Before(deadline); {
		raw, _ := redis.Get(ctx, prefix+":job:"+job.ID)
		var current queueadapter.Job
		if json.Unmarshal([]byte(raw), &current) == nil && current.Status == "COMPLETED" {
			if current.Attempt != 2 || current.ExecutionRequestID != job.ID+":2" || current.ExecutionAttemptID != job.ID+":2:attempt" || current.ResultGeneration != 2 {
				t.Fatalf("recovered result identity mismatch: %+v", current)
			}
			var result struct {
				ExecutionRequestID string `json:"execution_request_id"`
				ExecutionAttemptID string `json:"execution_attempt_id"`
				ResultGeneration   int64  `json:"result_generation"`
			}
			if json.Unmarshal(current.RawExecutionResult, &result) != nil || result.ExecutionRequestID != job.ID+":2" || result.ExecutionAttemptID != job.ID+":2:attempt" || result.ResultGeneration != 2 {
				t.Fatalf("persisted recovered result mismatch: %+v", result)
			}
			stopTestProcess(second)
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("real worker crash was not recovered: first=%s second=%s", firstLog.String(), secondLog.String())
}

func stopTestProcess(command *exec.Cmd) {
	if command == nil || command.Process == nil || command.ProcessState != nil {
		return
	}
	if runtime.GOOS == "windows" {
		_ = command.Process.Kill()
	} else {
		_ = command.Process.Signal(syscall.SIGTERM)
	}
	_ = command.Wait()
}

func instanceFromLog(logText string) string {
	marker := `worker_instance_id":"`
	start := strings.Index(logText, marker)
	if start < 0 {
		return ""
	}
	rest := logText[start+len(marker):]
	end := strings.IndexByte(rest, '"')
	if end < 0 {
		return ""
	}
	return rest[:end]
}

func waitReady(addr string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		response, err := http.Get("http://" + addr + "/ready")
		if err == nil {
			response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return true
			}
		}
		time.Sleep(25 * time.Millisecond)
	}
	return false
}
