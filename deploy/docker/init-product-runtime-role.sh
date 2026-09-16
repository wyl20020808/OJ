#!/bin/sh
set -eu

: "${PRODUCT_RUNTIME_DB_USER:?PRODUCT_RUNTIME_DB_USER is required}"
: "${PRODUCT_RUNTIME_DB_PASSWORD:?PRODUCT_RUNTIME_DB_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=runtime_user="$PRODUCT_RUNTIME_DB_USER" \
  --set=runtime_password="$PRODUCT_RUNTIME_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" \
  --set=migration_user="$POSTGRES_USER" <<'SQL'
CREATE ROLE :"runtime_user" LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT CONNECT ON DATABASE :"database_name" TO :"runtime_user";
GRANT USAGE ON SCHEMA public TO :"runtime_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_user";
SQL
