import { strToU8, unzip, unzipSync, zip, zipSync } from 'fflate'
import {
  projectDocumentSchema,
} from '@/shared/projectSchema'
import { PROJECT_SCHEMA_VERSION } from '@/shared/constants'
import { UserFacingError } from '@/shared/errors'
import type {
  EmbeddedComponentPackageMeta,
  ProjectDocument,
} from '@/shared/projectTypes'
import type { RuntimeDocument } from '@/shared/runtimeTypes'
import { ensureScenePresentation, materializeScene } from '@/shared/presentation'
import {
  isAudioInteractionAction,
  isVideoInteractionAction,
} from '@/shared/interactionTypes'
import { parseComponentPackageFiles } from '@/renderer/components/importComponentPackage'
import {
  analyzeProjectAssetReferences,
  type ComponentAssetReferenceContext,
} from '@/shared/assetReferences'
import {
  assertSafeArchivePath,
  componentArchiveRoot,
  componentPackageKey,
  isArchiveDirectory,
} from './archivePath'

const PROJECT_DOCUMENT_PATH = 'project.json'
const MAX_PROJECT_UNCOMPRESSED_BYTES = 512 * 1024 * 1024

export interface ProjectArchiveData {
  project: ProjectDocument
  /** Binary asset data keyed by AssetMeta.id. */
  assetFiles: Record<string, Uint8Array>
  /**
   * Component files keyed by `${packageId}@${version}`. Inner keys are paths
   * relative to the root of the original .h5component package.
   */
  componentFiles: Record<string, Record<string, Uint8Array>>
}

export interface CreateProjectArchiveOptions {
  /** Optional deterministic ZIP timestamp, primarily used by artifact builders. */
  mtime?: Date | string | number
  /** Allows autosave callers to cancel an obsolete background compression. */
  signal?: AbortSignal
}

function projectOpenError(message: string, cause?: unknown): UserFacingError {
  return new UserFacingError(
    '工程文件损坏',
    message,
    '请重新选择有效的 .h5lesson 文件，或从备份恢复工程。',
    { cause },
  )
}

function projectSaveError(message: string, cause?: unknown): UserFacingError {
  return new UserFacingError(
    '工程保存失败',
    message,
    '请检查工程内容后重试；如问题持续，请另存为新文件。',
    { cause },
  )
}

function readProjectDocument(bytes: Uint8Array): ProjectDocument {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch (error) {
    throw projectOpenError('project.json 不是有效的 UTF-8 JSON 文件。', error)
  }

  if (typeof value === 'object' && value !== null) {
    const schemaVersion = Reflect.get(value, 'schemaVersion')
    if (
      typeof schemaVersion === 'number' &&
      Number.isInteger(schemaVersion) &&
      schemaVersion !== PROJECT_SCHEMA_VERSION
    ) {
      if (schemaVersion < PROJECT_SCHEMA_VERSION && schemaVersion >= 1) {
        throw new UserFacingError(
          '旧工程格式不受支持',
          `该工程使用 Project V${schemaVersion}，内部正式版只接受 Project V${PROJECT_SCHEMA_VERSION}，不会自动迁移旧工程。`,
          '请使用对应的旧版编辑器打开，或使用单独的离线转换工具生成 Project V8。',
        )
      }
      throw new UserFacingError(
        '工程格式版本不支持',
        `该工程使用格式版本 ${schemaVersion}，当前编辑器仅支持版本 ${PROJECT_SCHEMA_VERSION}。`,
        '请升级编辑器后再打开，或使用原编辑器导出兼容版本。',
      )
    }
  }

  try {
    return projectDocumentSchema.parse(value)
  } catch (error) {
    const result = projectDocumentSchema.safeParse(value)
    const issue = result.success ? undefined : result.error.issues[0]
    const location = issue?.path.join('.') || 'project'
    throw projectOpenError(
      `project.json 校验失败：${location} ${issue?.message ?? '字段无效'}。`,
      error,
    )
  }
}

function validateProjectForSave(project: ProjectDocument): ProjectDocument {
  const result = projectDocumentSchema.safeParse(project)
  if (!result.success) {
    const issue = result.error.issues[0]
    const location = issue?.path.join('.') || 'project'
    throw projectSaveError(`工程数据校验失败：${location} ${issue?.message ?? '字段无效'}。`)
  }
  return result.data
}

function assertLeafFilename(filename: string, context: string, opening: boolean): void {
  if (
    filename.trim().length === 0 ||
    filename.includes('/') ||
    filename.includes('\\') ||
    /^[a-zA-Z]:/.test(filename)
  ) {
    const error = `${context} 包含绝对路径或无效文件名。`
    throw opening ? projectOpenError(error) : projectSaveError(error)
  }
}

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function validateAssetPath(path: string, opening: boolean): void {
  try {
    assertSafeArchivePath(path, 'project')
  } catch (error) {
    if (opening || !(error instanceof UserFacingError)) throw error
    throw projectSaveError(`素材路径“${path}”不安全。`, error)
  }
  if (!path.startsWith('assets/')) {
    const message = `素材路径“${path}”必须位于 assets/ 目录。`
    throw opening ? projectOpenError(message) : projectSaveError(message)
  }
}

function expectedComponentPaths(
  meta: EmbeddedComponentPackageMeta,
  manifestEntry: string,
  manifestThumbnail: string | undefined,
): { root: string; manifest: string; runtime: string; thumbnail?: string } {
  const root = componentArchiveRoot(meta.packageId, meta.version)
  return {
    root,
    manifest: `${root}/manifest.json`,
    runtime: `${root}/${manifestEntry}`,
    ...(manifestThumbnail === undefined
      ? {}
      : { thumbnail: `${root}/${manifestThumbnail}` }),
  }
}

function getComponentFilesForMetadata(
  componentFiles: Readonly<Record<string, Readonly<Record<string, Uint8Array>>>>,
  recordKey: string,
  meta: EmbeddedComponentPackageMeta,
): Readonly<Record<string, Uint8Array>> | undefined {
  const canonicalKey = componentPackageKey(meta.packageId, meta.version)
  return (
    componentFiles[canonicalKey] ??
    componentFiles[recordKey] ??
    componentFiles[meta.packageId]
  )
}

function validateEmbeddedMetadata(
  meta: EmbeddedComponentPackageMeta,
  recordKey: string,
  files: Readonly<Record<string, Uint8Array>>,
  opening: boolean,
): void {
  let parsed
  try {
    parsed = parseComponentPackageFiles(files, {
      expectedId: meta.packageId,
      expectedVersion: meta.version,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : '组件内容无效'
    const message = `工程内组件“${recordKey}”无效：${detail}`
    throw opening ? projectOpenError(message, error) : projectSaveError(message, error)
  }

  if (parsed.manifest.name !== meta.name) {
    const message = `组件“${recordKey}”的名称与 manifest.json 不一致。`
    throw opening ? projectOpenError(message) : projectSaveError(message)
  }

  const expected = expectedComponentPaths(
    meta,
    parsed.manifest.entry,
    parsed.manifest.thumbnail,
  )
  const invalidPaths =
    meta.manifestPath !== expected.manifest ||
    meta.runtimePath !== expected.runtime ||
    meta.thumbnailPath !== expected.thumbnail
  if (invalidPaths) {
    const message = `组件“${recordKey}”的嵌入路径与 manifest.json 不一致。`
    throw opening ? projectOpenError(message) : projectSaveError(message)
  }
}

function validateProjectReferences(
  project: ProjectDocument,
  opening: boolean,
  componentPackages?: Readonly<Record<string, ComponentAssetReferenceContext>>,
): void {
  const fail = (message: string): never => {
    throw opening ? projectOpenError(message) : projectSaveError(message)
  }
  const componentExists = (packageId: string, version: string): boolean =>
    Object.values(project.componentPackages).some(
      (meta) => meta.packageId === packageId && meta.version === version,
    )
  const assetReferenceAnalysis = analyzeProjectAssetReferences(project, {
    componentPackages,
  })
  for (const [assetId, references] of assetReferenceAnalysis.graph) {
    if (hasOwn(project.assets, assetId)) continue
    // Existing typed node/runtime validators below retain their precise,
    // author-facing messages. The shared graph closes the component image
    // property gap that cannot be validated without package context.
    const direct = references.find((reference) => (
      reference.certainty === 'direct' &&
      (reference.kind === 'component-prop' ||
        reference.kind === 'component-manifest-default')
    ))
    if (direct) {
      fail(`工程位置“${direct.path.join('.')}”引用了不存在的素材“${assetId}”。`)
    }
  }
  const validateRuntime = (
    runtime: RuntimeDocument | undefined,
    owner: string,
    availableNodeIds: ReadonlySet<string>,
  ): void => {
    if (!runtime) return
    for (const [bindingKey, binding] of Object.entries(runtime.assets)) {
      if (!hasOwn(project.assets, binding.assetId)) {
        fail(`${owner}运行时素材绑定“${bindingKey}”引用了不存在的素材“${binding.assetId}”。`)
      }
    }
    const fallbackAssetId = runtime.staticFallback?.assetId
    if (fallbackAssetId && !hasOwn(project.assets, fallbackAssetId)) {
      fail(`${owner}运行时的静态后备画面引用了不存在的素材“${fallbackAssetId}”。`)
    }
    for (const [bindingKey, nodeId] of Object.entries(runtime.nodeBindings ?? {})) {
      if (!availableNodeIds.has(nodeId)) {
        fail(`${owner}运行时节点绑定“${bindingKey}”引用了不存在的节点“${nodeId}”。`)
      }
    }
  }

  const sceneIds = new Set(project.scenes.map((scene) => scene.id))
  const scenesById = new Map(project.scenes.map((scene) => [scene.id, scene]))
  const soundIds = new Set(Object.keys(project.media.audio.sounds))
  const validateSceneDestination = (
    sceneId: string,
    targetStateId: string | undefined,
    owner: string,
  ): void => {
    const targetScene = scenesById.get(sceneId)
    if (!targetScene) {
      fail(`${owner}要跳转到不存在的场景“${sceneId}”。`)
      return
    }
    if (
      targetStateId &&
      !ensureScenePresentation(targetScene).states.some(
        (state) => state.id === targetStateId,
      )
    ) {
      fail(`${owner}要进入场景“${targetScene.name}”中不存在的状态“${targetStateId}”。`)
    }
  }
  const globalNodeIds = new Set(
    project.globalLayer.map((item) => item.node.id),
  )
  const globalNodeById = new Map(
    project.globalLayer.map((item) => [item.node.id, item.node]),
  )
  const globalMotionActionIds = new Set(
    project.globalInteractions.flatMap((rule) => rule.actions
      .filter((step) => step.action.type === 'node.enter' || step.action.type === 'node.exit')
      .map((step) => step.id)),
  )
  validateRuntime(project.globalRuntime, '全局', globalNodeIds)

  for (const [index, item] of project.globalLayer.entries()) {
    const { node } = item
    if (node.type === 'image' && !hasOwn(project.assets, node.assetId)) {
      fail(`全局元素 ${index + 1} 引用了不存在的图片素材“${node.assetId}”。`)
    }
    if (node.type === 'video') {
      if (!hasOwn(project.assets, node.assetId)) {
        fail(`全局视频 ${index + 1} 引用了不存在的视频素材“${node.assetId}”。`)
      }
      if (node.poster.assetId && !hasOwn(project.assets, node.poster.assetId)) {
        fail(`全局视频 ${index + 1} 引用了不存在的封面素材“${node.poster.assetId}”。`)
      }
    }
    if (
      node.type === 'external-component' &&
      !componentExists(node.component.packageId, node.component.version)
    ) {
      fail(`全局组件 ${index + 1} 引用了不存在的组件“${node.component.packageId}@${node.component.version}”。`)
    }
    for (const sceneId of item.visibility.sceneIds) {
      if (!sceneIds.has(sceneId)) {
        fail(`全局元素“${node.name}”的可见范围引用了不存在的场景“${sceneId}”。`)
      }
    }
    if (node.type === 'teacher-controller') {
      for (const button of node.buttons) {
        if (button.action.type === 'scene.go') {
          validateSceneDestination(
            button.action.sceneId,
            button.action.targetStateId,
            `全局控制器“${node.name}”的按钮“${button.label}”`,
          )
        }
      }
    }
  }

  for (const rule of project.globalInteractions) {
    const owner = `全局交互“${rule.name ?? rule.id}”`
    if ('nodeId' in rule.trigger) {
      const triggerNode = globalNodeById.get(rule.trigger.nodeId)
      if (!triggerNode) {
        fail(`${owner}引用了不存在的全局触发元素“${rule.trigger.nodeId}”。`)
        continue
      }
      if (rule.trigger.type.startsWith('video.') && triggerNode.type !== 'video') {
        fail(`${owner}的视频触发器引用了非视频元素“${rule.trigger.nodeId}”。`)
      }
    }
    if (rule.trigger.type === 'audio.ended' && !soundIds.has(rule.trigger.soundId)) {
      fail(`${owner}引用了不存在的声音“${rule.trigger.soundId}”。`)
    }
    if (
      rule.trigger.type === 'animation.completed' &&
      !globalMotionActionIds.has(rule.trigger.actionId)
    ) {
      fail(`${owner}引用了不存在的动画动作“${rule.trigger.actionId}”。`)
    }

    let scopedSceneIds: Set<string> | null = null
    for (const condition of rule.conditions) {
      if (condition.type !== 'scene.in') continue
      if (condition.sceneIds.some((sceneId) => !sceneIds.has(sceneId))) {
        fail(`${owner}包含不存在的场景条件。`)
      }
      const ids = new Set<string>(condition.sceneIds)
      if (scopedSceneIds === null) {
        scopedSceneIds = ids
      } else {
        const previousIds: Set<string> = scopedSceneIds
        scopedSceneIds = new Set<string>(
          [...previousIds].filter((sceneId) => ids.has(sceneId)),
        )
      }
    }
    const scopedScene = scopedSceneIds?.size === 1
      ? scenesById.get([...scopedSceneIds][0]!)
      : scopedSceneIds === null && project.scenes.length === 1
        ? project.scenes[0]
        : undefined
    const scopedStateIds = scopedScene
      ? new Set(ensureScenePresentation(scopedScene).states.map((state) => state.id))
      : null
    if (
      rule.trigger.type === 'presentation.enter' &&
      scopedStateIds &&
      !scopedStateIds.has(rule.trigger.stateId)
    ) {
      fail(`${owner}引用了不存在的触发状态“${rule.trigger.stateId}”。`)
    }
    for (const condition of rule.conditions) {
      if (
        condition.type === 'presentation.in' &&
        scopedStateIds &&
        condition.stateIds.some((stateId) => !scopedStateIds.has(stateId))
      ) {
        fail(`${owner}包含不存在的状态条件。`)
      }
    }
    for (const step of rule.actions) {
      const { action } = step
      if (
        action.type === 'presentation.set' &&
        scopedStateIds &&
        !scopedStateIds.has(action.stateId)
      ) {
        fail(`${owner}要切换到不存在的状态“${action.stateId}”。`)
      }
      if (action.type === 'scene.go') {
        validateSceneDestination(action.sceneId, action.targetStateId, owner)
      }
      if (action.type === 'audio.play' && !soundIds.has(action.soundId)) {
        fail(`${owner}要播放不存在的声音“${action.soundId}”。`)
      }
      if (
        isAudioInteractionAction(action) &&
        action.type !== 'audio.play' &&
        action.target.kind === 'sound' &&
        !soundIds.has(action.target.soundId)
      ) {
        fail(`${owner}引用了不存在的声音“${action.target.soundId}”。`)
      }
      if (isVideoInteractionAction(action)) {
        const target = globalNodeById.get(action.nodeId)
        if (target?.type !== 'video') {
          fail(`${owner}引用了不存在的全局视频元素“${action.nodeId}”。`)
        }
      }
      if (action.type === 'node.enter' || action.type === 'node.exit') {
        if (!globalNodeById.has(action.nodeId)) {
          fail(`${owner}引用了不存在的全局动画元素“${action.nodeId}”。`)
        }
      }
    }
  }

  for (const scene of project.scenes) {
    validateRuntime(
      scene.runtime,
      `场景“${scene.name}”`,
      new Set(scene.nodes.map((node) => node.id)),
    )
    const validateSceneSnapshot = (
      snapshot: typeof scene,
      stateName?: string,
    ): void => {
      const owner = stateName
        ? `场景“${scene.name}”的状态“${stateName}”`
        : `场景“${scene.name}”`
      if (
        snapshot.backgroundAssetId &&
        !hasOwn(project.assets, snapshot.backgroundAssetId)
      ) {
        fail(`${owner}引用了不存在的背景素材“${snapshot.backgroundAssetId}”。`)
      }
      for (const node of snapshot.nodes) {
        if (node.type === 'image' && !hasOwn(project.assets, node.assetId)) {
          fail(`${owner}引用了不存在的图片素材“${node.assetId}”。`)
        }
        if (node.type === 'video') {
          if (!hasOwn(project.assets, node.assetId)) {
            fail(`${owner}引用了不存在的视频素材“${node.assetId}”。`)
          }
          if (node.poster.assetId && !hasOwn(project.assets, node.poster.assetId)) {
            fail(`${owner}引用了不存在的视频封面素材“${node.poster.assetId}”。`)
          }
        }
        if (
          node.type === 'external-component' &&
          !componentExists(node.component.packageId, node.component.version)
        ) {
          fail(`${owner}引用了不存在的组件“${node.component.packageId}@${node.component.version}”。`)
        }
      }
    }
    validateSceneSnapshot(scene)
    for (const state of scene.presentation?.states ?? []) {
      validateSceneSnapshot(materializeScene(scene, state.id), state.name)
    }

    const nodeById = new Map(scene.nodes.map((node) => [node.id, node]))
    const stateIds = new Set(scene.presentation?.states.map((state) => state.id) ?? [])
    const motionActionIds = new Set(
      scene.interactions.flatMap((rule) => rule.actions
        .filter((step) => step.action.type === 'node.enter' || step.action.type === 'node.exit')
        .map((step) => step.id)),
    )
    for (const rule of scene.interactions) {
      const owner = `场景“${scene.name}”的交互“${rule.name ?? rule.id}”`
      if ('nodeId' in rule.trigger && !nodeById.has(rule.trigger.nodeId)) {
        fail(`${owner}引用了不存在的触发元素“${rule.trigger.nodeId}”。`)
      }
      if (rule.trigger.type === 'presentation.enter' && !stateIds.has(rule.trigger.stateId)) {
        fail(`${owner}引用了不存在的触发状态“${rule.trigger.stateId}”。`)
      }
      if (rule.trigger.type === 'audio.ended' && !soundIds.has(rule.trigger.soundId)) {
        fail(`${owner}引用了不存在的声音“${rule.trigger.soundId}”。`)
      }
      if (
        rule.trigger.type === 'animation.completed' &&
        !motionActionIds.has(rule.trigger.actionId)
      ) {
        fail(`${owner}引用了不存在的动画动作“${rule.trigger.actionId}”。`)
      }
      for (const condition of rule.conditions) {
        if (
          condition.type === 'scene.in' &&
          condition.sceneIds.some((id) => !sceneIds.has(id))
        ) {
          fail(`${owner}包含不存在的场景条件。`)
        }
        if (condition.type === 'presentation.in' && condition.stateIds.some((id) => !stateIds.has(id))) {
          fail(`${owner}包含不存在的状态条件。`)
        }
      }
      for (const step of rule.actions) {
        const { action } = step
        if (action.type === 'presentation.set' && !stateIds.has(action.stateId)) {
          fail(`${owner}要切换到不存在的状态“${action.stateId}”。`)
        }
        if (action.type === 'scene.go') {
          validateSceneDestination(action.sceneId, action.targetStateId, owner)
        }
        if (action.type === 'audio.play' && !soundIds.has(action.soundId)) {
          fail(`${owner}要播放不存在的声音“${action.soundId}”。`)
        }
        if (
          isAudioInteractionAction(action) &&
          action.type !== 'audio.play' &&
          action.target.kind === 'sound' &&
          !soundIds.has(action.target.soundId)
        ) {
          fail(`${owner}引用了不存在的声音“${action.target.soundId}”。`)
        }
        if (isVideoInteractionAction(action)) {
          const target = nodeById.get(action.nodeId)
          if (target?.type !== 'video') {
            fail(`${owner}引用了不存在的视频元素“${action.nodeId}”。`)
          }
        }
        if (action.type === 'node.enter' || action.type === 'node.exit') {
          if (!nodeById.has(action.nodeId)) {
            fail(`${owner}引用了不存在的动画元素“${action.nodeId}”。`)
          }
        }
      }
    }
  }

  for (const [soundId, sound] of Object.entries(project.media.audio.sounds)) {
    if (sound.id !== soundId) fail(`声音记录键“${soundId}”与声音 ID 不一致。`)
    const asset = project.assets[sound.assetId]
    if (!asset || asset.kind !== 'audio') {
      fail(`声音“${sound.name}”引用了不存在或非声音类型的素材“${sound.assetId}”。`)
    }
  }
}

function createProjectArchiveFiles(
  data: ProjectArchiveData,
): Record<string, Uint8Array> {
  const project = validateProjectForSave(data.project)
  const componentReferenceContexts: Record<string, ComponentAssetReferenceContext> = {}
  for (const [recordKey, meta] of Object.entries(project.componentPackages)) {
    const files = getComponentFilesForMetadata(data.componentFiles, recordKey, meta)
    if (!files) continue
    const parsed = parseComponentPackageFiles(files, {
      expectedId: meta.packageId,
      expectedVersion: meta.version,
    })
    componentReferenceContexts[recordKey] = {
      manifest: parsed.manifest,
      runtimeSource: parsed.runtimeSource,
    }
  }
  validateProjectReferences(project, false, componentReferenceContexts)
  const archiveFiles: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >
  archiveFiles[PROJECT_DOCUMENT_PATH] = strToU8(JSON.stringify(project, null, 2))

  const seenAssetPaths = new Set<string>()
  for (const [assetId, meta] of Object.entries(project.assets)) {
    if (assetId !== meta.id) {
      throw projectSaveError(`素材记录键“${assetId}”与素材 ID“${meta.id}”不一致。`)
    }
    assertLeafFilename(meta.filename, `素材“${assetId}”`, false)
    validateAssetPath(meta.path, false)
    if (seenAssetPaths.has(meta.path)) {
      throw projectSaveError(`多个素材使用了相同路径“${meta.path}”。`)
    }
    seenAssetPaths.add(meta.path)

    const bytes = hasOwn(data.assetFiles, assetId)
      ? data.assetFiles[assetId]
      : undefined
    if (!(bytes instanceof Uint8Array)) {
      throw projectSaveError(`素材“${meta.filename}”缺少二进制内容。`)
    }
    if (bytes.byteLength !== meta.byteLength) {
      throw projectSaveError(
        `素材“${meta.filename}”的字节数与工程记录不一致。`,
      )
    }
    archiveFiles[meta.path] = bytes
  }
  for (const suppliedAssetId of Object.keys(data.assetFiles)) {
    if (!hasOwn(project.assets, suppliedAssetId)) {
      throw projectSaveError(`存在未登记的素材文件“${suppliedAssetId}”。`)
    }
  }

  const expectedComponentKeys = new Set<string>()
  const seenComponentRoots = new Set<string>()
  for (const [recordKey, meta] of Object.entries(project.componentPackages)) {
    const canonicalKey = componentPackageKey(meta.packageId, meta.version)
    if (seenComponentRoots.has(canonicalKey)) {
      throw projectSaveError(`组件“${canonicalKey}”在工程中重复。`)
    }
    seenComponentRoots.add(canonicalKey)
    expectedComponentKeys.add(canonicalKey)

    const files = getComponentFilesForMetadata(data.componentFiles, recordKey, meta)
    if (files === undefined) {
      throw projectSaveError(`组件“${canonicalKey}”缺少包文件。`)
    }
    validateEmbeddedMetadata(meta, recordKey, files, false)

    const root = componentArchiveRoot(meta.packageId, meta.version)
    for (const [relativePath, bytes] of Object.entries(files)) {
      assertSafeArchivePath(relativePath, 'component')
      const archivePath = `${root}/${relativePath}`
      if (archiveFiles[archivePath] !== undefined) {
        throw projectSaveError(`组件文件路径重复：“${archivePath}”。`)
      }
      archiveFiles[archivePath] = bytes
    }
  }

  for (const suppliedKey of Object.keys(data.componentFiles)) {
    if (
      !expectedComponentKeys.has(suppliedKey) &&
      !Object.entries(project.componentPackages).some(
        ([recordKey, meta]) => recordKey === suppliedKey || meta.packageId === suppliedKey,
      )
    ) {
      throw projectSaveError(`存在未登记的组件文件“${suppliedKey}”。`)
    }
  }

  return archiveFiles
}

function parseProjectArchiveFiles(
  archiveFiles: Record<string, Uint8Array>,
): ProjectArchiveData {
  const projectBytes = archiveFiles[PROJECT_DOCUMENT_PATH]
  if (projectBytes === undefined) {
    throw projectOpenError('工程包缺少根目录下的 project.json。')
  }
  const project = readProjectDocument(projectBytes)

  const assetFiles: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >
  const consumedPaths = new Set<string>([PROJECT_DOCUMENT_PATH])
  const seenAssetPaths = new Set<string>()
  for (const [assetId, meta] of Object.entries(project.assets)) {
    if (assetId !== meta.id) {
      throw projectOpenError(`素材记录键“${assetId}”与素材 ID“${meta.id}”不一致。`)
    }
    assertLeafFilename(meta.filename, `素材“${assetId}”`, true)
    validateAssetPath(meta.path, true)
    if (seenAssetPaths.has(meta.path)) {
      throw projectOpenError(`多个素材使用了相同路径“${meta.path}”。`)
    }
    seenAssetPaths.add(meta.path)
    const assetBytes = archiveFiles[meta.path]
    if (assetBytes === undefined) {
      throw projectOpenError(`工程包缺少图片素材“${meta.filename}”。`)
    }
    if (assetBytes.byteLength !== meta.byteLength) {
      throw projectOpenError(`图片素材“${meta.filename}”的字节数与记录不一致。`)
    }
    consumedPaths.add(meta.path)
    // The async unzip result is already private to this archive. Retaining the
    // buffer avoids another full-size copy for large audio/video projects.
    assetFiles[assetId] = assetBytes
  }

  const componentFiles: Record<string, Record<string, Uint8Array>> = Object.create(
    null,
  ) as Record<string, Record<string, Uint8Array>>
  for (const [recordKey, meta] of Object.entries(project.componentPackages)) {
    const canonicalKey = componentPackageKey(meta.packageId, meta.version)
    if (componentFiles[canonicalKey] !== undefined) {
      throw projectOpenError(`组件“${canonicalKey}”在工程中重复。`)
    }
    const root = `${componentArchiveRoot(meta.packageId, meta.version)}/`
    const packageFiles: Record<string, Uint8Array> = Object.create(null) as Record<
      string,
      Uint8Array
    >
    for (const [archivePath, fileBytes] of Object.entries(archiveFiles)) {
      if (!archivePath.startsWith(root)) continue
      const relativePath = archivePath.slice(root.length)
      if (relativePath.length === 0) continue
      assertSafeArchivePath(relativePath, 'component')
      packageFiles[relativePath] = fileBytes
      consumedPaths.add(archivePath)
    }
    if (Object.keys(packageFiles).length === 0) {
      throw projectOpenError(`工程包缺少组件“${canonicalKey}”的文件。`)
    }
    validateEmbeddedMetadata(meta, recordKey, packageFiles, true)
    componentFiles[canonicalKey] = packageFiles
  }

  for (const archivePath of Object.keys(archiveFiles)) {
    if (consumedPaths.has(archivePath)) continue
    if (archivePath.startsWith('assets/') || archivePath.startsWith('components/')) {
      throw projectOpenError(`工程包包含未登记文件“${archivePath}”。`)
    }
  }

  const componentReferenceContexts: Record<string, ComponentAssetReferenceContext> = {}
  for (const [recordKey, meta] of Object.entries(project.componentPackages)) {
    const files = getComponentFilesForMetadata(componentFiles, recordKey, meta)
    if (!files) continue
    const parsed = parseComponentPackageFiles(files, {
      expectedId: meta.packageId,
      expectedVersion: meta.version,
    })
    componentReferenceContexts[recordKey] = {
      manifest: parsed.manifest,
      runtimeSource: parsed.runtimeSource,
    }
  }
  validateProjectReferences(project, true, componentReferenceContexts)

  return { project, assetFiles, componentFiles }
}

function archiveFilter(): {
  filter(file: { name: string; originalSize: number }): boolean
} {
  let totalUncompressedBytes = 0
  return {
    filter(file) {
      assertSafeArchivePath(file.name, 'project', { allowDirectory: true })
      totalUncompressedBytes += file.originalSize
      if (totalUncompressedBytes > MAX_PROJECT_UNCOMPRESSED_BYTES) {
        throw projectOpenError('工程解压后超过 512MB 安全限制。')
      }
      return !isArchiveDirectory(file.name)
    },
  }
}

function abortError(): Error {
  return new DOMException('操作已取消。', 'AbortError')
}

export function createProjectArchive(
  data: ProjectArchiveData,
  options: CreateProjectArchiveOptions = {},
): Uint8Array {
  try {
    return zipSync(createProjectArchiveFiles(data), {
      level: 6,
      ...(options.mtime === undefined ? {} : { mtime: options.mtime }),
    })
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    throw projectSaveError('压缩工程文件失败。', error)
  }
}

export async function createProjectArchiveAsync(
  data: ProjectArchiveData,
  options: CreateProjectArchiveOptions = {},
): Promise<Uint8Array> {
  if (options.signal?.aborted) throw abortError()
  const files = createProjectArchiveFiles(data)
  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false
    let terminate = () => {}
    const onAbort = () => {
      terminate()
      finish(() => reject(abortError()))
    }
    const finish = (operation: () => void) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      operation()
    }
    try {
      terminate = zip(files, {
        level: 6,
        ...(options.mtime === undefined ? {} : { mtime: options.mtime }),
      }, (error, bytes) => {
        if (error) {
          finish(() => reject(
            error instanceof UserFacingError
              ? error
              : projectSaveError('压缩工程文件失败。', error),
          ))
          return
        }
        finish(() => resolve(bytes))
      })
    } catch (error) {
      finish(() => reject(
        error instanceof UserFacingError
          ? error
          : projectSaveError('压缩工程文件失败。', error),
      ))
      return
    }
    if (!settled) {
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.signal?.aborted) onAbort()
    }
  })
}

export function openProjectArchive(bytes: Uint8Array): ProjectArchiveData {
  if (bytes.byteLength === 0) {
    throw projectOpenError('所选工程文件为空。')
  }

  let archiveFiles: Record<string, Uint8Array>
  try {
    archiveFiles = unzipSync(bytes, archiveFilter())
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    throw projectOpenError('无法解压工程文件，文件可能已损坏。', error)
  }

  return parseProjectArchiveFiles(archiveFiles)
}

export async function openProjectArchiveAsync(
  bytes: Uint8Array,
  options: { signal?: AbortSignal } = {},
): Promise<ProjectArchiveData> {
  if (bytes.byteLength === 0) {
    throw projectOpenError('所选工程文件为空。')
  }
  if (options.signal?.aborted) throw abortError()
  const archiveFiles = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    let settled = false
    let terminate = () => {}
    const onAbort = () => {
      terminate()
      finish(() => reject(abortError()))
    }
    const finish = (operation: () => void) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      operation()
    }
    try {
      terminate = unzip(bytes, archiveFilter(), (error, files) => {
        if (error) {
          finish(() => reject(
            error instanceof UserFacingError
              ? error
              : projectOpenError('无法解压工程文件，文件可能已损坏。', error),
          ))
          return
        }
        finish(() => resolve(files))
      })
    } catch (error) {
      finish(() => reject(
        error instanceof UserFacingError
          ? error
          : projectOpenError('无法解压工程文件，文件可能已损坏。', error),
      ))
      return
    }
    if (!settled) {
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.signal?.aborted) onAbort()
    }
  })
  return parseProjectArchiveFiles(archiveFiles)
}

export const packProjectArchive = createProjectArchive
export const unpackProjectArchive = openProjectArchive
