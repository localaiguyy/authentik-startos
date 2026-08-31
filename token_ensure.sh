#!/bin/bash
# One-shot supervisord program: wait for the Authentik server to be ready and
# for the akadmin user to exist (created asynchronously by the worker's
# blueprint application since Authentik 2026.8), then ensure the provisioning
# API token used by the StartOS package actions.
#
# The entrypoint also attempts this before supervisord starts — that path
# succeeds on every boot AFTER the first. This program exists for the first
# boot, where akadmin does not exist yet when the entrypoint runs.
set -u
cd /
export PYTHONPATH=/

if [ -z "${S9_AUTHENTIK_PROVISIONING_TOKEN:-}" ]; then
    echo "No provisioning token configured; nothing to ensure."
    exit 0
fi

SNIPPET='
import os
from authentik.core.models import Token, TokenIntents, User
key = os.environ.get("S9_AUTHENTIK_PROVISIONING_TOKEN", "")
user = User.objects.filter(username="akadmin").first()
if key and user:
    t = Token.objects.filter(identifier="startos-provisioning").first()
    if t is None:
        Token.objects.create(identifier="startos-provisioning", user=user,
            intent=TokenIntents.INTENT_API, key=key, expiring=False,
            description="Used by StartOS package actions to provision SSO providers")
        print("TOKEN_CREATED")
    elif t.key != key or t.expiring:
        t.key = key; t.user = user; t.expiring = False; t.save()
        print("TOKEN_UPDATED")
    else:
        print("TOKEN_OK")
else:
    print("TOKEN_WAIT")
'

for i in $(seq 1 60); do
    if curl -sf http://localhost:9000/-/health/ready/ >/dev/null 2>&1; then
        result=$(python -m manage shell -c "$SNIPPET" 2>/dev/null || echo TOKEN_ERROR)
        case "$result" in
            *TOKEN_CREATED*) echo "Provisioning token created."; exit 0 ;;
            *TOKEN_UPDATED*) echo "Provisioning token updated."; exit 0 ;;
            *TOKEN_OK*)      echo "Provisioning token OK.";      exit 0 ;;
        esac
    fi
    sleep 10
done

echo "WARNING: provisioning token could not be ensured after 10 minutes." \
     "SSO provisioning actions will not work until the next service start."
exit 0
