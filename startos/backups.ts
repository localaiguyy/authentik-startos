import { sdk } from './sdk'
import { configFile } from './fileModels/config.yaml'
import { dbName, dbUser } from './utils'

/**
 * Backup configuration for Authentik.
 *
 * Uses sdk.Backups.withPgDump to stream a pg_dump archive instead of rsyncing
 * the raw PostgreSQL data directory. Raw rsync of the Postgres data directory
 * triggers a pathological FUSE+CIFS read-modify-write loop on an encrypted
 * backup target (mount.backup-fs): a few hundred MB of volume can wedge a
 * backup run for hours. The pg_dump path produces a compressed archive roughly
 * an order of magnitude smaller, in seconds.
 *
 * The DB password is read lazily from start9/config.yaml so it's resolved
 * after volume restore during pg_restore, not at backup creation time.
 */
export const { createBackup, restoreInit } = sdk.setupBackups(
  async () =>
    sdk.Backups.withPgDump({
      imageId: 'authentik',
      dbVolume: 'main',
      mountpoint: '/root/data',
      pgdataPath: '/postgres',
      database: dbName,
      user: dbUser,
      password: async () => {
        const config = await configFile.read().once()
        if (!config?.['db-password'])
          throw new Error('No db-password found in config.yaml')
        return config['db-password']
      },
    })
      .addSync({
        dataPath: '/media/startos/volumes/main/authentik/',
        backupPath: '/media/startos/backup/volumes/main/authentik/',
      })
      .addSync({
        dataPath: '/media/startos/volumes/main/redis/',
        backupPath: '/media/startos/backup/volumes/main/redis/',
      })
      .addSync({
        dataPath: '/media/startos/volumes/main/start9/',
        backupPath: '/media/startos/backup/volumes/main/start9/',
      }),
)
