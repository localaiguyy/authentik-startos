# Authentik Identity Provider for StartOS 0.4.0
#
# This Dockerfile creates a container running:
# - PostgreSQL (database + cache, Redis removed in 2025.10)
# - Authentik Server (web UI + API)
# - Authentik Worker (background tasks)
#
# Based on the official Authentik server image which contains
# the pre-built Go+Python monolithic binary.

# Stage 1: Extract LDAP outpost binary (Go binary, ~22MB)
FROM ghcr.io/goauthentik/ldap:2026.2.1 AS ldap-outpost

# Stage 2: Main image
FROM ghcr.io/goauthentik/server:2026.2.1

USER root

# Build arguments
ARG TARGETARCH

# Install PostgreSQL 17 (from Debian base), supervisord, and utilities
# Also install PG 15 from PGDG repo for pg_upgrade from 2024.12.3 data
# IMPORTANT: Install postgresql-15 ONLY — do NOT install postgresql-contrib from
# PGDG as it pulls in PG 18 and replaces PG 17
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql \
    postgresql-contrib \
    supervisor \
    tini \
    curl \
    wget \
    gosu \
    procps \
    gnupg2 lsb-release \
    && echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-15 \
    && rm -rf /var/lib/apt/lists/*

# Expose PostgreSQL 17 binaries (pg_ctl, pg_dump, pg_restore, psql, initdb, createdb)
# on $PATH so sdk.Backups.withPgDump can invoke them by bare name. Debian installs
# them under /usr/lib/postgresql/<version>/bin which is NOT in any user's default
# PATH. PG 17 is the running data-dir version; PG 15 is only kept for pg_upgrade.
RUN for bin in pg_ctl pg_dump pg_restore psql initdb createdb pg_isready pg_lsclusters; do \
        if [ -x /usr/lib/postgresql/17/bin/$bin ]; then \
            ln -sf /usr/lib/postgresql/17/bin/$bin /usr/local/bin/$bin ; \
        fi ; \
    done

# Install yq for YAML processing in entrypoint
RUN case "${TARGETARCH}" in \
        "amd64") YQ_ARCH="amd64" ;; \
        "arm64") YQ_ARCH="arm64" ;; \
        *) YQ_ARCH="amd64" ;; \
    esac && \
    wget -qO /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${YQ_ARCH}" && \
    chmod +x /usr/local/bin/yq

# Create persistent data directories
# Note: /data/media is the new path for Authentik 2025.12+
RUN mkdir -p \
    /root/data/postgres \
    /root/data/start9 \
    /root/data/authentik/media \
    /root/data/authentik/certs \
    /root/data/authentik/custom-templates \
    /data/media \
    /var/run/postgresql \
    /var/log/supervisor

# Set permissions for PostgreSQL
RUN chown -R postgres:postgres /root/data/postgres /var/run/postgresql && \
    chmod 700 /root/data/postgres && \
    chmod 755 /root /root/data /data

# Copy LDAP outpost binary from first stage
COPY --from=ldap-outpost /ldap /usr/local/bin/authentik-ldap

# Copy configuration files
COPY supervisord.conf /etc/supervisor/conf.d/authentik.conf
COPY docker_entrypoint.sh /app/docker_entrypoint.sh
COPY ldap_outpost_wrapper.sh /app/ldap_outpost_wrapper.sh

# Copy backup/restore scripts
RUN mkdir -p /assets/compat
COPY assets/compat/backup.sh /assets/compat/backup.sh
COPY assets/compat/restore.sh /assets/compat/restore.sh

# Make scripts executable
RUN chmod +x \
    /app/docker_entrypoint.sh \
    /app/ldap_outpost_wrapper.sh \
    /assets/compat/backup.sh \
    /assets/compat/restore.sh

# Expose Authentik HTTP port (StartOS handles TLS termination)
# LDAP ports exposed conditionally via supervisord autostart
EXPOSE 9000 3389 6636

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -sf http://localhost:9000/-/health/live/ > /dev/null || exit 1

ENTRYPOINT ["/app/docker_entrypoint.sh"]
