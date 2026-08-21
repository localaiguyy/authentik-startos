#!/bin/bash
set -e

echo "=== Authentik StartOS Entrypoint ==="

# ======================== Create Data Directories ========================
mkdir -p /root/data/postgres /root/data/start9
mkdir -p /root/data/authentik/media /root/data/authentik/certs
mkdir -p /root/data/authentik/custom-templates
mkdir -p /var/run/postgresql /var/log/supervisor
# Authentik 2025.12+ serves files from /data/media instead of /media
mkdir -p /data/media /certs

# ======================== Read Configuration ========================
ADMIN_EMAIL="${S9_AUTHENTIK_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${S9_AUTHENTIK_ADMIN_PASSWORD:-changeme}"
SECRET_KEY="${S9_AUTHENTIK_SECRET_KEY:-insecure-default-key}"
DB_PASSWORD="${S9_AUTHENTIK_DB_PASSWORD:-authentik}"
BASE_URL="${S9_AUTHENTIK_BASE_URL:-}"
LOG_LEVEL="${S9_AUTHENTIK_LOG_LEVEL:-info}"
ENABLE_LDAP="${S9_AUTHENTIK_ENABLE_LDAP:-false}"

# SMTP
SMTP_HOST="${S9_AUTHENTIK_SMTP_HOST:-}"
SMTP_PORT="${S9_AUTHENTIK_SMTP_PORT:-587}"
SMTP_USERNAME="${S9_AUTHENTIK_SMTP_USERNAME:-}"
SMTP_PASSWORD="${S9_AUTHENTIK_SMTP_PASSWORD:-}"
SMTP_USE_TLS="${S9_AUTHENTIK_SMTP_USE_TLS:-true}"
SMTP_FROM="${S9_AUTHENTIK_SMTP_FROM:-}"

# Configure Authentik SMTP if host is set
if [ -n "$SMTP_HOST" ]; then
    export AUTHENTIK_EMAIL__HOST="$SMTP_HOST"
    export AUTHENTIK_EMAIL__PORT="$SMTP_PORT"
    export AUTHENTIK_EMAIL__USERNAME="$SMTP_USERNAME"
    export AUTHENTIK_EMAIL__PASSWORD="$SMTP_PASSWORD"
    export AUTHENTIK_EMAIL__USE_TLS="$SMTP_USE_TLS"
    export AUTHENTIK_EMAIL__FROM="$SMTP_FROM"
    echo "  SMTP: $SMTP_HOST:$SMTP_PORT (from: $SMTP_FROM)"
fi

# Convert enable-ldap to supervisord autostart value
if [ "$ENABLE_LDAP" = "true" ]; then
    export AUTHENTIK_LDAP_AUTOSTART=true
else
    export AUTHENTIK_LDAP_AUTOSTART=false
fi

echo "Configuration:"
echo "  Admin Email: $ADMIN_EMAIL"
echo "  Base URL: $BASE_URL"
echo "  Log Level: $LOG_LEVEL"
echo "  LDAP Outpost: $ENABLE_LDAP"

# ======================== PostgreSQL Setup ========================
# Target PG version — explicitly set to 17 (shipped with Authentik 2026.2.1 base image)
# Do NOT auto-detect with sort -rn — PGDG repo may install newer versions as dependencies
PG_NEW=17
export PG_MAJOR="$PG_NEW"
PG_NEW_BIN="/usr/lib/postgresql/${PG_NEW}/bin"
PG_DATA="/root/data/postgres"

# Increase max_connections for Authentik 2025.10+ (Redis removed, PG handles caching)
PG_MAX_CONNECTIONS=200

echo "PostgreSQL target version: $PG_NEW"

# Check if existing data needs upgrade
if [ -f "$PG_DATA/PG_VERSION" ]; then
    PG_OLD=$(cat "$PG_DATA/PG_VERSION")
    if [ "$PG_OLD" != "$PG_NEW" ]; then
        echo "=== PostgreSQL upgrade needed: $PG_OLD -> $PG_NEW ==="
        PG_OLD_BIN="/usr/lib/postgresql/${PG_OLD}/bin"

        if [ ! -d "$PG_OLD_BIN" ]; then
            echo "ERROR: PostgreSQL $PG_OLD binaries not found at $PG_OLD_BIN"
            echo "Cannot upgrade database. Aborting."
            exit 1
        fi

        # Create new data directory for upgrade
        PG_DATA_NEW="/root/data/postgres_new"
        mkdir -p "$PG_DATA_NEW"
        chown postgres:postgres "$PG_DATA_NEW"
        chmod 700 "$PG_DATA_NEW"

        # Initialize new cluster
        echo "Initializing new PostgreSQL $PG_NEW cluster..."
        gosu postgres "$PG_NEW_BIN/initdb" -D "$PG_DATA_NEW" --encoding=UTF8 --locale=C

        # Run pg_upgrade
        echo "Running pg_upgrade from $PG_OLD to $PG_NEW..."
        cd /tmp
        gosu postgres "$PG_NEW_BIN/pg_upgrade" \
            --old-datadir="$PG_DATA" \
            --new-datadir="$PG_DATA_NEW" \
            --old-bindir="$PG_OLD_BIN" \
            --new-bindir="$PG_NEW_BIN" \
            --check

        echo "Check passed, performing actual upgrade..."
        gosu postgres "$PG_NEW_BIN/pg_upgrade" \
            --old-datadir="$PG_DATA" \
            --new-datadir="$PG_DATA_NEW" \
            --old-bindir="$PG_OLD_BIN" \
            --new-bindir="$PG_NEW_BIN"

        echo "pg_upgrade complete. Swapping data directories..."

        # Preserve custom pg_hba.conf and postgresql.conf settings
        cp "$PG_DATA/pg_hba.conf" "$PG_DATA_NEW/pg_hba.conf"

        # Apply our postgresql.conf settings to new cluster
        cat >> "$PG_DATA_NEW/postgresql.conf" <<EOF
listen_addresses = 'localhost'
max_connections = $PG_MAX_CONNECTIONS
shared_buffers = 256MB
work_mem = 4MB
EOF

        # Swap directories
        mv "$PG_DATA" "/root/data/postgres_old_${PG_OLD}"
        mv "$PG_DATA_NEW" "$PG_DATA"

        chown -R postgres:postgres "$PG_DATA"
        chmod 700 "$PG_DATA"

        echo "=== PostgreSQL upgrade $PG_OLD -> $PG_NEW complete ==="
        echo "Old data preserved at /root/data/postgres_old_${PG_OLD} (can be removed after verification)"
    fi
fi

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL database..."
    chown -R postgres:postgres "$PG_DATA"
    chmod 700 "$PG_DATA"
    gosu postgres "$PG_NEW_BIN/initdb" -D "$PG_DATA" --encoding=UTF8 --locale=C

    cat > "$PG_DATA/pg_hba.conf" <<EOF
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
EOF

    cat >> "$PG_DATA/postgresql.conf" <<EOF
listen_addresses = 'localhost'
max_connections = $PG_MAX_CONNECTIONS
shared_buffers = 256MB
work_mem = 4MB
EOF
fi

# Ensure max_connections is updated for existing installs (upgrade from Redis-era)
if grep -q "max_connections = 100" "$PG_DATA/postgresql.conf" 2>/dev/null; then
    echo "Upgrading PostgreSQL max_connections from 100 to $PG_MAX_CONNECTIONS (Redis removed in 2025.10)..."
    sed -i "s/max_connections = 100/max_connections = $PG_MAX_CONNECTIONS/" "$PG_DATA/postgresql.conf"
fi

# Ensure shared_buffers is updated for existing installs
if grep -q "shared_buffers = 128MB" "$PG_DATA/postgresql.conf" 2>/dev/null; then
    echo "Upgrading PostgreSQL shared_buffers from 128MB to 256MB..."
    sed -i "s/shared_buffers = 128MB/shared_buffers = 256MB/" "$PG_DATA/postgresql.conf"
fi

chown -R postgres:postgres "$PG_DATA" /var/run/postgresql
chmod 700 "$PG_DATA"

echo "Starting PostgreSQL..."
gosu postgres "$PG_NEW_BIN/pg_ctl" -D "$PG_DATA" -w start -o "-c listen_addresses=localhost"

if ! gosu postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='authentik'" | grep -q 1; then
    echo "Creating authentik database user..."
    gosu postgres psql -c "CREATE USER authentik WITH PASSWORD '$DB_PASSWORD';"
fi

if ! gosu postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='authentik'" | grep -q 1; then
    echo "Creating authentik database..."
    gosu postgres psql -c "CREATE DATABASE authentik OWNER authentik;"
fi

gosu postgres psql -c "ALTER USER authentik WITH PASSWORD '$DB_PASSWORD';"

# ======================== Media Migration (2025.12 upgrade) ========================
# Authentik 2025.12+ serves files from /data/media instead of /media
# Migrate any existing media from old location
if [ -d /root/data/authentik/media ] && [ "$(ls -A /root/data/authentik/media 2>/dev/null)" ]; then
    echo "Migrating media files to /data/media (Authentik 2025.12+ path)..."
    cp -rn /root/data/authentik/media/* /data/media/ 2>/dev/null || true
fi

# ======================== Authentik Environment ========================
export AUTHENTIK_SECRET_KEY="$SECRET_KEY"
export AUTHENTIK_POSTGRESQL__HOST="localhost"
export AUTHENTIK_POSTGRESQL__PORT="5432"
export AUTHENTIK_POSTGRESQL__USER="authentik"
export AUTHENTIK_POSTGRESQL__NAME="authentik"
export AUTHENTIK_POSTGRESQL__PASSWORD="$DB_PASSWORD"
# Note: AUTHENTIK_REDIS__* removed — Redis eliminated in Authentik 2025.10
export AUTHENTIK_LOG_LEVEL="$LOG_LEVEL"
export AUTHENTIK_LISTEN__HTTP="0.0.0.0:9000"
export AUTHENTIK_BOOTSTRAP_PASSWORD="$ADMIN_PASSWORD"
export AUTHENTIK_BOOTSTRAP_EMAIL="$ADMIN_EMAIL"
export AUTHENTIK_STORAGE__MEDIA__BACKEND="file"
export AUTHENTIK_STORAGE__MEDIA__FILE__PATH="/data/media"

# ======================== LDAP Outpost Environment ========================
if [ "$ENABLE_LDAP" = "true" ]; then
    export AUTHENTIK_HOST="http://localhost:9000"
    export AUTHENTIK_INSECURE="true"
    export AUTHENTIK_LISTEN__LDAP="0.0.0.0:3389"
    export AUTHENTIK_LISTEN__LDAPS="0.0.0.0:6636"
    echo "LDAP outpost enabled: listening on 3389 (LDAP) and 6636 (LDAPS)"
fi

# ======================== Run Migrations ========================
export PYTHONPATH=/
echo "Running Authentik database migrations..."
cd /
if ! python -m manage migrate 2>&1; then
    echo "WARNING: Migration failed. Applying upgrade workarounds..."
    # When upgrading from 2024.12.3 to 2026.2.1, three migration issues arise:
    #
    # 1) 0056_user_roles: RunPython references guardian.UserObjectPermission
    #    (removed by 0057), but also creates authentik_core_user_roles via AddField.
    #    Simply faking it skips the table creation, breaking runtime queries.
    #    Fix: Create table via SQL, then fake the migration.
    #
    # 2) 0057: Tries to DROP authentik_core_user_user_permissions and
    #    authentik_core_user_ak_groups from public schema, but after multi-schema
    #    migration these tables only exist in the "template" schema.
    #    Fix: Fake 0057 since the tables it removes don't exist in public anyway.
    #
    # 3) authentik_lifecycle 0001_initial: Tries to CREATE tables that already
    #    exist (created during template schema setup).
    #    Fix: Fake the lifecycle migrations.

    echo "Creating authentik_core_user_roles table via SQL..."
    gosu postgres psql -U authentik -d authentik -c "
        CREATE TABLE IF NOT EXISTS authentik_core_user_roles (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES authentik_core_user(id) DEFERRABLE INITIALLY DEFERRED,
            role_id UUID NOT NULL REFERENCES authentik_rbac_role(uuid) DEFERRABLE INITIALLY DEFERRED,
            UNIQUE (user_id, role_id)
        );
        CREATE INDEX IF NOT EXISTS authentik_core_user_roles_user_id ON authentik_core_user_roles(user_id);
        CREATE INDEX IF NOT EXISTS authentik_core_user_roles_role_id ON authentik_core_user_roles(role_id);
    " 2>&1

    echo "Creating authentik_core_user_user_permissions table via SQL (for 0057 to drop)..."
    gosu postgres psql -U authentik -d authentik -c "
        CREATE TABLE IF NOT EXISTS public.authentik_core_user_user_permissions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            permission_id INTEGER NOT NULL,
            UNIQUE (user_id, permission_id)
        );
    " 2>&1

    echo "Faking migration 0056..."
    python -m manage migrate authentik_core 0056 --fake 2>&1 || true

    echo "Faking migration 0057 (removes fields that don't exist in public schema)..."
    python -m manage migrate authentik_core 0057 --fake 2>&1 || true

    echo "Faking authentik_lifecycle migrations (tables already exist)..."
    python -m manage migrate authentik_lifecycle --fake 2>&1 || true

    echo "Running remaining migrations..."
    python -m manage migrate 2>&1
fi
echo "Migrations complete."

# Run bootstrap tasks (creates akadmin user on first run)
echo "Running bootstrap tasks..."
python -m manage bootstrap_tasks || echo "Bootstrap tasks skipped (may already exist)"

# ======================== Stop Temporary Services ========================
echo "Stopping temporary services before supervisord..."
gosu postgres "$PG_NEW_BIN/pg_ctl" -D "$PG_DATA" -w stop 2>/dev/null || true

# ======================== Start Supervisord ========================
echo "Starting all services via supervisord..."
# Wrap supervisord in tini (subreaper) so orphaned children are reaped.
# The StartOS subcontainer's PID 1 (start-container launch-init) does not reap
# reparented orphans — it blocks in recvfrom() on its control socket and never
# calls wait4/waitid. supervisord is not a subreaper either, so any child that
# orphans (gunicorn worker turnover, ak worker tasks, shell-outs) reparents past
# supervisord to the non-reaping launch-init and accumulates as a <defunct>
# zombie. tini -s reaps them. The real fix belongs upstream in StartOS
# (launch-init should reap); tini is the workaround until then.
exec /usr/bin/tini -s -- /usr/bin/supervisord -c /etc/supervisor/conf.d/authentik.conf
