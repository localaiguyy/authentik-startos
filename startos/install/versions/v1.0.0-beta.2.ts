import { VersionInfo } from '@start9labs/start-sdk'

export const v1_0_0_beta_2 = VersionInfo.of({
  version: '1.0.0-beta.2:0',
  releaseNotes: `Backup Pipeline Fix

Migrates backup procedure from sdk.Backups.ofVolumes('main') to
sdk.Backups.withPgDump. The previous implementation triggered a pathological
FUSE+CIFS read-modify-write loop on encrypted backup targets, which could wedge
a backup run for hours.

The new implementation streams a pg_dump archive and backs up the non-database
volume contents (authentik/, redis/, start9/) via standard rsync. Expected
backup time: well under a minute.

Also bumps @start9labs/start-sdk from 1.0.0 to 1.5.2.

Existing backups remain restorable via the SDK's restoreInit handling of legacy
ofVolumes archives.`,
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
