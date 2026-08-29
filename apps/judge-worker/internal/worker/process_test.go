package worker

import (
	"context"
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
