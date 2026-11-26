#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE telegraf LOGIN PASSWORD '${TELEGRAF_PG_PASSWORD}';
GRANT pg_monitor TO telegraf;
SQL
