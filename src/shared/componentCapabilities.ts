import type {
  ComponentManifest,
  ComponentRenderMode,
  ComponentScope,
} from './componentTypes'

export function componentSupportsScope(
  manifest: ComponentManifest,
  scope: ComponentScope,
): boolean {
  return manifest.supportedScopes.includes(scope)
}

export function componentUsesRecursiveContent(
  _manifest: ComponentManifest,
): boolean {
  return true
}

export function componentRenderMode(
  manifest: ComponentManifest,
): ComponentRenderMode {
  return manifest.renderMode
}
