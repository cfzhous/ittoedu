import type { ProjectDocument, SceneDocument, SceneNode } from '../shared/projectTypes'
import { ensureScenePresentation, materializeScene } from '../shared/presentation'

function nodeImageAssetIds(nodes: readonly SceneNode[]): string[] {
  const ids = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'image') ids.add(node.assetId)
    if (node.type === 'video' && node.poster.mode === 'image' && node.poster.assetId) {
      ids.add(node.poster.assetId)
    }
  }
  return [...ids]
}

/** Native Phaser textures needed to render one scene. Component project assets
 * are resolved directly through ctx.projectAssetUrl() and do not belong here. */
export function sceneNativeAssetIds(scene: SceneDocument): string[] {
  const ids = new Set<string>()
  if (scene.backgroundAssetId) ids.add(scene.backgroundAssetId)
  for (const assetId of nodeImageAssetIds(scene.nodes)) ids.add(assetId)
  const presentation = ensureScenePresentation(scene)
  for (const state of presentation.states) {
    const materialized = materializeScene(scene, state.id)
    if (materialized.backgroundAssetId) ids.add(materialized.backgroundAssetId)
    for (const assetId of nodeImageAssetIds(materialized.nodes)) ids.add(assetId)
  }
  return [...ids]
}

/** Native images mounted once in the persistent project-level master layer. */
export function globalLayerNativeAssetIds(
  project: Pick<ProjectDocument, 'globalLayer'>,
): string[] {
  return nodeImageAssetIds(project.globalLayer.map((item) => item.node))
}
