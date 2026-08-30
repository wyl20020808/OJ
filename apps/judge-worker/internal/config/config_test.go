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
}
