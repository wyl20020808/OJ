#!/bin/sh
set -eu

: "${REDIS_CONTAINER:?REDIS_CONTAINER is required}"
: "${REDIS_ADMIN_USERNAME:?REDIS_ADMIN_USERNAME is required}"
: "${REDIS_ADMIN_PASSWORD:?REDIS_ADMIN_PASSWORD is required}"
: "${REDIS_PRODUCT_USERNAME:?REDIS_PRODUCT_USERNAME is required}"
: "${REDIS_PRODUCT_PASSWORD:?REDIS_PRODUCT_PASSWORD is required}"
: "${REDIS_JUDGE_USERNAME:?REDIS_JUDGE_USERNAME is required}"
: "${REDIS_JUDGE_PASSWORD:?REDIS_JUDGE_PASSWORD is required}"
: "${REDIS_WORKER_USERNAME:?REDIS_WORKER_USERNAME is required}"
: "${REDIS_WORKER_PASSWORD:?REDIS_WORKER_PASSWORD is required}"
: "${REDIS_HEALTH_USERNAME:?REDIS_HEALTH_USERNAME is required}"
: "${REDIS_HEALTH_PASSWORD:?REDIS_HEALTH_PASSWORD is required}"
: "${JUDGE_REDIS_PREFIX:?JUDGE_REDIS_PREFIX is required}"

run() {
  username=$1
  password=$2
  shift 2
  docker exec -e REDISCLI_AUTH="$password" "$REDIS_CONTAINER" \
    redis-cli --no-auth-warning --user "$username" --raw "$@"
}

allow() {
  output=$(run "$@" 2>&1 || true)
  case "$output" in
    NOPERM*|WRONGPASS*|NOAUTH*)
      echo "unexpected Redis ACL denial" >&2
      exit 1
      ;;
  esac
}

deny() {
  output=$(run "$@" 2>&1 || true)
  case "$output" in
    *NOPERM*|*WRONGPASS*|*NOAUTH*) ;;
    *)
      echo "expected Redis ACL denial" >&2
      exit 1
      ;;
  esac
}

dryrun_denied() {
  target=$1
  shift
  output=$(run "$REDIS_ADMIN_USERNAME" "$REDIS_ADMIN_PASSWORD" ACL DRYRUN "$target" "$@")
  case "$output" in
    *"no permissions"*|*"has no permissions"*|*"User is disabled"*) ;;
    *)
      echo "ACL DRYRUN unexpectedly allowed a forbidden command" >&2
      exit 1
      ;;
  esac
}

dryrun_allowed() {
  target=$1
  shift
  output=$(run "$REDIS_ADMIN_USERNAME" "$REDIS_ADMIN_PASSWORD" ACL DRYRUN "$target" "$@")
  if [ "$output" != "OK" ]; then
    echo "ACL DRYRUN unexpectedly denied a required command" >&2
    exit 1
  fi
}

worker_key="$JUDGE_REDIS_PREFIX:workers:phase6b3-node"
judge_key="$JUDGE_REDIS_PREFIX:acl-probe:judge-key"
similar_key="${JUDGE_REDIS_PREFIX}2:workers:phase6b3-node"
product_key="oj:auth:limit:phase6b3"

allow "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" PING
allow "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" SET "$worker_key" ok PX 30000
deny "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" GET "$worker_key"
deny "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" SET "$judge_key" denied
deny "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" SET "$similar_key" denied
deny "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" SET product:phase6b3 denied

for command in \
  "ACL GETUSER $REDIS_WORKER_USERNAME" \
  "ACL SETUSER phase6b3-forbidden on" \
  "CONFIG GET *" \
  "CONFIG SET timeout 1" \
  "FLUSHALL" \
  "FLUSHDB" \
  "SHUTDOWN NOSAVE" \
  "DEBUG HELP" \
  "MODULE LIST" \
  "SAVE" \
  "BGSAVE"
do
  # Commands contain no shell metacharacters; intentional word splitting.
  # shellcheck disable=SC2086
  dryrun_denied "$REDIS_WORKER_USERNAME" $command
done

allow "$REDIS_JUDGE_USERNAME" "$REDIS_JUDGE_PASSWORD" SET "$judge_key" ok
allow "$REDIS_JUDGE_USERNAME" "$REDIS_JUDGE_PASSWORD" GET "$judge_key"
allow "$REDIS_JUDGE_USERNAME" "$REDIS_JUDGE_PASSWORD" PUBLISH oj:judge-progress-events:v1 '{}'
dryrun_denied "$REDIS_JUDGE_USERNAME" PUBLISH oj:evaluation-events:v1 '{}'
dryrun_denied "$REDIS_JUDGE_USERNAME" EVAL 'return 1' 0
deny "$REDIS_JUDGE_USERNAME" "$REDIS_JUDGE_PASSWORD" GET product:phase6b3
deny "$REDIS_JUDGE_USERNAME" "$REDIS_JUDGE_PASSWORD" GET "$similar_key"
dryrun_denied "$REDIS_JUDGE_USERNAME" ACL LIST
dryrun_denied "$REDIS_JUDGE_USERNAME" CONFIG GET '*'
dryrun_denied "$REDIS_JUDGE_USERNAME" FLUSHALL

allow "$REDIS_PRODUCT_USERNAME" "$REDIS_PRODUCT_PASSWORD" SET "$product_key" 1 PX 30000
allow "$REDIS_PRODUCT_USERNAME" "$REDIS_PRODUCT_PASSWORD" GET "$product_key"
allow "$REDIS_PRODUCT_USERNAME" "$REDIS_PRODUCT_PASSWORD" EVAL "return redis.call('INCR', KEYS[1])" 1 "$product_key"
deny "$REDIS_PRODUCT_USERNAME" "$REDIS_PRODUCT_PASSWORD" EVAL "return redis.call('GET', KEYS[1])" 1 "$judge_key"
allow "$REDIS_PRODUCT_USERNAME" "$REDIS_PRODUCT_PASSWORD" PUBLISH oj:evaluation-events:v1 '{}'
dryrun_allowed "$REDIS_PRODUCT_USERNAME" SUBSCRIBE oj:evaluation-events:v1
dryrun_allowed "$REDIS_PRODUCT_USERNAME" SUBSCRIBE oj:judge-progress-events:v1
dryrun_denied "$REDIS_PRODUCT_USERNAME" SUBSCRIBE phase6b3:unrelated-channel
deny "$REDIS_PRODUCT_USERNAME" "$REDIS_PRODUCT_PASSWORD" GET "$worker_key"
deny "$REDIS_PRODUCT_USERNAME" "$REDIS_PRODUCT_PASSWORD" GET "$judge_key"
dryrun_denied "$REDIS_PRODUCT_USERNAME" ACL LIST
dryrun_denied "$REDIS_PRODUCT_USERNAME" CONFIG GET '*'

allow "$REDIS_HEALTH_USERNAME" "$REDIS_HEALTH_PASSWORD" PING
deny "$REDIS_HEALTH_USERNAME" "$REDIS_HEALTH_PASSWORD" GET "$judge_key"
dryrun_denied default PING

output=$(docker exec "$REDIS_CONTAINER" redis-cli --raw PING 2>&1 || true)
case "$output" in *NOAUTH*) ;; *) echo "no-password connection was not denied" >&2; exit 1;; esac
output=$(docker exec -e REDISCLI_AUTH=wrong-phase6b3-password "$REDIS_CONTAINER" \
  redis-cli --no-auth-warning --user "$REDIS_WORKER_USERNAME" --raw PING 2>&1 || true)
case "$output" in *WRONGPASS*) ;; *) echo "wrong password was not denied" >&2; exit 1;; esac
output=$(docker exec -e REDISCLI_AUTH="$REDIS_WORKER_PASSWORD" "$REDIS_CONTAINER" \
  redis-cli --no-auth-warning --user phase6b3-wrong-user --raw PING 2>&1 || true)
case "$output" in *WRONGPASS*) ;; *) echo "wrong username was not denied" >&2; exit 1;; esac

run "$REDIS_ADMIN_USERNAME" "$REDIS_ADMIN_PASSWORD" ACL SETUSER phase6b3-disabled off resetpass resetkeys resetchannels -@all >/dev/null
output=$(docker exec -e REDISCLI_AUTH=disabled-password "$REDIS_CONTAINER" \
  redis-cli --no-auth-warning --user phase6b3-disabled --raw PING 2>&1 || true)
case "$output" in *WRONGPASS*) ;; *) echo "disabled user was not denied" >&2; exit 1;; esac
run "$REDIS_ADMIN_USERNAME" "$REDIS_ADMIN_PASSWORD" ACL DELUSER phase6b3-disabled >/dev/null

run "$REDIS_ADMIN_USERNAME" "$REDIS_ADMIN_PASSWORD" ACL SETUSER "$REDIS_WORKER_USERNAME" off >/dev/null
output=$(run "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" PING 2>&1 || true)
case "$output" in *WRONGPASS*) ;; *) echo "revoked Worker user was not denied" >&2; exit 1;; esac
run "$REDIS_ADMIN_USERNAME" "$REDIS_ADMIN_PASSWORD" ACL SETUSER "$REDIS_WORKER_USERNAME" on >/dev/null
allow "$REDIS_WORKER_USERNAME" "$REDIS_WORKER_PASSWORD" PING

echo REDIS_ACL_QUALIFICATION_PASS
