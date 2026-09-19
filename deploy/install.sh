#!/usr/bin/env bash
#
# OJPlatform one-command production deployment.
#
#   sudo ./deploy/install.sh
#
# This is an idempotent bootstrap on top of the standard tooling. It does not
# replace Docker Compose: every container is started with the documented
# `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d`.
#
# What it does, in order:
#   1. preflight      - supported OS/arch, root, resources, free disk
#   2. docker         - ensure Docker Engine + Compose v2 plugin (installs them
#                       from the official Docker repository when missing)
#   3. source         - initialise the pinned OnlineCodeEditor submodule
#   4. environment    - create the production env file with generated secrets
#                       (never overwrites an existing one)
#   5. ports          - refuse to start on top of unrelated listeners
#   6. control plane  - standard production Compose startup
#   7. health         - wait until every long-lived service is healthy
#   8. execution cell - deploy/judge-host/install.sh (Supervisor/Worker/probe)
#
# The two-command manual path remains supported and documented:
#   docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
#   sudo ./deploy/judge-host/install.sh
#
# Options:
#   --env-file PATH        Production env file (default: <repo>/.env)
#   --check                Run preflight only; change nothing
#   --non-interactive      Never prompt (the default; accepted for automation)
#   --skip-docker-install  Fail instead of installing Docker when it is missing
#   --skip-judge-host      Skip the host-native execution cell (Core-only host)
#   --no-build             Reuse existing images instead of building
#   -h, --help             Show this help
#
set -euo pipefail
umask 0027

SCRIPT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_PATH
REPO_ROOT="$(cd -- "${SCRIPT_PATH}/.." && pwd)"
readonly REPO_ROOT

readonly COMPOSE_FILES=(-f "${REPO_ROOT}/compose.yaml" -f "${REPO_ROOT}/compose.prod.yaml")
readonly JUDGE_PROFILE=(--profile judge)
readonly SUBMODULE_PATH="plugins/OnlineCodeEditor"
readonly ENV_TEMPLATE="${REPO_ROOT}/.env.production.example"

readonly HEALTH_TIMEOUT=900
readonly BUILD_TIMEOUT_SECONDS=3600

ENV_FILE="${REPO_ROOT}/.env"
CHECK_ONLY=0
SKIP_DOCKER_INSTALL=0
SKIP_JUDGE_HOST=0
NO_BUILD=0

log() { printf '%s [install] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
step() { printf '\n%s [install] == %s ==\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
warn() { printf '%s [install] WARNING: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
die() { printf '%s [install] ERROR: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; exit 1; }

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    --non-interactive) shift ;;
    --skip-docker-install) SKIP_DOCKER_INSTALL=1; shift ;;
    --skip-judge-host) SKIP_JUDGE_HOST=1; shift ;;
    --no-build) NO_BUILD=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# 1. Preflight
# ---------------------------------------------------------------------------

preflight() {
  step "preflight"

  [[ "$(uname -s)" == "Linux" ]] || die "OJPlatform production deployment requires Linux (found $(uname -s)); macOS is not a supported deployment target"
  local arch
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|amd64) : ;;
    aarch64|arm64) die "Linux ARM64 is NOT QUALIFIED for OJPlatform production deployment; only x86_64 is supported" ;;
    *) die "unsupported architecture '${arch}'; OJPlatform production deployment supports x86_64 only" ;;
  esac

  [[ -r /etc/os-release ]] || die "cannot read /etc/os-release"
  # shellcheck disable=SC1091
  . /etc/os-release
  log "host: ${PRETTY_NAME:-unknown} (${arch})"
  case "${ID:-}" in
    ubuntu)
      case "${VERSION_ID:-}" in
        24.04|26.04) : ;;
        *) warn "Ubuntu ${VERSION_ID:-unknown} is not a qualified release; 24.04 LTS is the qualified baseline" ;;
      esac
      ;;
    debian) warn "Debian is not a qualified release; 24.04 LTS is the qualified baseline" ;;
    *) warn "distribution '${ID:-unknown}' is not qualified; Ubuntu 24.04 LTS is the qualified baseline" ;;
  esac

  have systemctl || die "systemd is required (the execution cell runs as systemd units)"
  [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" == "systemd" ]] || die "PID 1 is not systemd"
  [[ -f /sys/fs/cgroup/cgroup.controllers ]] || die "cgroup v2 (unified hierarchy) is required"

  local mem_mb disk_gb cpus
  mem_mb="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)"
  disk_gb="$(df -Pk /var/lib 2>/dev/null | awk 'NR==2 {printf "%d", $4/1024/1024}')"
  cpus="$(nproc)"
  log "resources: ${cpus} cpu, ${mem_mb} MiB RAM, ${disk_gb} GiB free on /var/lib"
  [[ "${cpus}" -ge 2 ]] || die "at least 2 CPUs are required (found ${cpus})"
  [[ "${mem_mb}" -ge 3500 ]] || die "at least 4 GiB RAM is required (found ${mem_mb} MiB); concurrent C++ judging needs headroom"
  [[ "${disk_gb}" -ge 15 ]] || die "at least 15 GiB free on /var/lib is required (found ${disk_gb} GiB)"

  [[ -f "${REPO_ROOT}/compose.yaml" ]] || die "compose.yaml not found; run this script from an OJPlatform checkout"
  have git || die "git is required to acquire the OnlineCodeEditor submodule"
  have curl || die "curl is required to install Docker when it is missing"
  log "preflight OK"
}

# ---------------------------------------------------------------------------
# 2. Docker
# ---------------------------------------------------------------------------

docker_ready() {
  have docker && docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

ensure_docker() {
  step "docker"
  if docker_ready; then
    log "Docker Engine $(docker version --format '{{.Server.Version}}' 2>/dev/null) with Compose $(docker compose version --short 2>/dev/null) is available"
    return 0
  fi
  if [[ ${CHECK_ONLY} -eq 1 ]]; then
    warn "Docker Engine or the Compose v2 plugin is missing (would be installed)"
    return 0
  fi
  [[ ${SKIP_DOCKER_INSTALL} -eq 0 ]] || die "Docker is missing and --skip-docker-install was given"

  log "installing Docker Engine from the official Docker repository"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  local codename
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-$(lsb_release -cs 2>/dev/null)}")"
  [[ -n "${codename}" ]] || die "cannot determine the Ubuntu codename for the Docker repository"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "${codename}" >/etc/apt/sources.list.d/docker.list
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  docker_ready || die "Docker installation did not produce a working Docker Engine + Compose v2"
  log "Docker installed: $(docker version --format '{{.Server.Version}}')"
}

# ---------------------------------------------------------------------------
# 3. Source: pinned OnlineCodeEditor submodule
# ---------------------------------------------------------------------------

ensure_submodule() {
  step "source"
  [[ -f "${REPO_ROOT}/.gitmodules" ]] || die ".gitmodules is missing; this is not a complete OJPlatform checkout"
  local expected actual
  expected="$(git -C "${REPO_ROOT}" ls-tree HEAD -- "${SUBMODULE_PATH}" | awk '{print $3}')"
  [[ -n "${expected}" ]] || die "no gitlink recorded for ${SUBMODULE_PATH}"
  if [[ ${CHECK_ONLY} -eq 1 ]]; then
    log "pinned ${SUBMODULE_PATH} = ${expected}"
    return 0
  fi
  if [[ ! -e "${REPO_ROOT}/${SUBMODULE_PATH}/plugin.manifest.json" ]]; then
    log "initialising ${SUBMODULE_PATH} at the pinned commit"
    git -C "${REPO_ROOT}" submodule sync --recursive >/dev/null
    git -C "${REPO_ROOT}" submodule update --init --recursive ||
      die "could not acquire the OnlineCodeEditor submodule; check network access to the plugin remote"
  fi
  actual="$(git -C "${REPO_ROOT}/${SUBMODULE_PATH}" rev-parse HEAD)"
  [[ "${actual}" == "${expected}" ]] ||
    die "submodule HEAD ${actual} does not match the pinned gitlink ${expected}; refusing to build a drifted plugin"
  log "OnlineCodeEditor pinned at ${actual}"
}

# ---------------------------------------------------------------------------
# 4. Environment
# ---------------------------------------------------------------------------

random_secret() {
  if have openssl; then
    openssl rand -base64 48 | tr -d '\n=+/'
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n=+/'
  fi
}

ensure_environment() {
  step "environment"
  if [[ -f "${ENV_FILE}" ]]; then
    log "reusing existing ${ENV_FILE}"
  else
    [[ -f "${ENV_TEMPLATE}" ]] || die "environment template ${ENV_TEMPLATE} is missing"
    [[ ${CHECK_ONLY} -eq 0 ]] || {
      warn "no ${ENV_FILE} yet (would be generated with strong random secrets)"
      return 0
    }
    log "generating ${ENV_FILE} with cryptographically random secrets"
    install -m 0600 /dev/null "${ENV_FILE}"
    cp "${ENV_TEMPLATE}" "${ENV_FILE}"
    local value
    while grep -q '<set-strong-random-value>' "${ENV_FILE}"; do
      value="$(random_secret)"
      awk -v v="${value}" 'BEGIN{done=0} { if (!done && index($0,"<set-strong-random-value>")) { sub(/<set-strong-random-value>/, v); done=1 } print }' \
        "${ENV_FILE}" >"${ENV_FILE}.tmp"
      mv "${ENV_FILE}.tmp" "${ENV_FILE}"
    done
    chmod 0600 "${ENV_FILE}"
    log "wrote ${ENV_FILE} (0600); secrets are generated, never printed"
  fi
  chmod 0600 "${ENV_FILE}" 2>/dev/null || true

  # Fail closed on a placeholder or missing value instead of letting Compose do it
  # with a confusing message.
  local missing=0 name value
  while IFS= read -r name; do
    value="$(sed -n "s/^${name}=//p" "${ENV_FILE}" | tail -n 1)"
    if [[ -z "${value}" || "${value}" == *'<set-strong-random-value>'* ]]; then
      warn "${name} is unset in ${ENV_FILE}"
      missing=$((missing + 1))
    fi
  done < <(grep -oE '\$\{[A-Z0-9_]+:\?' "${REPO_ROOT}/compose.prod.yaml" | sed 's/[{}$:?]//g' | sort -u)
  [[ ${missing} -eq 0 ]] || die "${missing} required production value(s) are missing in ${ENV_FILE}"
  log "all production-required values are present"
}

env_value() {
  local name="$1" fallback="$2" value
  value="$(sed -n "s/^${name}=//p" "${ENV_FILE}" | tail -n 1)"
  printf '%s' "${value:-${fallback}}"
}

# ---------------------------------------------------------------------------
# 5. Ports
# ---------------------------------------------------------------------------

check_ports() {
  step "ports"
  have ss || {
    warn "ss is unavailable; skipping the port conflict check"
    return 0
  }
  local requested=(
    "$(env_value OJPLATFORM_WEB_PORT 8080)"
    "$(env_value OJPLATFORM_API_INTERNAL_PORT 3010)"
    "$(env_value OJPLATFORM_JUDGE_SERVICE_PORT 3100)"
    "$(env_value OJPLATFORM_REDIS_WORKER_PORT 6379)"
  )
  local conflicts=0 port
  for port in "${requested[@]}"; do
    if ss -lntH "sport = :${port}" 2>/dev/null | grep -q .; then
      if docker compose "${COMPOSE_FILES[@]}" ps --format '{{.Service}}' 2>/dev/null | grep -q .
      then
        log "port ${port} is held by this OJPlatform deployment (reconciling)"
      else
        warn "port ${port} is already in use by another process"
        conflicts=$((conflicts + 1))
      fi
    fi
  done
  [[ ${conflicts} -eq 0 ]] ||
    die "${conflicts} required port(s) are occupied by unrelated processes; stop them or change OJPLATFORM_*_PORT in ${ENV_FILE}"
  log "required ports are free"
}

# ---------------------------------------------------------------------------
# 6. Control plane
# ---------------------------------------------------------------------------

start_control_plane() {
  step "control plane"
  if [[ ${CHECK_ONLY} -eq 1 ]]; then
    warn "would run: docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d$([[ ${NO_BUILD} -eq 0 ]] && echo ' --build')"
    return 0
  fi
  local args=(up -d)
  [[ ${NO_BUILD} -eq 0 ]] && args+=(--build)
  log "docker compose ${COMPOSE_FILES[*]} --profile judge ${args[*]}"
  ( cd "${REPO_ROOT}" && timeout "${BUILD_TIMEOUT_SECONDS}" \
    docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" "${JUDGE_PROFILE[@]}" "${args[@]}" ) ||
    die "docker compose startup failed; inspect: docker compose -f compose.yaml -f compose.prod.yaml --profile judge logs --tail 50"
}

# ---------------------------------------------------------------------------
# 7. Health
# ---------------------------------------------------------------------------

wait_for_health() {
  step "health"
  if [[ ${CHECK_ONLY} -eq 1 ]]; then
    warn "would wait for every long-lived service to become healthy"
    return 0
  fi
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  local services=(postgres redis minio api web judge-service)
  local pending=() svc_status
  while (( SECONDS < deadline )); do
    pending=()
    for service in "${services[@]}"; do
      svc_status="$(docker compose "${COMPOSE_FILES[@]}" ps "${service}" --format '{{.Status}}' 2>/dev/null | head -n 1)"
      if [[ "${svc_status}" != *"healthy"* ]]; then
        pending+=("${service}(${svc_status:-missing})")
      fi
    done
    [[ ${#pending[@]} -eq 0 ]] && break
    sleep 5
  done
  if [[ ${#pending[@]} -ne 0 ]]; then
    warn "unhealthy after ${HEALTH_TIMEOUT}s: ${pending[*]}"
    docker compose "${COMPOSE_FILES[@]}" ps --format 'table {{.Service}}\t{{.Status}}' >&2 || true
    die "deployment did not become healthy; inspect logs with: docker compose -f compose.yaml -f compose.prod.yaml --profile judge logs --tail 100 <service>"
  fi
  log "all long-lived services are healthy"

  # Application-level readiness, not just container health.
  local web_port api_port judge_port web_code ready_code judge_code
  web_port="$(env_value OJPLATFORM_WEB_PORT 8080)"
  api_port="$(env_value OJPLATFORM_API_INTERNAL_PORT 3010)"
  judge_port="$(env_value OJPLATFORM_JUDGE_SERVICE_PORT 3100)"
  web_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${web_port}/" || true)"
  ready_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${api_port}/ready" || true)"
  judge_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${judge_port}/health" || true)"
  log "endpoints: web=${web_code} api_ready=${ready_code} judge=${judge_code}"
  [[ "${web_code}" == "200" ]] || die "Web ingress is not serving (HTTP ${web_code}) on port ${web_port}"
  [[ "${ready_code}" == "200" ]] || die "API readiness failed (HTTP ${ready_code}); inspect: docker compose logs api"
  [[ "${judge_code}" == "200" ]] || die "Judge Service health failed (HTTP ${judge_code}); inspect: docker compose logs judge-service"

  # The OnlineCodeEditor must be present in the served bundle, not just built.
  local bundle_has_editor
  bundle_has_editor="$( ( cd "${REPO_ROOT}" && docker compose "${COMPOSE_FILES[@]}" exec -T web sh -c 'grep -l -i codemirror /usr/share/nginx/html/assets/*.js >/dev/null 2>&1 && echo yes' ) || true)"
  [[ "${bundle_has_editor}" == "yes" ]] ||
    die "the served Web bundle does not contain the OnlineCodeEditor"
  log "OnlineCodeEditor bundle is served"
}

# ---------------------------------------------------------------------------
# 8. Execution cell
# ---------------------------------------------------------------------------

install_execution_cell() {
  step "execution cell"
  if [[ ${SKIP_JUDGE_HOST} -eq 1 ]]; then
    log "skipped (--skip-judge-host): this host has no local judging execution cell"
    return 0
  fi
  if [[ ${CHECK_ONLY} -eq 1 ]]; then
    warn "would run: ./deploy/judge-host/install.sh --env-file ${ENV_FILE}"
    return 0
  fi
  "${SCRIPT_PATH}/judge-host/install.sh" --env-file "${ENV_FILE}" ||
    die "execution-cell provisioning failed; see the [install] output above"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

summary() {
  step "summary"
  if [[ ${CHECK_ONLY} -eq 1 ]]; then
    log "preflight completed; nothing was changed"
    return 0
  fi
  local web_port api_port judge_port commit web_url
  web_port="$(env_value OJPLATFORM_WEB_PORT 8080)"
  api_port="$(env_value OJPLATFORM_API_INTERNAL_PORT 3010)"
  judge_port="$(env_value OJPLATFORM_JUDGE_SERVICE_PORT 3100)"
  commit="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  web_url="http://$(hostname -I 2>/dev/null | awk '{print $1}'):${web_port}"
  [[ "${web_url}" == "http://:"* ]] && web_url="http://127.0.0.1:${web_port}"

  cat >&2 <<EOF

OJPlatform production deployment completed.

Repository:
  ${REPO_ROOT} (${commit})

Web:
  ${web_url}

API:
  healthy (127.0.0.1:${api_port})

Database:
  healthy (postgres, private)

Judge:
  healthy (127.0.0.1:${judge_port})

OnlineCodeEditor:
  healthy (pinned submodule, bundled in the Web image)

Diagnostics:
  sudo ./deploy/doctor.sh
EOF
}

main() {
  log "OJPlatform one-command production deployment"
  log "repository: ${REPO_ROOT}"
  log "env file:   ${ENV_FILE}"
  [[ ${EUID} -eq 0 ]] || die "must run as root (sudo ./deploy/install.sh)"

  preflight
  ensure_docker
  ensure_submodule
  ensure_environment
  check_ports
  start_control_plane
  wait_for_health
  install_execution_cell
  summary
}

main "$@"
