import { VersionInfo } from '@start9labs/start-sdk'

export const v1_0_0_beta_3 = VersionInfo.of({
  version: '1.0.0-beta.3:0',
  releaseNotes: `Backup Pipeline Fix (continued)

Adds /usr/local/bin/{pg_ctl,pg_dump,pg_restore,psql,initdb,createdb,pg_isready}
symlinks to the container image so sdk.Backups.withPgDump can invoke postgres
binaries by bare name. Debian installs these under /usr/lib/postgresql/17/bin
which is NOT in $PATH by default, causing 'pg_ctl failed with exit code 2:
No such file or directory' during backup.

Continuation of the withPgDump migration started in 1.0.0-beta.2.`,
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
