import type {
  ComponentLayerItem,
  LayerItem,
  LayerItemOverride,
  NativeLayerItem,
  SlideSurfaceDocument,
} from '../../shared/courseProjectTypes'
import type { SceneDocument, SceneNode, SceneNodeOverride } from '../../shared/projectTypes'
import {
  buildSlideEditorView,
  type SlideCandidateBackend,
} from '../course/v9SlideVerticalSlice'

const NATIVE_NODE_TYPES = new Set([
  'text',
  'formula',
  'image',
  'video',
  'shape',
  'teacher-controller',
])

function slideSurface(
  backend: SlideCandidateBackend,
): SlideSurfaceDocument | null {
  const snapshot = backend.getSnapshot()
  const surface = backend.getSession().history.present.surfaces.find(
    (candidate) => candidate.id === snapshot.surfaceId,
  )
  return surface?.type === 'slide' ? surface : null
}

function locationIdForScene(
  backend: SlideCandidateBackend,
  sceneId: string,
): string | null {
  const snapshot = backend.getSnapshot()
  const location = backend.getSession().history.present.locations.find((candidate) => (
    candidate.kind === 'slide-scene' &&
    candidate.surfaceId === snapshot.surfaceId &&
    candidate.sceneId === sceneId
  ))
  return location?.id ?? null
}

export function courseLayerItemToSceneNode(item: LayerItem): SceneNode | null {
  const base = {
    id: item.layerItemId,
    name: item.label,
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
    opacity: item.opacity,
    visible: item.visible,
    locked: item.locked,
    playbackInitialVisibility: item.playbackInitialVisibility,
  }
  if (item.kind === 'component') {
    const component = item as ComponentLayerItem
    return {
      ...base,
      type: 'external-component',
      component: structuredClone(component.component),
      props: structuredClone(component.props),
    }
  }
  if (item.kind !== 'native') return null
  const native = item as NativeLayerItem
  if (!NATIVE_NODE_TYPES.has(native.content.nativeType)) return null
  return {
    ...base,
    type: native.content.nativeType,
    ...structuredClone(native.content.data),
  } as SceneNode
}

function layerItemOverrideToNodeOverride(
  override: LayerItemOverride,
): SceneNodeOverride {
  const next: Record<string, unknown> = {}
  if (override.label !== undefined) next.name = override.label
  if (override.frame?.x !== undefined) next.x = override.frame.x
  if (override.frame?.y !== undefined) next.y = override.frame.y
  if (override.frame?.width !== undefined) next.width = override.frame.width
  if (override.frame?.height !== undefined) next.height = override.frame.height
  if (override.rotation !== undefined) next.rotation = override.rotation
  if (override.opacity !== undefined) next.opacity = override.opacity
  if (override.visible !== undefined) next.visible = override.visible
  if (override.locked !== undefined) next.locked = override.locked
  if (override.playbackInitialVisibility !== undefined) {
    next.playbackInitialVisibility = override.playbackInitialVisibility
  }
  if (override.nativeData) Object.assign(next, structuredClone(override.nativeData))
  if (override.componentProps) next.props = structuredClone(override.componentProps)
  return next as SceneNodeOverride
}

export function projectV9EditingNodes(backend: SlideCandidateBackend): SceneNode[] {
  const session = backend.getSession()
  const view = buildSlideEditorView({
    project: session.history.present,
    locationId: session.selection.locationId,
    stateId: session.selection.stateId,
  })
  return view.layers.flatMap((layer) => {
    if (layer.source !== session.scope) return []
    const node = courseLayerItemToSceneNode(layer.item as LayerItem)
    return node ? [node] : []
  })
}

export function projectV9SceneDocument(
  backend: SlideCandidateBackend,
  sceneId: string,
): SceneDocument | null {
  const surface = slideSurface(backend)
  const scene = surface?.scenes.find((candidate) => candidate.id === sceneId)
  const locationId = locationIdForScene(backend, sceneId)
  if (!surface || !scene || !locationId) return null
  return {
    id: scene.id,
    name: scene.name,
    backgroundColor: scene.backgroundColor,
    backgroundAssetId: scene.backgroundAssetId,
    nodes: scene.layerItems.flatMap((item) => {
      const node = courseLayerItemToSceneNode(item)
      return node ? [node] : []
    }),
    interactions: structuredClone(scene.interactions),
    ...(scene.presentation
      ? {
          presentation: {
            initialStateId: scene.presentation.initialStateId,
            thumbnailStateId: scene.presentation.thumbnailStateId,
            states: scene.presentation.states.map((state) => ({
              id: state.id,
              name: state.name,
              ...(state.description === undefined ? {} : { description: state.description }),
              ...(state.backgroundColor === undefined
                ? {}
                : { backgroundColor: state.backgroundColor }),
              ...(state.backgroundAssetId === undefined
                ? {}
                : { backgroundAssetId: state.backgroundAssetId }),
              nodeOverrides: Object.fromEntries(
                Object.entries(state.layerItemOverrides).map(([id, override]) => [
                  id,
                  layerItemOverrideToNodeOverride(override),
                ]),
              ),
              ...(state.layerItemOrder
                ? { nodeOrder: [...state.layerItemOrder] }
                : {}),
            })),
          },
        }
      : {}),
  }
}

export function projectV9ActiveScene(backend: SlideCandidateBackend): SceneDocument | null {
  return projectV9SceneDocument(backend, backend.getSnapshot().sceneId)
}

export function projectV9SlideScenes(backend: SlideCandidateBackend): SceneDocument[] {
  const surface = slideSurface(backend)
  if (!surface) return []
  return surface.scenes.flatMap((scene) => {
    const projected = projectV9SceneDocument(backend, scene.id)
    return projected ? [projected] : []
  })
}
