#!/bin/bash
# Wrapper for the Authentik LDAP outpost binary.
# Waits for the main server to be ready, fetches the outpost API token,
# then starts the Go LDAP binary with the correct environment.

set -e

echo "LDAP Outpost: Waiting for Authentik server..."

# Wait for the server to respond on the health endpoint
MAX_WAIT=300
WAITED=0
while ! curl -sf http://localhost:9000/-/health/live/ > /dev/null 2>&1; do
    sleep 5
    WAITED=$((WAITED + 5))
    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
        echo "LDAP Outpost: Timed out waiting for Authentik server after ${MAX_WAIT}s"
        exit 1
    fi
done
echo "LDAP Outpost: Server is ready (waited ${WAITED}s)"

# Find the LDAP outpost UUID by type, then get its API token
LDAP_OUTPOST_UUID=$(gosu postgres psql -U authentik -d authentik -tAc \
    "SELECT uuid FROM authentik_outposts_outpost WHERE type = 'ldap' LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

if [ -z "$LDAP_OUTPOST_UUID" ]; then
    echo "LDAP Outpost: ERROR - No LDAP outpost found in database"
    echo "LDAP Outpost: Create an LDAP outpost in the Authentik admin UI first"
    exit 1
fi

echo "LDAP Outpost: Found LDAP outpost $LDAP_OUTPOST_UUID"

OUTPOST_TOKEN=$(gosu postgres psql -U authentik -d authentik -tAc \
    "SELECT key FROM authentik_core_token WHERE identifier = 'ak-outpost-${LDAP_OUTPOST_UUID}-api' AND intent = 'api';" 2>/dev/null | tr -d '[:space:]')

if [ -z "$OUTPOST_TOKEN" ]; then
    echo "LDAP Outpost: ERROR - Could not find API token for outpost $LDAP_OUTPOST_UUID"
    exit 1
fi

echo "LDAP Outpost: Retrieved API token for LDAP outpost"

export AUTHENTIK_HOST="http://localhost:9000"
export AUTHENTIK_TOKEN="$OUTPOST_TOKEN"
export AUTHENTIK_INSECURE="true"

exec /usr/local/bin/authentik-ldap
