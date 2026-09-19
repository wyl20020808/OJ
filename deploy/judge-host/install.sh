#!/usr/bin/env bash
#
# OJPlatform host-native execution cell provisioning.
#
# This is the only custom deployment script in OJPlatform. Docker Compose owns
# every container (Web, Nginx, API, PostgreSQL, Redis, MinIO, Judge Service and
# the one-shot bootstrap/migration jobs). This script owns only what Compose
# cannot reasonably own on a Linux host:
#
#   * prerequisite checks (systemd, cgroup v2, runc, seccomp, user namespaces)
#   * the dedicated non-root service identities
#   * the narrow AppArmor grant for unprivileged user namespaces
#   * the trusted host directories and their ownership/modes
#   * building and installing the host-native binaries
#   * the immutable compiler rootfs
#   * the systemd units and their protected environment files
#   * post-install security gates
#
# It is idempotent: re-running it reconciles state and never resets secrets,
# removes user data, or prunes unrelated Docker resources.
#
# Usage:
#   sudo ./deploy/judge-host/install.sh [options]
#
# Options:
#   --env-file PATH          Production env file (default: <repo>/.env)
#   --skip-build             Reuse already installed binaries
#   --skip-rootfs            Do not build the compiler rootfs
#   --rebuild-rootfs         Rebuild the compiler rootfs even if present
#   --allow-rootfs-identity-drift
#                            Accept a compiler rootfs identity other than the
#                            reviewed canonical value after manual review
#   --no-start               Install and enable without starting services
#   --check                  Run prerequisite and security gates only
#   -h, --help               Show this help
#
set -euo pipefail
umask 0027

SCRIPT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_PATH
REPO_ROOT="$(cd -- "${SCRIPT_PATH}/../.." && pwd)"
readonly REPO_ROOT
readonly UNIT_SRC="${SCRIPT_PATH}/systemd"
readonly APPARMOR_SRC="${SCRIPT_PATH}/apparmor/ojplatform-runc"

readonly OPT_ROOT="/opt/ojplatform"
readonly BIN_DIR="${OPT_ROOT}/bin"
readonly ROOTFS_DIR="${OPT_ROOT}/compiler-rootfs"
readonly HOST_AGENT_DIR="${OPT_ROOT}/host-agent"
readonly SANDBOX_PARENT="/var/lib/ojplatform"
readonly SANDBOX_ROOT="${SANDBOX_PARENT}/sandbox"
readonly CONF_DIR="/etc/ojplatform"
readonly HOST_ENV="${CONF_DIR}/judge-host.env"
readonly SUPERVISOR_ENV="${CONF_DIR}/supervisor.env"

readonly SANDBOX_USER="oj-sandbox"
readonly WORKER_USER="oj-worker"
readonly HOST_AGENT_USER="oj-host-agent"

readonly SUPERVISOR_PORT="19092"
readonly WORKER_HEALTH_ADDR="127.0.0.1:19093"
readonly HOST_AGENT_PORT="13180"
readonly HOST_AGENT_STATE="${OPT_ROOT}/host-agent-state.json"

readonly CANONICAL_ROOTFS_IDENTITY="191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2"
readonly HOST_AGENT_ESBUILD_VERSION="0.28.2"

ENV_FILE="${REPO_ROOT}/.env"
SKIP_BUILD=0
SKIP_ROOTFS=0
REBUILD_ROOTFS=0
ALLOW_ROOTFS_DRIFT=0
NO_START=0
CHECK_ONLY=0

log()  { printf '%s [install] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
warn() { printf '%s [install] WARNING: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
die()  { printf '%s [install] ERROR: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
deploy/judge-host/install.sh - OJPlatform host-native execution cell provisioning

Usage:
  sudo ./deploy/judge-host/install.sh [options]

Options:
  --env-file PATH          Production env file (default: <repo>/.env)
  --skip-build             Reuse already installed host binaries
  --skip-rootfs            Validate the existing compiler rootfs without building
  --rebuild-rootfs         Rebuild the compiler rootfs even if present
  --allow-rootfs-identity-drift
                           Accept a compiler rootfs identity other than the
                           reviewed canonical value after manual review
  --no-start               Install and enable without starting services
  --check                  Run prerequisite gates only; make no changes
  -h, --help               Show this help

Docker Compose owns every container. This script owns only host-native
provisioning and is safe to re-run.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-rootfs) SKIP_ROOTFS=1; shift ;;
    --rebuild-rootfs) REBUILD_ROOTFS=1; shift ;;
    --allow-rootfs-identity-drift) ALLOW_ROOTFS_DRIFT=1; shift ;;
    --no-start) NO_START=1; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ ${EUID} -eq 0 ]] || die "must run as root (sudo)"

# ---------------------------------------------------------------------------
# Environment file reading
# ---------------------------------------------------------------------------

# Literal KEY=value reader. Values are never evaluated, and values that would
# silently change meaning in a host service are rejected.
env_value() {
  local key="$1" line
  line="$(sed -n "s/^[[:space:]]*${key}=//p" "${ENV_FILE}" | tail -n 1)"
  line="${line%$'\r'}"
  [[ "${line}" == \"*\" ]] && line="${line:1:${#line}-2}"
  printf '%s' "${line}"
}

require_env_value() {
  local key="$1" value
  value="$(env_value "${key}")"
  [[ -n "${value}" ]] || die "${key} is required in ${ENV_FILE}"
  case "${value}" in
    *'${'*) die "${key} must be a literal value in ${ENV_FILE}, not an interpolation" ;;
    *'<'*'>'*) die "${key} still contains a placeholder in ${ENV_FILE}" ;;
  esac
  printf '%s' "${value}"
}

optional_env_value() {
  local key="$1" fallback="$2" value
  value="$(env_value "${key}")"
  printf '%s' "${value:-${fallback}}"
}

# ---------------------------------------------------------------------------
# Prerequisite gates
# ---------------------------------------------------------------------------

have() { command -v "$1" >/dev/null 2>&1; }

check_prerequisites() {
  log "checking prerequisites"

  [[ "$(uname -s)" == "Linux" ]] || die "Linux is required (found $(uname -s))"
  [[ "$(uname -m)" == "x86_64" ]] || die "amd64/x86_64 is the qualified architecture (found $(uname -m))"

  have systemctl || die "systemd is required"
  [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" == "systemd" ]] || die "PID 1 is not systemd; use a systemd host"

  [[ -f /sys/fs/cgroup/cgroup.controllers ]] || die "cgroup v2 (unified hierarchy) is required"
  local controllers
  controllers="$(cat /sys/fs/cgroup/cgroup.controllers)"
  for controller in cpu memory pids; do
    [[ " ${controllers} " == *" ${controller} "* ]] || die "cgroup v2 controller '${controller}' is unavailable"
  done

  have runc || die "runc is required (install the distribution runc package)"
  have curl || die "curl is required"

  # Namespaces and seccomp are kernel capabilities; report them explicitly so a
  # hardened kernel fails here instead of during a real submission. The status
  # field is `Seccomp:` (capital S), so the match must be case-insensitive.
  [[ -e /proc/self/ns/user ]] || die "user namespaces are unavailable in this kernel"
  grep -qi '^Seccomp:' /proc/self/status || die "seccomp is unavailable in this kernel"
  if [[ -r /proc/sys/kernel/unprivileged_userns_clone ]] &&
    [[ "$(cat /proc/sys/kernel/unprivileged_userns_clone)" != "1" ]]; then
    warn "unprivileged_userns_clone is disabled; rootless runc may not work"
  fi

  if [[ ${SKIP_BUILD} -eq 0 ]]; then
    have go || die "Go toolchain is required to build the Worker and Supervisor"
    have node || die "Node.js is required to bundle the Host Agent"
    have pnpm || die "pnpm is required to install Host Agent runtime dependencies"
    have docker || die "Docker is required to build the compiler rootfs and to run Compose"
  fi
  if [[ ${SKIP_ROOTFS} -eq 0 ]]; then
    have docker || die "Docker is required to build the compiler rootfs"
  fi

  # Filesystem semantics: the rootfs install and atomic rename contract need a
  # local Unix filesystem, not a network or Windows-mounted path. `statfs`
  # reports the classic `ext2/ext3` magic for ext2, ext3 and ext4 alike.
  local fstype
  fstype="$(stat -fc %T /opt 2>/dev/null || echo unknown)"
  case "${fstype}" in
    ext2/ext3|ext4|ext3|ext2|xfs|btrfs|overlayfs) : ;;
    *) warn "unexpected filesystem type '${fstype}' for /opt; ext4/xfs is the qualified choice" ;;
  esac

  log "prerequisites OK"
}

# ---------------------------------------------------------------------------
# Service identities
# ---------------------------------------------------------------------------

ensure_user() {
  local user="$1" comment="$2"
  if id -u "${user}" >/dev/null 2>&1; then
    log "user ${user} already exists"
  else
    useradd --system --create-home --home-dir "/home/${user}" \
      --shell /usr/sbin/nologin --comment "${comment}" "${user}"
    log "created user ${user}"
  fi
}

# The execution identities must never gain privileged group membership. This is
# re-asserted on every run so a manual mistake is corrected, and never
# introduced here in the first place.
enforce_no_privileged_groups() {
  local user="$1" group
  for group in docker sudo adm disk root; do
    if getent group "${group}" >/dev/null 2>&1 &&
      id -nG "${user}" | tr ' ' '\n' | grep -qx "${group}"; then
      gpasswd -d "${user}" "${group}" >/dev/null 2>&1 || true
      warn "removed ${user} from privileged group ${group}"
    fi
  done
}

provision_users() {
  log "provisioning service identities"
  ensure_user "${SANDBOX_USER}" "OJPlatform sandbox Supervisor"
  ensure_user "${WORKER_USER}" "OJPlatform Judge Worker"
  ensure_user "${HOST_AGENT_USER}" "OJPlatform Judge Host Agent"
  enforce_no_privileged_groups "${SANDBOX_USER}"
  enforce_no_privileged_groups "${WORKER_USER}"
  enforce_no_privileged_groups "${HOST_AGENT_USER}"

  # Linger plus a running user manager give the Supervisor delegated cgroup v2
  # controllers, which a system service would not have.
  loginctl enable-linger "${SANDBOX_USER}" >/dev/null
  local sandbox_uid
  sandbox_uid="$(id -u "${SANDBOX_USER}")"
  for _ in $(seq 1 30); do
    [[ -S "/run/user/${sandbox_uid}/bus" ]] && break
    sleep 0.5
  done
  [[ -S "/run/user/${sandbox_uid}/bus" ]] ||
    die "oj-sandbox user manager did not start; check 'loginctl enable-linger' and systemd-logind"
}

# ---------------------------------------------------------------------------
# Directories and ownership
# ---------------------------------------------------------------------------

ensure_dir() {
  local path="$1" owner="$2" mode="$3"
  if [[ -d "${path}" ]]; then
    chown "${owner}" "${path}"
    chmod "${mode}" "${path}"
  else
    install -d -o "${owner%%:*}" -g "${owner##*:}" -m "${mode}" "${path}"
  fi
}

provision_directories() {
  log "provisioning host directories"
  install -d -m 0755 "${OPT_ROOT}"
  ensure_dir "${BIN_DIR}" "root:root" 0755
  ensure_dir "${ROOTFS_DIR}" "root:root" 0755
  ensure_dir "${HOST_AGENT_DIR}" "root:root" 0755
  ensure_dir "${CONF_DIR}" "root:${SANDBOX_USER}" 0750

  # Sandbox parent. The Supervisor (as oj-sandbox) creates the sandbox root,
  # the artifact staging directory and the execution-record directory inside it,
  # so this parent must be writable by that identity alone.
  ensure_dir "${SANDBOX_PARENT}" "${SANDBOX_USER}:${SANDBOX_USER}" 0700
}

# ---------------------------------------------------------------------------
# Unprivileged user namespace grant
# ---------------------------------------------------------------------------

provision_apparmor() {
  local restriction="0"
  if [[ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]]; then
    restriction="$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)"
  fi
  if [[ "${restriction}" != "1" ]]; then
    log "unprivileged user namespaces are unrestricted; no AppArmor grant needed"
    return 0
  fi
  have apparmor_parser || die "AppArmor restricts user namespaces but apparmor_parser is missing"

  local runc_bin profile="/etc/apparmor.d/ojplatform-runc"
  runc_bin="$(command -v runc)"
  sed "s|@RUNC_BIN@|${runc_bin}|g" "${APPARMOR_SRC}" >"${profile}"
  chmod 0644 "${profile}"
  apparmor_parser -r -W "${profile}" || die "failed to load the runc user-namespace profile"
  log "loaded narrow AppArmor user-namespace grant for ${runc_bin}"
}

# ---------------------------------------------------------------------------
# Host binaries
# ---------------------------------------------------------------------------

build_binaries() {
  log "building host-native binaries"
  # GIT_OPTIONAL_LOCKS=0 stops git from refreshing (and therefore rewriting) the
  # repository index. Without it a root install would leave a root-owned
  # .git/index in an operator-owned checkout.
  local version
  version="$(GIT_OPTIONAL_LOCKS=0 git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

  (
    cd "${REPO_ROOT}/apps/sandbox-supervisor"
    go build -trimpath -ldflags "-s -w" -o "${BIN_DIR}/ojplatform-supervisor" ./cmd/supervisor
    go build -trimpath -ldflags "-s -w" -o "${BIN_DIR}/trusted-probe" ./cmd/trusted-probe
  )
  (
    cd "${REPO_ROOT}/apps/judge-worker"
    go build -trimpath -ldflags "-s -w" -o "${BIN_DIR}/ojplatform-worker" ./cmd/judge-worker
  )

  # Host Agent: a single ESM bundle. A fresh clone has no node_modules, so the
  # bundle is produced with a pinned esbuild fetched on demand and the one
  # runtime dependency is deployed next to the bundle instead of into the
  # repository. That keeps the operator's checkout untouched and needs no full
  # workspace install on a production host.
  install -d -m 0755 "${HOST_AGENT_DIR}/dist"
  printf '{"name":"ojplatform-host-agent-runtime","private":true,"version":"1.0.0","dependencies":{"fastify":"5.12.1"}}\n' \
    >"${HOST_AGENT_DIR}/package.json"
  chown root:root "${HOST_AGENT_DIR}/package.json" "${HOST_AGENT_DIR}/dist"
  chmod 0644 "${HOST_AGENT_DIR}/package.json"
  pnpm --dir "${HOST_AGENT_DIR}" install --prod --silent
  (
    cd "${REPO_ROOT}/apps/judge-host-agent"
    pnpm --silent dlx esbuild@${HOST_AGENT_ESBUILD_VERSION} src/server.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --external:fastify \
      --banner:js='import { createRequire as __ojplatformCreateRequire } from "module"; const require = __ojplatformCreateRequire(import.meta.url);' \
      --outfile="${HOST_AGENT_DIR}/dist/server.mjs"
  )
  chown root:root "${HOST_AGENT_DIR}/dist/server.mjs"
  chmod 0644 "${HOST_AGENT_DIR}/dist/server.mjs"

  printf 'BUILD_VERSION=%s\n' "${version}" >"${BIN_DIR}/build-version.txt"
  chown -R root:root "${BIN_DIR}" "${HOST_AGENT_DIR}"
  chmod 0644 "${BIN_DIR}/build-version.txt"
  log "installed host binaries (version ${version})"
}

# ---------------------------------------------------------------------------
# Compiler rootfs
# ---------------------------------------------------------------------------

provision_rootfs() {
  local identity_file="${ROOTFS_DIR}/cpp20-gcc-13-v1.identity"
  if [[ -f "${identity_file}" ]] && [[ ${REBUILD_ROOTFS} -eq 0 ]]; then
    log "compiler rootfs already present; reuse it (use --rebuild-rootfs to rebuild)"
  elif [[ ${SKIP_ROOTFS} -eq 1 ]]; then
    die "--skip-rootfs was given but ${identity_file} is missing"
  else
    log "building compiler rootfs (digest-pinned, snapshot-pinned)"
    # Invoked through bash so a checkout that lost the executable bit (for
    # example a filemode-less copy) still works.
    bash "${REPO_ROOT}/scripts/phase2c1-prepare-compiler-rootfs.sh" >&2
  fi

  [[ -f "${identity_file}" ]] || die "compiler rootfs identity sidecar is missing"
  local identity
  identity="$(tr -d '[:space:]' <"${identity_file}")"

  # Integrity: root-owned, no writable non-symlink path.
  [[ "$(stat -c '%U:%G' "${ROOTFS_DIR}/cpp20-gcc-13-v1")" == "root:root" ]] ||
    die "compiler rootfs must be root:root"
  local writable
  writable="$(find "${ROOTFS_DIR}/cpp20-gcc-13-v1" -xdev ! -type l -perm /222 -print -quit)"
  [[ -z "${writable}" ]] || die "compiler rootfs contains a writable path: ${writable}"

  if [[ "${identity}" != "${CANONICAL_ROOTFS_IDENTITY}" ]] && [[ ${ALLOW_ROOTFS_DRIFT} -eq 0 ]]; then
    die "compiler rootfs identity ${identity} differs from the reviewed canonical ${CANONICAL_ROOTFS_IDENTITY}; compare the content manifest, then re-run with --allow-rootfs-identity-drift to accept it"
  fi
  if [[ "${identity}" != "${CANONICAL_ROOTFS_IDENTITY}" ]]; then
    warn "accepting reviewed compiler rootfs identity drift: ${identity}"
  fi
  ROOTFS_IDENTITY="${identity}"
}

# ---------------------------------------------------------------------------
# Environment files
# ---------------------------------------------------------------------------

write_file_if_absent() {
  local path="$1" mode="$2" owner="$3"
  if [[ -e "${path}" ]]; then
    log "${path} exists; keeping existing values"
    return 1
  fi
  install -m "${mode}" -o "${owner%%:*}" -g "${owner##*:}" /dev/null "${path}"
  return 0
}

provision_env_files() {
  [[ -f "${ENV_FILE}" ]] ||
    die "production env file ${ENV_FILE} not found; copy .env.production.example and fill it in"

  log "deriving host service configuration from ${ENV_FILE}"

  local worker_user worker_password redis_port judge_port api_port node_id max_concurrency
  worker_user="$(require_env_value REDIS_WORKER_USERNAME)"
  worker_password="$(require_env_value REDIS_WORKER_PASSWORD)"
  redis_port="$(optional_env_value OJPLATFORM_REDIS_WORKER_PORT 6379)"
  judge_port="$(optional_env_value OJPLATFORM_JUDGE_SERVICE_PORT 3100)"
  api_port="$(optional_env_value OJPLATFORM_API_INTERNAL_PORT 3010)"
  node_id="$(optional_env_value OJ_JUDGE_NODE_ID "$(hostname -s)")"
  max_concurrency="$(optional_env_value MAX_CONCURRENCY 1)"

  local node_token artifact_token supervisor_token host_agent_token
  node_token="$(require_env_value JUDGE_NODE_TOKEN)"
  artifact_token="$(require_env_value JUDGE_ARTIFACT_READ_TOKEN)"
  supervisor_token="$(require_env_value OJPLATFORM_SUPERVISOR_ARTIFACT_TOKEN)"
  host_agent_token="$(require_env_value JUDGE_HOST_AGENT_TOKEN)"

  local build_version="unknown"
  [[ -f "${BIN_DIR}/build-version.txt" ]] &&
    build_version="$(sed -n 's/^BUILD_VERSION=//p' "${BIN_DIR}/build-version.txt")"

  if write_file_if_absent "${HOST_ENV}" 0600 "root:root"; then
    cat >"${HOST_ENV}" <<EOF
# Managed by deploy/judge-host/install.sh. Do not commit.
# Values are derived from the deployment env file; secrets are not duplicated
# beyond what the host-native services actually require.
REAL_SUBMISSION_EXECUTION=true
REDIS_URL=redis://${worker_user}:${worker_password}@127.0.0.1:${redis_port}/0
QUEUE_PREFIX=oj:judge
OJ_JUDGE_NODE_ID=${node_id}
WORKER_ID=${node_id}
MAX_CONCURRENCY=${max_concurrency}
BUILD_VERSION=${build_version}
HEALTH_ADDR=${WORKER_HEALTH_ADDR}
JUDGE_SERVICE_URL=http://127.0.0.1:${judge_port}
JUDGE_NODE_TOKEN=${node_token}
OJPLATFORM_SANDBOX_SUPERVISOR_URL=http://127.0.0.1:${SUPERVISOR_PORT}
JUDGE_ARTIFACT_DATA_URL=http://127.0.0.1:${api_port}
JUDGE_ARTIFACT_READ_TOKEN=${artifact_token}
OJPLATFORM_SUPERVISOR_ARTIFACT_TOKEN=${supervisor_token}
JUDGE_HOST_AGENT_TOKEN=${host_agent_token}
JUDGE_HOST_AGENT_HOST=127.0.0.1
JUDGE_HOST_AGENT_PORT=${HOST_AGENT_PORT}
JUDGE_HOST_AGENT_STATE_PATH=${HOST_AGENT_STATE}
EOF
    log "wrote ${HOST_ENV}"
  fi

  # The Supervisor runs as an unprivileged user unit, so it needs a separate
  # file it can read. It receives only its own artifact token and local paths.
  if write_file_if_absent "${SUPERVISOR_ENV}" 0640 "root:${SANDBOX_USER}"; then
    cat >"${SUPERVISOR_ENV}" <<EOF
# Managed by deploy/judge-host/install.sh. Do not commit.
OJPLATFORM_SANDBOX_ROOT=${SANDBOX_ROOT}
OJPLATFORM_RUNC_BIN=$(command -v runc)
OJPLATFORM_SANDBOX_PROBE_PATH=${BIN_DIR}/trusted-probe
OJPLATFORM_EXECUTION_RECORD_ROOT=${SANDBOX_PARENT}/sandbox-execution-records
OJPLATFORM_REAL_EXECUTION_ENABLED=true
OJPLATFORM_CPP20_ROOTFS=${ROOTFS_DIR}/cpp20-gcc-13-v1
OJPLATFORM_CPP20_ROOTFS_IDENTITY=${ROOTFS_IDENTITY}
OJPLATFORM_SUPERVISOR_ARTIFACT_TOKEN=${supervisor_token}
EOF
    log "wrote ${SUPERVISOR_ENV}"
  fi

  chown "root:${SANDBOX_USER}" "${SUPERVISOR_ENV}"
  chmod 0640 "${SUPERVISOR_ENV}"
}

# ---------------------------------------------------------------------------
# systemd units
# ---------------------------------------------------------------------------

install_units() {
  log "installing systemd units"
  local node_bin
  node_bin="$(command -v node)"

  sed "s|@NODE_BIN@|${node_bin}|g" "${UNIT_SRC}/ojplatform-host-agent.service" \
    >/etc/systemd/system/ojplatform-host-agent.service
  install -m 0644 "${UNIT_SRC}/ojplatform-worker.service" \
    /etc/systemd/system/ojplatform-worker.service
  chown root:root /etc/systemd/system/ojplatform-host-agent.service \
    /etc/systemd/system/ojplatform-worker.service
  chmod 0644 /etc/systemd/system/ojplatform-host-agent.service \
    /etc/systemd/system/ojplatform-worker.service

  local sandbox_uid unit_dir
  sandbox_uid="$(id -u "${SANDBOX_USER}")"
  unit_dir="/home/${SANDBOX_USER}/.config/systemd/user"
  install -d -o "${SANDBOX_USER}" -g "${SANDBOX_USER}" -m 0700 "${unit_dir}"
  install -o "${SANDBOX_USER}" -g "${SANDBOX_USER}" -m 0644 \
    "${UNIT_SRC}/ojplatform-supervisor.service" \
    "${unit_dir}/ojplatform-supervisor.service"

  install -m 0644 "${REPO_ROOT}/Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md" \
    "${OPT_ROOT}/README.judge-host" 2>/dev/null ||
    log "fresh-machine guide not installed as documentation (not fatal)"

  systemctl daemon-reload
}

start_units() {
  log "enabling execution-cell units"

  systemctl enable ojplatform-worker.service >/dev/null
  systemctl enable ojplatform-host-agent.service >/dev/null

  local sandbox_uid
  sandbox_uid="$(id -u "${SANDBOX_USER}")"
  runuser -u "${SANDBOX_USER}" -- env \
    XDG_RUNTIME_DIR="/run/user/${sandbox_uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${sandbox_uid}/bus" \
    systemctl --user daemon-reload
  runuser -u "${SANDBOX_USER}" -- env \
    XDG_RUNTIME_DIR="/run/user/${sandbox_uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${sandbox_uid}/bus" \
    systemctl --user enable ojplatform-supervisor.service >/dev/null

  if [[ ${NO_START} -eq 1 ]]; then
    log "--no-start given; units are enabled but not started"
    return 0
  fi

  # Supervisor first: the Worker preflight fails closed until it answers. A
  # failed start is reported by the security gates below instead of aborting
  # here, so the operator sees every gate result in one run.
  runuser -u "${SANDBOX_USER}" -- env \
    XDG_RUNTIME_DIR="/run/user/${sandbox_uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${sandbox_uid}/bus" \
    systemctl --user restart ojplatform-supervisor.service ||
    warn "ojplatform-supervisor.service did not start; inspect: journalctl --user -u ojplatform-supervisor.service (as ${SANDBOX_USER})"
  systemctl restart ojplatform-host-agent.service ||
    warn "ojplatform-host-agent.service did not start; inspect: journalctl -u ojplatform-host-agent.service"
  systemctl restart ojplatform-worker.service ||
    warn "ojplatform-worker.service did not start; inspect: journalctl -u ojplatform-worker.service"
}

# ---------------------------------------------------------------------------
# Security gates
# ---------------------------------------------------------------------------

check_security_gates() {
  log "running security gates"
  local failures=0
  gate() {
    if "$@"; then
      log "gate OK: $1"
    else
      warn "gate FAILED: $1"
      failures=$((failures + 1))
    fi
  }

  gate_sandbox_groups() {
    local groups
    groups="$(id -nG "${SANDBOX_USER}")"
    for forbidden in docker sudo adm disk root; do
      [[ " ${groups} " == *" ${forbidden} "* ]] && return 1
    done
    return 0
  }

  gate_docker_socket() {
    runuser -u "${SANDBOX_USER}" -- test ! -r /var/run/docker.sock 2>/dev/null
  }

  gate_worker_no_docker() {
    local groups
    groups="$(id -nG "${WORKER_USER}")"
    [[ " ${groups} " != *" docker "* ]]
  }

  gate_rootfs_immutable() {
    [[ -z "$(find "${ROOTFS_DIR}/cpp20-gcc-13-v1" -xdev ! -type l -perm /222 -print -quit)" ]]
  }

  gate_rootfs_owner() {
    [[ "$(stat -c '%U:%G' "${ROOTFS_DIR}/cpp20-gcc-13-v1")" == "root:root" ]]
  }

  gate_binaries_trusted() {
    [[ "$(stat -c '%U:%G %a' "${BIN_DIR}/ojplatform-supervisor")" == "root:root 755" ]] &&
      [[ "$(stat -c '%U:%G %a' "${BIN_DIR}/trusted-probe")" == "root:root 755" ]] &&
      [[ "$(stat -c '%U:%G %a' "${BIN_DIR}/ojplatform-worker")" == "root:root 755" ]]
  }

  gate_units_not_root() {
    grep -q '^User=oj-worker$' /etc/systemd/system/ojplatform-worker.service &&
      grep -q '^User=oj-host-agent$' /etc/systemd/system/ojplatform-host-agent.service &&
      ! grep -q '^User=root$' /etc/systemd/system/ojplatform-worker.service /etc/systemd/system/ojplatform-host-agent.service
  }

  gate_secret_permissions() {
    [[ "$(stat -c '%a' "${HOST_ENV}")" == "600" ]] &&
      [[ "$(stat -c '%a' "${SUPERVISOR_ENV}")" == "640" ]]
  }

  # The Supervisor runs under an unprivileged user manager, so it must be able
  # to reach its own environment file. A non-traversable parent directory shows
  # up as "Failed to load environment files: No such file or directory".
  gate_sandbox_env_readable() {
    runuser -u "${SANDBOX_USER}" -- test -r "${SUPERVISOR_ENV}" &&
      runuser -u "${SANDBOX_USER}" -- test -x "${CONF_DIR}"
  }

  # Rootless runc needs the user manager's delegated controllers.
  gate_sandbox_cgroup_delegation() {
    local uid controllers
    uid="$(id -u "${SANDBOX_USER}")"
    controllers="$(cat "/sys/fs/cgroup/user.slice/user-${uid}.slice/user@${uid}.service/cgroup.controllers" 2>/dev/null || true)"
    [[ -n "${controllers}" ]] || return 0
    local controller
    for controller in cpu memory pids; do
      [[ " ${controllers} " == *" ${controller} "* ]] || return 1
    done
    return 0
  }

  gate_loopback_supervisor() {
    if [[ ${NO_START} -eq 1 || ${CHECK_ONLY} -eq 1 ]]; then return 0; fi
    local listeners
    listeners="$(ss -lntH 2>/dev/null | awk '{print $4}' || true)"
    [[ -z "${listeners}" ]] && return 0
    if grep -qE "(^|:)${SUPERVISOR_PORT}$" <<<"${listeners}" &&
      ! grep -qE "^127\.0\.0\.1:${SUPERVISOR_PORT}$" <<<"${listeners}"; then
      return 1
    fi
    return 0
  }

  gate_supervisor_identity() {
    if [[ ${NO_START} -eq 1 || ${CHECK_ONLY} -eq 1 ]]; then return 0; fi
    curl -fsS "http://127.0.0.1:${SUPERVISOR_PORT}/v1/health" >/dev/null 2>&1
  }

  gate gate_sandbox_groups
  gate gate_docker_socket
  gate gate_worker_no_docker
  gate gate_rootfs_owner
  gate gate_rootfs_immutable
  gate gate_binaries_trusted
  gate gate_units_not_root
  gate gate_secret_permissions
  gate gate_sandbox_env_readable
  gate gate_sandbox_cgroup_delegation
  gate gate_loopback_supervisor
  gate gate_supervisor_identity

  [[ ${failures} -eq 0 ]] || die "${failures} security gate(s) failed; refusing to report success"
  log "all security gates passed"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

ROOTFS_IDENTITY="${CANONICAL_ROOTFS_IDENTITY}"

main() {
  log "OJPlatform host execution cell provisioning"
  log "repository: ${REPO_ROOT}"
  log "env file:   ${ENV_FILE}"

  check_prerequisites
  if [[ ${CHECK_ONLY} -eq 1 ]]; then
    log "--check given; prerequisites passed, no changes made"
    exit 0
  fi

  provision_users
  provision_directories
  provision_apparmor
  if [[ ${SKIP_BUILD} -eq 0 ]]; then
    build_binaries
  else
    log "--skip-build given; reusing installed binaries"
    [[ -x "${BIN_DIR}/ojplatform-worker" ]] || die "--skip-build given but Worker binary is missing"
    [[ -x "${BIN_DIR}/ojplatform-supervisor" ]] || die "--skip-build given but Supervisor binary is missing"
    [[ -f "${HOST_AGENT_DIR}/dist/server.mjs" ]] || die "--skip-build given but Host Agent bundle is missing"
  fi
  provision_rootfs
  provision_env_files
  install_units
  start_units
  check_security_gates

  log "execution cell provisioning complete"
  cat >&2 <<'EOF'
[install] Next steps:
[install]   docker compose -f compose.yaml -f compose.prod.yaml --profile judge ps
[install]   systemctl status ojplatform-worker.service ojplatform-host-agent.service
[install]   systemctl --user status ojplatform-supervisor.service   # as oj-sandbox
[install]   journalctl -u ojplatform-worker.service -f
EOF
}

main "$@"
