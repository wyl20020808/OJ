#!/bin/sh
set -eu

acl_dir=/redis-acl
acl_file="$acl_dir/users.acl"
tmp_file="$acl_dir/users.acl.tmp"

require_username() {
  name=$1
  value=$2
  case "$value" in
    ''|*[!A-Za-z0-9._-]*)
      echo "invalid Redis ACL username: $name" >&2
      exit 1
      ;;
  esac
}

require_password() {
  name=$1
  value=$2
  if [ "${#value}" -lt 16 ]; then
    echo "$name must contain at least 16 characters" >&2
    exit 1
  fi
}

require_prefix() {
  case "$JUDGE_REDIS_PREFIX" in
    ''|*[!A-Za-z0-9:._-]*|*'*'*|*'?'*|*'['*|*']'*)
      echo "invalid JUDGE_REDIS_PREFIX" >&2
      exit 1
      ;;
  esac
}

for variable in \
  REDIS_ADMIN_USERNAME REDIS_ADMIN_PASSWORD \
  REDIS_PRODUCT_USERNAME REDIS_PRODUCT_PASSWORD \
  REDIS_JUDGE_USERNAME REDIS_JUDGE_PASSWORD \
  REDIS_WORKER_USERNAME REDIS_WORKER_PASSWORD \
  REDIS_HEALTH_USERNAME REDIS_HEALTH_PASSWORD \
  JUDGE_REDIS_PREFIX
do
  eval "value=\${$variable:-}"
  if [ -z "$value" ]; then
    echo "$variable is required" >&2
    exit 1
  fi
done

require_username REDIS_ADMIN_USERNAME "$REDIS_ADMIN_USERNAME"
require_username REDIS_PRODUCT_USERNAME "$REDIS_PRODUCT_USERNAME"
require_username REDIS_JUDGE_USERNAME "$REDIS_JUDGE_USERNAME"
require_username REDIS_WORKER_USERNAME "$REDIS_WORKER_USERNAME"
require_username REDIS_HEALTH_USERNAME "$REDIS_HEALTH_USERNAME"
require_password REDIS_ADMIN_PASSWORD "$REDIS_ADMIN_PASSWORD"
require_password REDIS_PRODUCT_PASSWORD "$REDIS_PRODUCT_PASSWORD"
require_password REDIS_JUDGE_PASSWORD "$REDIS_JUDGE_PASSWORD"
require_password REDIS_WORKER_PASSWORD "$REDIS_WORKER_PASSWORD"
require_password REDIS_HEALTH_PASSWORD "$REDIS_HEALTH_PASSWORD"
require_prefix

if [ "$(printf '%s\n' "$REDIS_ADMIN_USERNAME" "$REDIS_PRODUCT_USERNAME" "$REDIS_JUDGE_USERNAME" "$REDIS_WORKER_USERNAME" "$REDIS_HEALTH_USERNAME" | sort -u | wc -l)" -ne 5 ]; then
  echo "Redis ACL usernames must be distinct" >&2
  exit 1
fi

hash_password() {
  printf '%s' "$1" | sha256sum | cut -d ' ' -f 1
}

admin_hash=$(hash_password "$REDIS_ADMIN_PASSWORD")
product_hash=$(hash_password "$REDIS_PRODUCT_PASSWORD")
judge_hash=$(hash_password "$REDIS_JUDGE_PASSWORD")
worker_hash=$(hash_password "$REDIS_WORKER_PASSWORD")
health_hash=$(hash_password "$REDIS_HEALTH_PASSWORD")

mkdir -p "$acl_dir"
if [ -f "$acl_file" ]; then
  awk \
    -v admin="$REDIS_ADMIN_USERNAME" \
    -v product="$REDIS_PRODUCT_USERNAME" \
    -v judge="$REDIS_JUDGE_USERNAME" \
    -v worker="$REDIS_WORKER_USERNAME" \
    -v health="$REDIS_HEALTH_USERNAME" \
    '$1 == "user" && ($2 == "default" || $2 == admin || $2 == product || $2 == judge || $2 == worker || $2 == health) { next } { print }' \
    "$acl_file" > "$tmp_file"
else
  : > "$tmp_file"
fi

cat >> "$tmp_file" <<EOF
user default off resetkeys resetchannels -@all
user $REDIS_ADMIN_USERNAME on #$admin_hash ~* &* +@all
user $REDIS_PRODUCT_USERNAME on #$product_hash resetkeys ~oj:auth:limit:* ~ojplatform:auth:guest:rate:* ~ojplatform:social:rate:* ~ojplatform:guest-authoring:rate:* ~oj:judge:* resetchannels &oj:evaluation-events:v1 &oj:judge-progress-events:v1 -@all +ping +get +set +del +keys +lpush +rpop +llen +lrange +incr +expire +pexpire +pttl +eval +publish +subscribe +unsubscribe
user $REDIS_JUDGE_USERNAME on #$judge_hash resetkeys ~$JUDGE_REDIS_PREFIX:* resetchannels &oj:judge-progress-events:v1 -@all +ping +get +set +del +keys +lpush +rpop +llen +lrange +publish
user $REDIS_WORKER_USERNAME on #$worker_hash resetkeys ~$JUDGE_REDIS_PREFIX:workers:* resetchannels -@all +ping +set
user $REDIS_HEALTH_USERNAME on #$health_hash resetkeys resetchannels -@all +ping
EOF

chown redis:redis "$tmp_file"
chmod 640 "$tmp_file"
mv "$tmp_file" "$acl_file"
