package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	RedisURL                string
	QueuePrefix             string
	WorkerID                string
	BuildVersion            string
	MaxConcurrency          int
	HeartbeatIntervalMS     int
	ShutdownTimeoutMS       int
	LeaseMS                 int
	HealthAddr              string
	HeartbeatPrefix         string
	LivenessTimeoutMS       int
	RealSubmissionExecution bool
	SupervisorURL           string
	JudgeServiceURL         string
	JudgeNodeToken          string
	NodeIncarnation         string
}

func loopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
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
	worker := get("OJ_JUDGE_NODE_ID", get("WORKER_ID", "local-judge-worker"))
	if worker == "" {
		return Config{}, fmt.Errorf("WORKER_ID required")
	}
	incarnation := get("OJ_JUDGE_NODE_INCARNATION", "")
	if len(incarnation) > 128 || strings.ContainsAny(incarnation, "\x00\r\n") {
		return Config{}, fmt.Errorf("invalid OJ_JUDGE_NODE_INCARNATION")
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
	realExecution := get("REAL_SUBMISSION_EXECUTION", "false") == "true"
	supervisorURL := get("OJPLATFORM_SANDBOX_SUPERVISOR_URL", "http://127.0.0.1:19092")
	judgeServiceURL := get("JUDGE_SERVICE_URL", "")
	nodeToken := get("JUDGE_NODE_TOKEN", "")
	if judgeServiceURL != "" {
		service, parseErr := url.Parse(judgeServiceURL)
		if parseErr != nil || (service.Scheme != "http" && service.Scheme != "https") || service.Host == "" || service.User != nil || service.RawQuery != "" || service.Fragment != "" {
			return Config{}, fmt.Errorf("invalid JUDGE_SERVICE_URL")
		}
		if service.Scheme == "http" && !loopbackHost(service.Hostname()) {
			return Config{}, fmt.Errorf("JUDGE_SERVICE_URL requires https off loopback")
		}
		if len(nodeToken) < 16 {
			return Config{}, fmt.Errorf("JUDGE_NODE_TOKEN must be at least 16 characters")
		}
	}
	if realExecution {
		supervisor, parseErr := url.Parse(supervisorURL)
		if parseErr != nil || supervisor.Scheme != "http" || supervisor.Host == "" || supervisor.User != nil || supervisor.RawQuery != "" || supervisor.Fragment != "" || (supervisor.Path != "" && supervisor.Path != "/") {
			return Config{}, fmt.Errorf("invalid loopback Supervisor URL")
		}
		host := supervisor.Hostname()
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			return Config{}, fmt.Errorf("Supervisor URL must be loopback")
		}
	}
	return Config{RedisURL: redis, QueuePrefix: get("QUEUE_PREFIX", "oj:judge"), WorkerID: worker, BuildVersion: get("BUILD_VERSION", "dev"), MaxConcurrency: max, HeartbeatIntervalMS: hb, ShutdownTimeoutMS: shutdown, LeaseMS: lease, HealthAddr: get("HEALTH_ADDR", "127.0.0.1:18080"), HeartbeatPrefix: get("HEARTBEAT_PREFIX", "oj:judge:workers"), LivenessTimeoutMS: liveness, RealSubmissionExecution: realExecution, SupervisorURL: supervisorURL, JudgeServiceURL: judgeServiceURL, JudgeNodeToken: nodeToken, NodeIncarnation: incarnation}, nil
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
