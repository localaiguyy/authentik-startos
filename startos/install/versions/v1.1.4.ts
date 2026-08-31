import { VersionInfo } from '@start9labs/start-sdk'

export const v1_1_4 = VersionInfo.of({
  version: '1.1.4:0',
  releaseNotes: `Embedded outpost fix + safer multi-version upgrades.

- The embedded outpost (used by proxy/forward-auth providers) could not
  connect to the API: server and worker derive their unix socket paths from
  the shared temp directory, and the worker silently re-bound the server's
  socket. The worker now gets a private TMPDIR. Symptom was
  "Failed to fetch outpost from API (404), retrying" on loop, and proxy
  applications falling through to the core login page.
- Migration failure handling is now signature-based: upstream's
  "major version skips are not allowed" refusal re-runs with upstream's own
  override flag; the legacy 2024.12-era fake-migration workarounds run ONLY
  on their exact failure signature; anything else fails loudly instead of
  corrupting the schema.

Feature content is identical to 1.1.0-1.1.3.`,
  migrations: {},
})
