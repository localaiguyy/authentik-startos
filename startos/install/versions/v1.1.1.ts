import { VersionInfo } from '@start9labs/start-sdk'

export const v1_1_1 = VersionInfo.of({
  version: '1.1.1:0',
  releaseNotes: `Fresh-install fix for the 1.1.0 feature release.

Field-testing 1.1.0 on a clean StartOS server surfaced a first-boot failure:

- Migrations now run through upstream's canonical runner
  (python -m lifecycle.migrate) instead of raw manage migrate, which could
  trip a mid-run check against a not-yet-created table on a fresh 2026.8
  database.
- The legacy fake-migration upgrade workarounds are now gated on actual
  upgrade evidence. On a fresh database they no longer run (they marked
  migrations as applied that never ran, corrupting the schema); a fresh
  install that hits a transient migration failure retries once instead.
- A failed first boot no longer leaves the temporary PostgreSQL server
  running, which previously caused every subsequent start to crash-loop on
  "lock file postmaster.pid already exists".

Feature content is identical to 1.1.0 — see its notes for the new SSO
provisioning actions and the Authentik 2026.8.0 upgrade.`,
  migrations: {},
})
