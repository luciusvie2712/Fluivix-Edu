#!/bin/sh
set -eu
export PILOT_MIGRATOR_PASSWORD="$(cat /run/secrets/migrator_password)"
export PILOT_APP_PASSWORD="$(cat /run/secrets/app_password)"
psql -X --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv migration_password PILOT_MIGRATOR_PASSWORD
\getenv application_password PILOT_APP_PASSWORD
CREATE ROLE fluivix_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'migration_password';
CREATE ROLE fluivix_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'application_password';
ALTER DATABASE fluivixedu_pilot OWNER TO fluivix_migrator;
REVOKE ALL ON DATABASE fluivixedu_pilot FROM PUBLIC;
GRANT CONNECT ON DATABASE fluivixedu_pilot TO fluivix_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO fluivix_app;
SQL
unset PILOT_MIGRATOR_PASSWORD PILOT_APP_PASSWORD
