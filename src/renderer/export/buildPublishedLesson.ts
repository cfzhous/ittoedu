import { componentRenderMode } from '../../shared/componentCapabilities'
import {
  getComponentPropValue,
  mergeComponentProps,
} from '../../shared/componentProps'
import type {
  ComponentManifest,
  ExportPayload,
} from '../../shared/componentTypes'
import { materializeScene } from '../../shared/presentation'
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
import { assertV3ExportDependencies } from './v3ExportSupport'

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

function addAssetId(target: Set<string>, assetId: string | null | undefined): void {
  if (assetId) target.add(assetId)
}

function decodeSourceEscape(source: string, index: number): {
  value: string
  nextIndex: number
} {
  const escaped = source[index + 1]
  if (escaped === undefined) return { value: '', nextIndex: index + 1 }
  const simple: Readonly<Record<string, string>> = {
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    0: '\0',
  }
  if (escaped in simple) {
    return { value: simple[escaped]!, nextIndex: index + 2 }
  }
  if (escaped === '\n') return { value: '', nextIndex: index + 2 }
  if (escaped === '\r') {
    return {
      value: '',
      nextIndex: source[index + 2] === '\n' ? index + 3 : index + 2,
    }
  }
  if (escaped === 'x') {
    const hex = source.slice(index + 2, index + 4)
    if (/^[\da-f]{2}$/i.test(hex)) {
      return {
        value: String.fromCharCode(Number.parseInt(hex, 16)),
        nextIndex: index + 4,
      }
    }
  }
  if (escaped === 'u') {
    const hex = source.slice(index + 2, index + 6)
    if (/^[\da-f]{4}$/i.test(hex)) {
      return {
        value: String.fromCharCode(Number.parseInt(hex, 16)),
        nextIndex: index + 6,
      }
    }
  }
  return { value: escaped, nextIndex: index + 2 }
}

/**
 * Conservative compatibility pass for legacy projectUrl/projectAssetUrl calls.
 * It scans quoted literals once, avoiding an O(asset-count × source-size) pass.
 */
function addSourceAssetLiteralIds(
  source: string,
  knownAssetIds: ReadonlySet<string>,
  target: Set<string>,
): void {
  let index = 0
  while (index < source.length) {
    const quote = source[index]
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      index += 1
      continue
    }
    let value = ''
    index += 1
    while (index < source.length) {
      const character = source[index]!
      if (character === quote) {
        index += 1
        if (knownAssetIds.has(value)) target.add(value)
        break
      }
      if (character === '\\') {
        const decoded = decodeSourceEscape(source, index)
        value += decoded.value
        index = decoded.nextIndex
        continue
      }
      value += character
      index += 1
    }
  }
}

function addKnownAssetValues(
  value: unknown,
  knownAssetIds: ReadonlySet<string>,
  target: Set<string>,
): void {
  if (typeof value === 'string') {
    if (knownAssetIds.has(value)) target.add(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => addKnownAssetValues(item, knownAssetIds, target))
    return
  }
  if (typeof value !== 'object' || value === null) return
  Object.values(value).forEach((item) =>
    addKnownAssetValues(item, knownAssetIds, target),
  )
}

function addRuntimeAssetIds(
  target: Set<string>,
  runtime: RuntimeDocument | undefined,
  knownAssetIds: ReadonlySet<string>,
): void {
  if (!runtime?.enabled) return
  for (const binding of Object.values(runtime.assets)) {
    addAssetId(target, binding.assetId)
  }
  addAssetId(target, runtime.staticFallback?.assetId)
  addKnownAssetValues(runtime.content.values, knownAssetIds, target)
  addSourceAssetLiteralIds(runtime.source, knownAssetIds, target)
}

function addComponentProjectAssetIds(
  payload: ExportPayload,
  node: Extract<SceneNode, { type: 'external-component' }>,
  target: Set<string>,
  knownAssetIds: ReadonlySet<string>,
  componentSourceAssets: Map<string, ReadonlySet<string>>,
): void {
  const component = findComponent(
    payload,
    node.component.packageId,
    node.component.version,
  )
  const effectiveProps = mergeComponentProps(component.manifest, node.props)
  addKnownAssetValues(effectiveProps, knownAssetIds, target)
  if (component.manifest.schemaVersion !== 1) {
    for (const property of component.manifest.editor?.properties ?? []) {
      if (property.type !== 'image') continue
      const value = getComponentPropValue(effectiveProps, property.key)
      if (typeof value === 'string') addAssetId(target, value)
    }
  }
  const key = componentKey(
    node.component.packageId,
    node.component.version,
  )
  let sourceAssets = componentSourceAssets.get(key)
  if (!sourceAssets) {
    const collected = new Set<string>()
    addSourceAssetLiteralIds(
      component.runtimeSource,
      knownAssetIds,
      collected,
    )
    sourceAssets = collected
    componentSourceAssets.set(key, sourceAssets)
  }
  sourceAssets.forEach((assetId) => target.add(assetId))
}

function addNodeAssetIds(
  payload: ExportPayload,
  node: SceneNode,
  target: Set<string>,
  knownAssetIds: ReadonlySet<string>,
  componentSourceAssets: Map<string, ReadonlySet<string>>,
): void {
  if (node.type === 'image') {
    addAssetId(target, node.assetId)
    return
  }
  if (node.type === 'video') {
    addAssetId(target, node.assetId)
    if (node.poster.mode === 'image') addAssetId(target, node.poster.assetId)
    return
  }
  if (node.type === 'external-component') {
    addComponentProjectAssetIds(
      payload,
      node,
      target,
      knownAssetIds,
      componentSourceAssets,
    )
  }
}

/**
 * Runtime project-asset closure for PublishedLesson. Component package assets
 * are handled separately and remain scoped to each used component.
 */
export function collectPublishedProjectAssetIds(
  payload: ExportPayload,
): Set<string> {
  const assetIds = new Set<string>()
  const { project } = payload
  const knownAssetIds = new Set(
    Object.values(project.assets).map((asset) => asset.id),
  )
  const componentSourceAssets = new Map<string, ReadonlySet<string>>()

  addRuntimeAssetIds(assetIds, project.globalRuntime, knownAssetIds)
  for (const sound of Object.values(project.media.audio.sounds)) {
    addAssetId(assetIds, sound.assetId)
  }
  for (const item of project.globalLayer) {
    addNodeAssetIds(
      payload,
      item.node,
      assetIds,
      knownAssetIds,
      componentSourceAssets,
    )
  }

  for (const scene of project.scenes) {
    addAssetId(assetIds, scene.backgroundAssetId)
    scene.nodes.forEach((node) =>
      addNodeAssetIds(
        payload,
        node,
        assetIds,
        knownAssetIds,
        componentSourceAssets,
      ),
    )
    addRuntimeAssetIds(assetIds, scene.runtime, knownAssetIds)
    for (const state of scene.presentation?.states ?? []) {
      const materialized = materializeScene(scene, state.id)
      addAssetId(assetIds, materialized.backgroundAssetId)
      materialized.nodes.forEach((node) =>
        addNodeAssetIds(
          payload,
          node,
          assetIds,
          knownAssetIds,
          componentSourceAssets,
        ),
      )
    }
  }

  return assetIds
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

function componentScopes(manifest: ComponentManifest): PublishedComponent['scopes'] {
  return manifest.schemaVersion === 1 || manifest.schemaVersion === 2
    ? ['scene']
    : cloneJson(manifest.supportedScopes)
}

function publishComponent(
  component: ExportPayload['components'][string],
): PublishedComponent {
  return {
    id: component.manifest.id,
    name: component.manifest.name,
    version: component.manifest.version,
    apiVersion: component.manifest.runtimeApiVersion,
    scopes: componentScopes(component.manifest),
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
  assertV3ExportDependencies(payload, {
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
    publishedComponents[usedKey] = publishComponent(source)
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
