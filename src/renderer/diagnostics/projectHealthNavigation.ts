import { ensureScenePresentation } from '../../shared/presentation'
import type { ProjectHealthDiagnostic } from '../../shared/projectHealth'
import type { ProjectDocument } from '../../shared/projectTypes'
import type { EditingScope, SidebarTab } from '../store/editorStore'

export interface ProjectHealthRoute {
  scope: EditingScope
  tab: SidebarTab
  sceneId?: string
  stateId?: string | null
  nodeId?: string
}

function sceneContainingNode(project: ProjectDocument, nodeId: string) {
  return project.scenes.find((scene) => scene.nodes.some((node) => node.id === nodeId))
}

export function resolveProjectHealthRoute(
  project: ProjectDocument,
  diagnostic: ProjectHealthDiagnostic,
): ProjectHealthRoute {
  const globalNode = diagnostic.nodeId
    ? project.globalLayer.find((item) => item.node.id === diagnostic.nodeId)
    : undefined
  if (globalNode) {
    return {
      scope: 'global',
      tab: diagnostic.scope === 'interaction' ? 'automation' : 'properties',
      nodeId: globalNode.node.id,
    }
  }

  const containingScene = diagnostic.nodeId
    ? sceneContainingNode(project, diagnostic.nodeId)
    : undefined
  const scene = containingScene ?? project.scenes.find(
    (item) => item.id === diagnostic.sceneId,
  )
  const requestedState = scene && diagnostic.stateId &&
    ensureScenePresentation(scene).states.some((state) => state.id === diagnostic.stateId)
    ? diagnostic.stateId
    : null

  if (scene) {
    return {
      scope: 'scene',
      tab: diagnostic.scope === 'interaction' ? 'automation' : 'properties',
      sceneId: scene.id,
      stateId: requestedState,
      ...(diagnostic.nodeId && containingScene ? { nodeId: diagnostic.nodeId } : {}),
    }
  }

  if (diagnostic.scope === 'asset') return { scope: 'scene', tab: 'elements' }
  if (diagnostic.scope === 'component-package') return { scope: 'scene', tab: 'elements' }
  if (diagnostic.scope === 'interaction') return { scope: 'global', tab: 'automation' }
  return { scope: 'scene', tab: 'properties' }
}
