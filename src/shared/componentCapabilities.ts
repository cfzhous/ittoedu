import type {
  ComponentManifest,
  ComponentManifestV4,
  ComponentRenderMode,
  ComponentScope,
} from './componentTypes'

/** V1/V2 packages predate global mounting and therefore remain scene-only. */
export function componentSupportsScope(
  manifest: ComponentManifest,
  scope: ComponentScope,
): boolean {
  if (manifest.schemaVersion === 1 || manifest.schemaVersion === 2) {
    return scope === 'scene'
  }
  return manifest.supportedScopes.includes(scope)
}

/** V3 introduced recursive `props.content`; V4 deliberately preserves it. */
export function componentUsesRecursiveContent(
  manifest: ComponentManifest,
): boolean {
  return manifest.schemaVersion === 3 || manifest.schemaVersion === 4
}

/** Legacy component packages are Phaser-backed by contract. */
export function componentRenderMode(
  manifest: ComponentManifest,
): ComponentRenderMode {
  return manifest.schemaVersion === 4 ? manifest.renderMode : 'phaser'
}

export function isComponentManifestV4(
  manifest: ComponentManifest,
): manifest is ComponentManifestV4 {
  return manifest.schemaVersion === 4
}
