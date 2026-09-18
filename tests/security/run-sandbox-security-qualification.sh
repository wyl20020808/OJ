#!/usr/bin/env bash
set -euo pipefail

if [[ "${OJ_RUN_SANDBOX_SECURITY_QUALIFICATION:-}" != "1" || "${OJ_ACK_BOUNDED_UNTRUSTED_FIXTURES:-}" != "1" ]]; then
  echo "Refusing sandbox security qualification: set OJ_RUN_SANDBOX_SECURITY_QUALIFICATION=1 and OJ_ACK_BOUNDED_UNTRUSTED_FIXTURES=1" >&2
  exit 64
fi
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Sandbox security qualification requires native Linux or WSL2 Linux context" >&2
  exit 65
fi
if [[ "$(id -u)" == "0" || "$(id -un)" != "oj-sandbox" ]]; then
  echo "Sandbox security qualification must run as dedicated non-root oj-sandbox" >&2
  exit 66
fi
if id -nG | tr ' ' '\n' | grep -qx docker; then
  echo "Sandbox account unexpectedly has Docker group" >&2
  exit 67
fi

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
module_root="$repository_root/apps/sandbox-supervisor"
fixture_root="$repository_root/tests/security/fixtures"
rootfs=/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1
identity_file="$rootfs.identity"
port=19625
run_id="phase6b5-$(date +%s)-$$"
qualification_root=$(mktemp -d "/tmp/ojplatform-${run_id}-XXXXXX")
sandbox_root="$qualification_root/sandbox"
record_root="$qualification_root/records"
set_record_root="$qualification_root/set-records"
host_canary="$qualification_root/host-only-canary"
sibling_canary="$qualification_root/sibling-workspace-canary"
supervisor_log="$qualification_root/supervisor.log"
scopes_before="$qualification_root/scopes-before"
supervisor_pid=""
sandbox_uid=$(id -u)
sandbox_gid=$(id -g)
: >"$scopes_before"

phase2b_scopes() {
  find "/sys/fs/cgroup/user.slice/user-${sandbox_uid}.slice/user@${sandbox_uid}.service" -type d -name 'phase2b-*.scope' -print 2>/dev/null | sort || true
}

cleanup() {
  local status=$?
  if [[ -n "$supervisor_pid" ]]; then
    kill "$supervisor_pid" 2>/dev/null || true
    wait "$supervisor_pid" 2>/dev/null || true
  fi
  local after
  after=$(mktemp)
  phase2b_scopes >"$after"
  if ! diff -u "$scopes_before" "$after" >/dev/null; then
    echo "Qualification left a cgroup scope" >&2
    status=1
  fi
  rm -f "$after"
  if ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; then
    echo "Qualification Supervisor listener remains" >&2
    status=1
  fi
  if grep -Fq "$qualification_root" /proc/self/mountinfo; then
    echo "Qualification mount remains" >&2
    status=1
  fi
  rm -rf "$qualification_root"
  exit "$status"
}
trap cleanup EXIT INT TERM

for required in /usr/bin/runc "$rootfs" "$identity_file" "$rootfs.compiler-version.txt"; do
  [[ -e "$required" ]] || { echo "Required sandbox prerequisite missing: $required" >&2; exit 68; }
done
[[ "$(stat -c %U:%G "$rootfs")" == "root:root" ]] || { echo "Compiler rootfs ownership drift" >&2; exit 69; }
[[ "$(stat -c %a "$rootfs")" == "555" ]] || { echo "Compiler rootfs mode drift" >&2; exit 69; }
if ss -ltn "sport = :$port" | grep -q LISTEN; then
  echo "Isolated qualification port already in use: $port" >&2
  exit 70
fi
if ss -ltn "sport = :19626" | grep -q LISTEN; then
  echo "Network canary port already in use: 19626" >&2
  exit 70
fi

mkdir -p "$qualification_root/bin" "$sandbox_root" "$record_root" "$set_record_root"
chmod 700 "$qualification_root" "$qualification_root/bin" "$record_root" "$set_record_root"
printf 'phase6b5-host-canary:%s\n' "$run_id" >"$host_canary"
printf 'phase6b5-sibling-canary:%s\n' "$run_id" >"$sibling_canary"
chmod 600 "$host_canary" "$sibling_canary"
phase2b_scopes >"$scopes_before"

cd "$module_root"
GOFLAGS=-buildvcs=false CGO_ENABLED=0 go build -o "$qualification_root/bin/trusted-probe" ./cmd/trusted-probe
GOFLAGS=-buildvcs=false CGO_ENABLED=0 go build -o "$qualification_root/bin/supervisor" ./cmd/supervisor
identity=$(cat "$identity_file")
fake_secret="phase6b5-fake-${RANDOM}-${RANDOM}-${RANDOM}"

OJ_PHASE6B5_FAKE_SECRET="$fake_secret" \
OJPLATFORM_SANDBOX_ROOT="$sandbox_root" \
OJPLATFORM_EXECUTION_RECORD_ROOT="$record_root" \
OJPLATFORM_EXECUTION_SET_RECORD_ROOT="$set_record_root" \
OJPLATFORM_SANDBOX_PROBE_PATH="$qualification_root/bin/trusted-probe" \
OJPLATFORM_RUNC_BIN=/usr/bin/runc \
OJPLATFORM_REAL_EXECUTION_ENABLED=true \
OJPLATFORM_CPP20_ROOTFS="$rootfs" \
OJPLATFORM_CPP20_ROOTFS_IDENTITY="$identity" \
OJPLATFORM_SANDBOX_QUALIFICATION_FAULTS=true \
"$qualification_root/bin/supervisor" --listen "127.0.0.1:$port" >"$supervisor_log" 2>&1 &
supervisor_pid=$!

ready=0
for _ in $(seq 1 300); do
  if curl -fsS "http://127.0.0.1:$port/v1/health" >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$supervisor_pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ $ready -ne 1 ]]; then
  echo "Isolated Supervisor failed readiness" >&2
  tail -n 20 "$supervisor_log" >&2 || true
  exit 71
fi

OJ_PHASE6B5_SUPERVISOR_URL="http://127.0.0.1:$port" \
OJ_PHASE6B5_FIXTURE_ROOT="$fixture_root" \
OJ_PHASE6B5_RUN_ID="$run_id" \
OJ_PHASE6B5_HOST_CANARY="$host_canary" \
OJ_PHASE6B5_SIBLING_CANARY="$sibling_canary" \
OJ_PHASE6B5_SUPERVISOR_UID="$sandbox_uid" \
OJ_PHASE6B5_SUPERVISOR_GID="$sandbox_gid" \
python3 "$repository_root/tests/security/sandbox_security_qualification.py"

[[ -z "$(find "$sandbox_root" -mindepth 1 -print -quit)" ]] || { echo "Sandbox workspace residue remains" >&2; exit 72; }
[[ -f "$host_canary" && -f "$sibling_canary" ]] || { echo "Qualification canary was modified or removed" >&2; exit 73; }
echo "PHASE6B5_QUALIFICATION_RESOURCES_CLEAN"
