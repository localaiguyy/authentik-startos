import { StartSdk } from '@start9labs/start-sdk'
import { manifest } from './manifest'

export const sdk = StartSdk.of().withManifest(manifest).build(true)

// SDK 2.x exposes the input builders on the built sdk object rather than at a
// deep import path (@start9labs/start-sdk/base/lib/... no longer exists).
// Re-exported here so action modules keep importing them from one place.
export const { InputSpec, Value, List, Variants } = sdk
