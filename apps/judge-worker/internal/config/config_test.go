package config

import "testing"

func TestConfigValidation(t *testing.T) {
	c, e := Load(map[string]string{})
	if e != nil || c.MaxConcurrency != 1 {
		t.Fatal(c, e)
	}
	if _, e = Load(map[string]string{"MAX_CONCURRENCY": "0"}); e == nil {
		t.Fatal("invalid concurrency accepted")
	}
	if _, e = Load(map[string]string{"REDIS_URL": "postgres://db"}); e == nil {
		t.Fatal("invalid redis accepted")
	}
	if _, e = Load(map[string]string{"REAL_SUBMISSION_EXECUTION": "true", "OJPLATFORM_SANDBOX_SUPERVISOR_URL": "http://10.0.0.1:19092"}); e == nil {
		t.Fatal("non-loopback Supervisor accepted")
	}
	if c, e = Load(map[string]string{"REAL_SUBMISSION_EXECUTION": "true"}); e != nil || !c.RealSubmissionExecution {
		t.Fatal("valid real execution gate rejected")
	}
	if _, e = Load(map[string]string{"JUDGE_SERVICE_URL": "http://127.0.0.1:3100"}); e == nil {
		t.Fatal("node service without node credential accepted")
	}
	for _, serviceURL := range []string{
		"http://127.0.0.1:3100",
		"http://[::1]:3100",
		"http://localhost:3100",
	} {
		if c, e = Load(map[string]string{"JUDGE_SERVICE_URL": serviceURL, "JUDGE_NODE_TOKEN": "node-token-for-test"}); e != nil || c.JudgeServiceURL == "" {
			t.Fatalf("valid loopback node service configuration %q rejected: %v", serviceURL, e)
		}
	}
	if _, e = Load(map[string]string{"JUDGE_SERVICE_URL": "http://192.0.2.10:3100", "JUDGE_NODE_TOKEN": "node-token-for-test"}); e == nil {
		t.Fatal("cleartext non-loopback node service accepted")
	}
	if c, e = Load(map[string]string{"JUDGE_SERVICE_URL": "https://judge.example.test:3100", "JUDGE_NODE_TOKEN": "node-token-for-test"}); e != nil || c.JudgeServiceURL == "" {
		t.Fatal("TLS node service configuration rejected")
	}
}

func TestHostAgentIdentityOverridesTemplateWorkerID(t *testing.T) {
	c, err := Load(map[string]string{
		"WORKER_ID":                 "template-worker",
		"OJ_JUDGE_NODE_ID":          "logical-node-a",
		"OJ_JUDGE_NODE_INCARNATION": "host-incarnation-a",
	})
	if err != nil || c.WorkerID != "logical-node-a" || c.NodeIncarnation != "host-incarnation-a" {
		t.Fatalf("host identity was not retained: %+v err=%v", c, err)
	}
}

func TestRejectsUnsafeHostAgentIncarnation(t *testing.T) {
	if _, err := Load(map[string]string{"OJ_JUDGE_NODE_INCARNATION": "bad\nidentity"}); err == nil {
		t.Fatal("unsafe host incarnation accepted")
	}
}
