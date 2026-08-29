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
}
