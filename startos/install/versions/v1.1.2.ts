import { VersionInfo } from '@start9labs/start-sdk'

export const v1_1_2 = VersionInfo.of({
  version: '1.1.2:0',
  releaseNotes: `Worker fix for Authentik 2026.8 in the single-container model.

- Since Authentik 2026.8 the worker binds its own HTTP and metrics listeners.
  Upstream runs server and worker in separate containers so both may use the
  same ports; in this package they share a network namespace, so the worker
  crash-looped with "Address already in use" and ended in a FATAL state. The
  worker now gets loopback-only ports of its own (9001/9301).
- The akadmin user is created asynchronously by worker blueprints in 2026.8
  (the old bootstrap_tasks command was removed upstream). A one-shot task now
  waits for the server and akadmin, then ensures the provisioning API token —
  so the SSO provisioning actions work right after the first boot instead of
  requiring a second service start.

Feature content is identical to 1.1.0/1.1.1 — see those notes for the SSO
provisioning actions and the Authentik 2026.8.0 upgrade.`,
  migrations: {},
})
