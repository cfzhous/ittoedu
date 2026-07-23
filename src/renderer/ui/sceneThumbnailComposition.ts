import type {
  GlobalLayerItem,
  SceneDocument,
  SceneNode,
} from '../../shared/projectTypes'
import type {
  RuntimeDocument,
  RuntimeScope,
  RuntimeStaticFallback,
} from '../../shared/runtimeTypes'

export type SceneThumbnailCompositionEntry =
  | {
      kind: 'node'
      scope: RuntimeScope
      node: SceneNode
    }
  | {
      kind: 'runtime-fallback'
      scope: RuntimeScope
      fallback: RuntimeStaticFallback
    }

function isVisibleForScene(item: GlobalLayerItem, sceneId: string): boolean {
  if (item.visibility.mode === 'all') return true
  const listed = item.visibility.sceneIds.includes(sceneId)
  return item.visibility.mode === 'include' ? listed : !listed
}

function fallbackEntry(
  scope: RuntimeScope,
  runtime: RuntimeDocument | undefined,
  layer: RuntimeStaticFallback['layer'],
): SceneThumbnailCompositionEntry[] {
  if (!runtime?.enabled || runtime.staticFallback?.layer !== layer) return []
  return [{
    kind: 'runtime-fallback',
    scope,
    fallback: runtime.staticFallback,
  }]
}

/**
 * Mirrors the Player's visual root order without executing author JavaScript:
 * background -> global underlay -> scene underlay -> scene nodes -> scene
 * overlay -> global overlay. Global runtime roots mount after authored global
 * nodes inside their respective global roots.
 */
export function buildSceneThumbnailComposition(
  scene: SceneDocument,
  globalLayer: readonly GlobalLayerItem[],
  globalRuntime: RuntimeDocument | undefined,
): SceneThumbnailCompositionEntry[] {
  const visibleGlobal = globalLayer.filter(
    (item) => item.node.visible && isVisibleForScene(item, scene.id),
  )
  return [
    ...visibleGlobal
      .filter((item) => item.layer === 'underlay')
      .map((item) => ({
        kind: 'node' as const,
        scope: 'global' as const,
        node: item.node,
      })),
    ...fallbackEntry('global', globalRuntime, 'underlay'),
    ...fallbackEntry('scene', scene.runtime, 'underlay'),
    ...scene.nodes
      .filter((node) => node.visible)
      .map((node) => ({
        kind: 'node' as const,
        scope: 'scene' as const,
        node,
      })),
    ...fallbackEntry('scene', scene.runtime, 'overlay'),
    ...visibleGlobal
      .filter((item) => item.layer === 'overlay')
      .map((item) => ({
        kind: 'node' as const,
        scope: 'global' as const,
        node: item.node,
      })),
    ...fallbackEntry('global', globalRuntime, 'overlay'),
  ]
}

export function hasUnrepresentedRuntime(
  scene: Pick<SceneDocument, 'runtime'>,
  globalRuntime: RuntimeDocument | undefined,
): boolean {
  return [globalRuntime, scene.runtime].some(
    (runtime) => runtime?.enabled === true && !runtime.staticFallback,
  )
}

export function hasEnabledRuntime(
  scene: Pick<SceneDocument, 'runtime'>,
  globalRuntime: RuntimeDocument | undefined,
): boolean {
  return globalRuntime?.enabled === true || scene.runtime?.enabled === true
}
