import { VersionInfo } from '@start9labs/start-sdk'

export const v1_2_1 = VersionInfo.of({
  version: '1.2.1:0',
  releaseNotes: `Fix a crash loop after same-version service restarts.

A service restart reuses the container (only version-change installs get a
fresh one), and the server does not unlink an existing unix socket path
before binding — so a leftover metrics socket from the previous run
crash-looped the server with "Address already in use". The entrypoint now
removes stale socket files before starting services.

Feature content is identical to 1.2.0.`,
  migrations: {},
})
