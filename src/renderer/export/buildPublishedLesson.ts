import { componentRenderMode } from '../../shared/componentCapabilities'
import { mergeComponentProps } from '../../shared/componentProps'
import type {
  ComponentManifest,
  ExportPayload,
} from '../../shared/componentTypes'
import { collectReferencedProjectAssetIds } from '../../shared/assetReferences'
import type {
  AssetMeta,
  SceneNode,
  SceneNodeOverride,
} from '../../shared/projectTypes'
import {
  PUBLISHED_LESSON_FORMAT,
  PUBLISHED_LESSON_VERSION,
  type PublishedComponent,
  type PublishedExecutableCode,
  type PublishedLessonPayload,
  type PublishedRuntimeDocument,
  type PublishedSceneNode,
} from '../../shared/publishedLessonTypes'
import type { RuntimeDocument } from '../../shared/runtimeTypes'
import { bytesToBase64 } from './base64'
import { assertExportPayloadDependencies } from './exportPayloadSupport'

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function encodePublishedCode(source: string): PublishedExecutableCode {
  const bytes = new Uint8Array(source.length * 2)
  for (let index = 0; index < source.length; index += 1) {
    const codeUnit = source.charCodeAt(index)
    bytes[index * 2] = codeUnit & 0xff
    bytes[index * 2 + 1] = codeUnit >>> 8
  }
  return {
    encoding: 'base64-utf16le',
    data: bytesToBase64(bytes),
  }
}

function publishRuntime(
  runtime: RuntimeDocument | undefined,
): PublishedRuntimeDocument | undefined {
  if (!runtime?.enabled) return undefined
  return {
    apiVersion: runtime.runtimeApiVersion,
    renderMode: runtime.renderMode,
    code: encodePublishedCode(runtime.source),
    content: cloneJson(runtime.content.values),
    assets: cloneJson(runtime.assets),
    ...(runtime.nodeBindings
      ? { nodeBindings: cloneJson(runtime.nodeBindings) }
      : {}),
    ...(runtime.staticFallback
      ? { staticFallback: cloneJson(runtime.staticFallback) }
      : {}),
  }
}

function componentKey(packageId: string, version: string): string {
  return `${packageId}@${version}`
}

function findComponent(
  payload: ExportPayload,
  packageId: string,
  version: string,
): ExportPayload['components'][string] {
  const component =
    payload.components[componentKey(packageId, version)] ??
    payload.components[packageId] ??
    Object.values(payload.components).find(
      ({ manifest }) =>
        manifest.id === packageId && manifest.version === version,
    )
  if (!component) {
    throw new Error(`组件包“${componentKey(packageId, version)}”未完整打入发布内容`)
  }
  return component
}

/**
 * Runtime project-asset closure for PublishedLesson. Component package assets
 * are handled separately and remain scoped to each used component.
 */
export function collectPublishedProjectAssetIds(
  payload: ExportPayload,
): Set<string> {
  return new Set(collectReferencedProjectAssetIds(payload.project, {
    componentPackages: payload.components,
    includeDisabledRuntimes: false,
  }))
}

function findProjectAssetEntry(
  payload: ExportPayload,
  assetId: string,
): readonly [string, AssetMeta] | undefined {
  const direct = payload.project.assets[assetId]
  if (direct) return [assetId, direct]
  return Object.entries(payload.project.assets).find(
    ([, meta]) => meta.id === assetId,
  )
}

function findPayloadAsset(
  payload: ExportPayload,
  assetId: string,
): ExportPayload['assets'][string] | undefined {
  const direct = payload.assets[assetId]
  if (direct) return direct
  const entry = findProjectAssetEntry(payload, assetId)
  return entry
    ? payload.assets[entry[0]] ?? payload.assets[entry[1].id]
    : undefined
}

function assertPublishedAssetDependencies(
  payload: ExportPayload,
  assetIds: ReadonlySet<string>,
): void {
  for (const assetId of assetIds) {
    const entry = findProjectAssetEntry(payload, assetId)
    if (!entry) {
      throw new Error(`发布内容引用的工程素材“${assetId}”不存在`)
    }
    if (!findPayloadAsset(payload, assetId)) {
      throw new Error(
        `工程素材“${entry[1].filename}”未完整打入发布内容`,
      )
    }
  }
}

function publishNode(
  payload: ExportPayload,
  sourceNode: SceneNode,
): PublishedSceneNode {
  const node = cloneJson(sourceNode) as unknown as Record<string, unknown>
  delete node.locked
  delete node.name
  if (sourceNode.type === 'external-component') {
    const component = findComponent(
      payload,
      sourceNode.component.packageId,
      sourceNode.component.version,
    )
    node.props = mergeComponentProps(
      component.manifest,
      sourceNode.props,
    )
  }
  return node as unknown as PublishedSceneNode
}

function publishOverride(
  source: SceneNodeOverride,
): SceneNodeOverride {
  const override = cloneJson(source) as unknown as Record<string, unknown>
  delete override.locked
  delete override.name
  return override as unknown as SceneNodeOverride
}

function publishComponent(
  component: ExportPayload['components'][string],
  contentSha256: string,
): PublishedComponent {
  return {
    id: component.manifest.id,
    name: component.manifest.name,
    version: component.manifest.version,
    contentSha256,
    apiVersion: component.manifest.runtimeApiVersion,
    scopes: cloneJson(component.manifest.supportedScopes),
    renderMode: componentRenderMode(component.manifest),
    code: encodePublishedCode(component.runtimeSource),
    assets: Object.fromEntries(
      Object.entries(component.assets).map(([assetKey, asset]) => [
        assetKey,
        { mimeType: asset.mimeType, url: asset.dataUrl },
      ]),
    ),
  }
}

export function collectPublishedComponentKeys(
  payload: Pick<ExportPayload, 'project'>,
): Set<string> {
  const keys = new Set<string>()
  const visit = (node: SceneNode): void => {
    if (node.type === 'external-component') {
      keys.add(componentKey(node.component.packageId, node.component.version))
    }
  }
  payload.project.scenes.forEach((scene) => scene.nodes.forEach(visit))
  payload.project.globalLayer.forEach((item) => visit(item.node))
  return keys
}

/**
 * Compile the authoring payload into the one-way PublishedLesson V1 player
 * input. Encoding executable code is only a packaging measure, not DRM.
 */
export function buildPublishedLessonPayload(
  payload: ExportPayload,
): PublishedLessonPayload {
  assertExportPayloadDependencies(payload, {
    requireAllProjectResources: false,
    includeDisabledRuntimes: false,
  })
  const usedComponents = collectPublishedComponentKeys(payload)
  const usedProjectAssets = collectPublishedProjectAssetIds(payload)
  assertPublishedAssetDependencies(payload, usedProjectAssets)
  const publishedComponents: PublishedLessonPayload['components'] = {}
  for (const usedKey of usedComponents) {
    const separator = usedKey.lastIndexOf('@')
    const packageId = usedKey.slice(0, separator)
    const version = usedKey.slice(separator + 1)
    const source = findComponent(payload, packageId, version)
    const embedded = Object.values(payload.project.componentPackages).find(
      (metadata) => metadata.packageId === packageId && metadata.version === version,
    )
    if (!embedded) {
      throw new Error(`组件包“${usedKey}”缺少工程内容哈希`)
    }
    publishedComponents[usedKey] = publishComponent(
      source,
      embedded.contentSha256,
    )
  }
  const globalRuntime = publishRuntime(payload.project.globalRuntime)

  return {
    format: PUBLISHED_LESSON_FORMAT,
    formatVersion: PUBLISHED_LESSON_VERSION,
    title: payload.project.title,
    canvas: cloneJson(payload.project.canvas),
    scenes: payload.project.scenes.map((scene) => {
      const runtime = publishRuntime(scene.runtime)
      return {
        id: scene.id,
        name: scene.name,
        backgroundColor: scene.backgroundColor,
        ...(scene.backgroundAssetId !== undefined
          ? { backgroundAssetId: scene.backgroundAssetId }
          : {}),
        nodes: scene.nodes.map((node) => publishNode(payload, node)),
        ...(scene.presentation
          ? {
              presentation: {
                initialStateId: scene.presentation.initialStateId,
                states: scene.presentation.states.map((state) => ({
                  id: state.id,
                  name: state.name,
                  ...(state.backgroundColor !== undefined
                    ? { backgroundColor: state.backgroundColor }
                    : {}),
                  ...(state.backgroundAssetId !== undefined
                    ? { backgroundAssetId: state.backgroundAssetId }
                    : {}),
                  nodeOverrides: Object.fromEntries(
                    Object.entries(state.nodeOverrides).map(([nodeId, override]) => [
                      nodeId,
                      publishOverride(override),
                    ]),
                  ),
                  ...(state.nodeOrder
                    ? { nodeOrder: cloneJson(state.nodeOrder) }
                    : {}),
                })),
              },
            }
          : {}),
        ...(runtime ? { runtime } : {}),
        interactions: cloneJson(scene.interactions),
      }
    }),
    assets: Object.fromEntries([...usedProjectAssets].map((assetId) => {
      const asset = findPayloadAsset(payload, assetId)!
      return [
        assetId,
        { mimeType: asset.mimeType, url: asset.dataUrl },
      ]
    })),
    components: publishedComponents,
    ...(globalRuntime ? { globalRuntime } : {}),
    globalLayer: payload.project.globalLayer.map((item) => ({
      node: publishNode(payload, item.node),
      layer: item.layer,
      visibility: cloneJson(item.visibility),
    })),
    globalInteractions: cloneJson(payload.project.globalInteractions),
    media: cloneJson(payload.project.media),
    playback: cloneJson(payload.project.playback),
  }
}

export function isPublishedLessonPayload(
  value: unknown,
): value is PublishedLessonPayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<PublishedLessonPayload>
  return (
    candidate.format === PUBLISHED_LESSON_FORMAT &&
    candidate.formatVersion === PUBLISHED_LESSON_VERSION
  )
}
