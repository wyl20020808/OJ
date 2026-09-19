#!/usr/bin/env bash
#
# OJPlatform deployment doctor - read-only diagnostics.
#
#   sudo ./deploy/doctor.sh
#
# This command never changes the host. It inspects an existing deployment and
# prints a report: it does not install, restart, or repair anything.
#
# Exit status: 0 when every check passes, 1 when something is wrong. The last
# line is always DEPLOY_DOCTOR=PASS or DEPLOY_DOCTOR=FAIL.
#
set -uo pipefail

SCRIPT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_PATH
REPO_ROOT="$(cd -- "${SCRIPT_PATH}/.." && pwd)"
readonly REPO_ROOT
readonly COMPOSE_FILES=(-f "${REPO_ROOT}/compose.yaml" -f "${REPO_ROOT}/compose.prod.yaml")
readonly SUBMODULE_PATH="plugins/OnlineCodeEditor"

ENV_FILE="${REPO_ROOT}/.env"
FAILURES=0

section() { printf '\n== %s ==\n' "$1"; }
ok() { printf '  OK    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
info() { printf '  ·     %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done

env_value() {
  [[ -f "${ENV_FILE}" ]] || return 0
  local value
  value="$(sed -n "s/^$1=//p" "${ENV_FILE}" | tail -n 1)"
  printf '%s' "${value:-$2}"
}

section "host"
info "kernel  : $(uname -srm)"
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  info "os      : ${PRETTY_NAME:-unknown}"
fi
info "arch    : $(uname -m)"
info "cgroup  : $(stat -fc %T /sys/fs/cgroup 2>/dev/null || echo unknown)"
info "uptime  : $(uptime -p 2>/dev/null || echo unknown)"

section "docker"
if have docker; then
  info "engine  : $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unavailable)"
  info "compose : $(docker compose version --short 2>/dev/null || echo unavailable)"
  if docker info >/dev/null 2>&1; then
    ok "Docker daemon reachable"
  else
    bad "Docker daemon not reachable"
  fi
else
  bad "docker is not installed"
fi

section "repository"
info "root    : ${REPO_ROOT}"
info "commit  : $(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
info "branch  : $(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo detached)"
if [[ -f "${REPO_ROOT}/.gitmodules" ]]; then
  expected="$(git -C "${REPO_ROOT}" ls-tree HEAD -- "${SUBMODULE_PATH}" | awk '{print $3}')"
  actual="$(git -C "${REPO_ROOT}/${SUBMODULE_PATH}" rev-parse HEAD 2>/dev/null || echo missing)"
  info "plugin  : pinned ${expected:-unknown}"
  if [[ -n "${expected}" && "${expected}" == "${actual}" ]]; then
    ok "OnlineCodeEditor submodule at the pinned commit"
  else
    bad "OnlineCodeEditor submodule is at '${actual}', expected '${expected}'"
  fi
else
  bad ".gitmodules is missing"
fi

section "environment"
if [[ -f "${ENV_FILE}" ]]; then
  info "file    : ${ENV_FILE} (mode $(stat -c '%a' "${ENV_FILE}" 2>/dev/null || echo unknown))"
  missing=0
  while IFS= read -r name; do
    value="$(sed -n "s/^${name}=//p" "${ENV_FILE}" | tail -n 1)"
    [[ -n "${value}" && "${value}" != *'<set-strong-random-value>'* ]] || missing=$((missing + 1))
  done < <(grep -oE '\$\{[A-Z0-9_]+:\?' "${REPO_ROOT}/compose.prod.yaml" | sed 's/[{}$:?]//g' | sort -u)
  if [[ ${missing} -eq 0 ]]; then
    ok "all production-required values are set (values are never printed)"
  else
    bad "${missing} required production value(s) are missing"
  fi
  mode="$(stat -c '%a' "${ENV_FILE}" 2>/dev/null || echo 000)"
  [[ "${mode}" == "600" ]] && ok "env file mode is 0600" || bad "env file mode is ${mode}, expected 600"
else
  warn_file="no ${ENV_FILE}; the deployment was never initialised"
  bad "${warn_file}"
fi

section "compose"
if have docker && docker info >/dev/null 2>&1; then
  ( cd "${REPO_ROOT}" && docker compose "${COMPOSE_FILES[@]}" ps --format 'table {{.Service}}\t{{.Status}}' ) 2>/dev/null || bad "compose project is not running"
  for service in postgres redis minio api web judge-service; do
    status="$( ( cd "${REPO_ROOT}" && docker compose "${COMPOSE_FILES[@]}" ps "${service}" --format '{{.Status}}' ) 2>/dev/null | head -n 1)"
    [[ "${status}" == *healthy* ]] && ok "${service}: ${status}" || bad "${service}: ${status:-not running}"
  done
else
  bad "cannot inspect the Compose project without a reachable Docker daemon"
fi

section "judge execution cell"
if have systemctl; then
  worker_state="$(systemctl is-active ojplatform-worker.service 2>/dev/null || true)"
  [[ "${worker_state}" == "active" ]] && ok "ojplatform-worker.service: ${worker_state}" || bad "ojplatform-worker.service: ${worker_state:-missing}"
  if [[ -e /etc/systemd/system/ojplatform-host-agent.service ]]; then
    state="$(systemctl is-active ojplatform-host-agent.service 2>/dev/null || true)"
    [[ "${state}" == "active" ]] && ok "ojplatform-host-agent.service: ${state}" || bad "ojplatform-host-agent.service: ${state:-missing}"
  else
    info "ojplatform-host-agent.service: not installed (optional component)"
  fi
  if id -u oj-sandbox >/dev/null 2>&1; then
    uid="$(id -u oj-sandbox)"
    supervisor_state="$(runuser -u oj-sandbox -- env XDG_RUNTIME_DIR="/run/user/${uid}" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${uid}/bus" systemctl --user is-active ojplatform-supervisor.service 2>/dev/null || true)"
    [[ "${supervisor_state}" == "active" ]] && ok "ojplatform-supervisor.service: ${supervisor_state}" || bad "ojplatform-supervisor.service: ${supervisor_state:-missing}"
    groups="$(id -nG oj-sandbox)"
    [[ " ${groups} " == *" docker "* ]] && bad "oj-sandbox is in the docker group" || ok "oj-sandbox has no privileged group"
    runuser -u oj-sandbox -- test -r /var/run/docker.sock 2>/dev/null && bad "oj-sandbox can read the Docker socket" || ok "oj-sandbox cannot read the Docker socket"
  else
    bad "the oj-sandbox identity is missing"
  fi
else
  bad "systemctl is unavailable"
fi

section "endpoints"
if have curl; then
  web_port="$(env_value OJPLATFORM_WEB_PORT 8080)"
  api_port="$(env_value OJPLATFORM_API_INTERNAL_PORT 3010)"
  judge_port="$(env_value OJPLATFORM_JUDGE_SERVICE_PORT 3100)"
  web_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:${web_port}/" || true)"
  ready_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:${api_port}/ready" || true)"
  judge_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:${judge_port}/health" || true)"
  worker_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:19093/ready" || true)"
  [[ "${web_code}" == "200" ]] && ok "web   http://127.0.0.1:${web_port}/ -> ${web_code}" || bad "web -> ${web_code}"
  [[ "${ready_code}" == "200" ]] && ok "api   /ready -> ${ready_code}" || bad "api /ready -> ${ready_code}"
  [[ "${judge_code}" == "200" ]] && ok "judge /health -> ${judge_code}" || bad "judge /health -> ${judge_code}"
  [[ "${worker_code}" == "200" ]] && ok "worker /ready -> ${worker_code}" || info "worker /ready -> ${worker_code} (needs the control plane)"
else
  bad "curl is unavailable"
fi

section "storage"
df -h /var/lib 2>/dev/null | tail -n 1 | awk '{printf "  ·     /var/lib: %s used, %s free (%s)\n", $3, $4, $5}'
if [[ -d /opt/ojplatform/compiler-rootfs ]]; then
  identity="$(cat /opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1.identity 2>/dev/null || echo missing)"
  info "compiler rootfs identity: ${identity}"
fi
if have docker && docker info >/dev/null 2>&1; then
  ( cd "${REPO_ROOT}" && docker system df ) 2>/dev/null | sed 's/^/  ·     /' || true
fi

section "listeners"
if have ss; then
  ss -lntH 2>/dev/null | awk '{print "  ·     " $4}' | sort -u | head -n 20
fi

printf '\n'
if [[ ${FAILURES} -eq 0 ]]; then
  printf 'DEPLOY_DOCTOR=PASS\n'
  exit 0
fi
printf 'DEPLOY_DOCTOR=FAIL (%d finding(s))\n' "${FAILURES}"
exit 1
