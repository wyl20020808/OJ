package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
)

type Config struct {
	RedisURL            string
	QueuePrefix         string
	WorkerID            string
	BuildVersion        string
	MaxConcurrency      int
	HeartbeatIntervalMS int
	ShutdownTimeoutMS   int
	LeaseMS             int
	HealthAddr          string
	HeartbeatPrefix     string
	LivenessTimeoutMS   int
}

func Load(env map[string]string) (Config, error) {
	get := func(k, d string) string {
		if v := env[k]; v != "" {
			return v
		}
		return d
	}
	redis := get("REDIS_URL", "redis://127.0.0.1:56379")
	u, err := url.Parse(redis)
	if err != nil || u.Scheme != "redis" || u.Host == "" {
		return Config{}, fmt.Errorf("invalid REDIS_URL")
	}
	worker := get("WORKER_ID", "local-judge-worker")
	if worker == "" {
		return Config{}, fmt.Errorf("WORKER_ID required")
	}
	max, err := strconv.Atoi(get("MAX_CONCURRENCY", "1"))
	if err != nil || max < 1 || max > 64 {
		return Config{}, fmt.Errorf("MAX_CONCURRENCY must be 1..64")
	}
	hb, err := strconv.Atoi(get("HEARTBEAT_INTERVAL_MS", "5000"))
	if err != nil || hb < 100 || hb > 60000 {
		return Config{}, fmt.Errorf("invalid heartbeat interval")
	}
	shutdown, err := strconv.Atoi(get("SHUTDOWN_TIMEOUT_MS", "5000"))
	if err != nil || shutdown < 100 || shutdown > 120000 {
		return Config{}, fmt.Errorf("invalid shutdown timeout")
	}
	lease, err := strconv.Atoi(get("LEASE_MS", "30000"))
	if err != nil || lease < 50 || lease > 300000 {
		return Config{}, fmt.Errorf("invalid lease")
	}
	liveness, err := strconv.Atoi(get("LIVENESS_TIMEOUT_MS", "15000"))
	if err != nil || liveness < hb*2 || liveness > 300000 {
		return Config{}, fmt.Errorf("invalid liveness timeout")
	}
	return Config{RedisURL: redis, QueuePrefix: get("QUEUE_PREFIX", "oj:judge"), WorkerID: worker, BuildVersion: get("BUILD_VERSION", "dev"), MaxConcurrency: max, HeartbeatIntervalMS: hb, ShutdownTimeoutMS: shutdown, LeaseMS: lease, HealthAddr: get("HEALTH_ADDR", "127.0.0.1:18080"), HeartbeatPrefix: get("HEARTBEAT_PREFIX", "oj:judge:workers"), LivenessTimeoutMS: liveness}, nil
}

func FromEnv() (Config, error) {
	env := map[string]string{}
	for _, pair := range os.Environ() {
		for i := 0; i < len(pair); i++ {
			if pair[i] == '=' {
				env[pair[:i]] = pair[i+1:]
				break
			}
		}
	}
	return Load(env)
}
