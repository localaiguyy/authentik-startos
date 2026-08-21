import { VersionInfo } from '@start9labs/start-sdk'

export const v1_0_0 = VersionInfo.of({
  version: '1.0.0:0',
  releaseNotes: `First stable release

Upgraded to StartOS SDK 2.0.9.

The input builders (InputSpec, Value, List, Variants) are now sourced from the
built sdk object; the deep import path used under SDK 1.x no longer exists.

No data migration is required from the 1.0.0-beta series — the on-disk layout
(PostgreSQL data directory, authentik/ media and certs, start9/config.yaml) is
unchanged.`,
  migrations: {},
})
