import type { ScopedLayerItem } from '../../shared/courseProjectTypes'
import type {
  AssetMeta,
  GlobalLayerItem,
  SceneNode,
} from '../../shared/projectTypes'

export interface SlidePreviewNodeIdentity {
  readonly id: string
  readonly type: SceneNode['type']
  readonly componentId?: string
  readonly componentVersion?: string
}

export interface SlidePreviewRebuildScene {
  readonly id: string
  readonly nodes: readonly SlidePreviewIdentityNode[]
  readonly presentation?: {
    readonly states: readonly { readonly id: string }[]
  }
  readonly runtime?: unknown
}

export type SlidePreviewIdentityNode = Pick<SceneNode, 'id' | 'type'> & {
  readonly component?: {
    readonly packageId: string
    readonly version: string
  }
}

export type SlidePreviewPackageRecord = Record<string, {
  readonly manifest?: { readonly id: string; readonly version: string }
  readonly packageId?: string
  readonly version?: string
}>

export interface SlidePreviewRebuildGlobalItem {
  readonly node: SlidePreviewIdentityNode
  readonly layer: GlobalLayerItem['layer'] | string
  readonly visibility: unknown
}

export interface SlidePreviewRebuildKeyInput {
  readonly canvasMode: string
  readonly editingScope: string
  readonly activePresentationStateId: string | null | undefined
  readonly scene: SlidePreviewRebuildScene
  readonly scenes: readonly SlidePreviewRebuildScene[]
  readonly globalLayer: readonly SlidePreviewRebuildGlobalItem[]
  readonly globalRuntime: unknown
  readonly assets: Record<string, Pick<AssetMeta, 'id' | 'kind' | 'byteLength' | 'path'>>
  readonly candidateGlobals: readonly ScopedLayerItem[] | null
  readonly candidateAssets: Record<
    string,
    Pick<AssetMeta, 'id' | 'kind' | 'byteLength' | 'path'>
  > | null
  readonly sidecarFileIds: readonly string[]
  readonly componentPackages: SlidePreviewPackageRecord
}

export function slidePreviewNodeIdentity(
  node: SlidePreviewIdentityNode,
): SlidePreviewNodeIdentity {
  if (node.type === 'external-component' && node.component) {
    return {
      id: node.id,
      type: node.type,
      componentId: node.component.packageId,
      componentVersion: node.component.version,
    }
  }
  return { id: node.id, type: node.type }
}

export function slidePreviewComponentPackageFingerprint(
  packages: SlidePreviewPackageRecord,
): readonly string[] {
  return Object.entries(packages)
    .map(([key, value]) => {
      if ('manifest' in value && value.manifest) {
        return `${value.manifest.id}@${value.manifest.version}`
      }
      if ('packageId' in value && 'version' in value) {
        return `${value.packageId}@${value.version}`
      }
      return `${key}@`
    })
    .sort()
}

function assetFingerprint(
  assets: Record<string, Pick<AssetMeta, 'id' | 'kind' | 'byteLength' | 'path'>>,
): readonly { id: string; kind: string; byteLength: number; path: string }[] {
  return Object.keys(assets)
    .sort()
    .map((key) => {
      const asset = assets[key]
      return {
        id: asset?.id ?? key,
        kind: asset?.kind ?? '',
        byteLength: asset?.byteLength ?? 0,
        path: asset?.path ?? '',
      }
    })
}

function sceneStructure(scene: SlidePreviewRebuildScene) {
  return {
    id: scene.id,
    nodes: scene.nodes.map(slidePreviewNodeIdentity),
    stateIds: scene.presentation?.states.map((state) => state.id) ?? [],
    runtime: scene.runtime ?? null,
  }
}

function candidateGlobalStructure(entry: ScopedLayerItem) {
  return {
    id: entry.item.layerItemId,
    type: entry.item.kind === 'native' ? entry.item.content.nativeType : entry.item.kind,
    visible: entry.item.visible,
    visibility: entry.visibility,
  }
}

function v8GlobalStructure(item: SlidePreviewRebuildGlobalItem) {
  return {
    ...slidePreviewNodeIdentity(item.node),
    layer: item.layer,
    visibility: item.visibility,
  }
}

/**
 * Structural identity for the Slide isolated Player. Same scene/global/asset/
 * package set must yield the same string even when `project`,
 * `componentPackages`, or `assetFiles` are new object identities.
 */
export function buildSlidePreviewRebuildKey(
  input: SlidePreviewRebuildKeyInput,
): string {
  const sidecar = [...input.sidecarFileIds].sort()
  const packages = slidePreviewComponentPackageFingerprint(input.componentPackages)
  const assets = assetFingerprint(input.candidateAssets ?? input.assets)
  const globalStructure = input.candidateGlobals
    ? input.candidateGlobals.map(candidateGlobalStructure)
    : input.globalLayer.map(v8GlobalStructure)

  if (input.canvasMode === 'run') {
    return JSON.stringify({
      mode: input.canvasMode,
      currentSceneId: input.scene.id,
      scenes: input.scenes.map(sceneStructure),
      globalStructure,
      globalRuntime: input.globalRuntime ?? null,
      assets,
      sidecar,
      componentPackages: packages,
    })
  }

  return JSON.stringify({
    mode: input.canvasMode,
    authoringContext: [
      input.scene.id,
      input.activePresentationStateId ?? null,
    ],
    sceneStructure: sceneStructure(input.scene),
    globalStructure,
    globalRuntime: input.globalRuntime ?? null,
    assets,
    sidecar,
    componentPackages: packages,
  })
}

export function sidecarFileIdsFrom(
  candidateSidecarFiles: Record<string, unknown> | null | undefined,
  assetFiles: Record<string, unknown>,
): string[] {
  return Object.keys(candidateSidecarFiles ?? assetFiles)
}
