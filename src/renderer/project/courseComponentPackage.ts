import { componentSupportsScope } from '../../shared/componentCapabilities'
import { componentContentSha256 } from '../../shared/componentContentIntegrity'
import { mergeComponentProps } from '../../shared/componentProps'
import type { ComponentPackageData } from '../../shared/componentTypes'
import type {
  CourseProjectDocument,
  FlowBlock,
  LayerItem,
} from '../../shared/courseProjectTypes'
import { UserFacingError } from '../../shared/errors'
import type { EmbeddedComponentPackageMeta } from '../../shared/projectTypes'
import { updateCourseProject } from '../course/courseStudioModel'
import { componentPackageKey } from './archivePath'

export type CourseComponentInstanceScope = 'global' | 'scene'

export interface CourseComponentInstanceSnapshot {
  readonly scope: CourseComponentInstanceScope
  readonly layerItemId?: string
  readonly blockId?: string
  readonly surfaceId?: string
  readonly sceneId?: string
  readonly version: string
  readonly props: Record<string, unknown>
}

export interface ReplaceCourseComponentPackageInput {
  readonly project: CourseProjectDocument
  readonly componentFiles: Readonly<Record<string, Readonly<Record<string, Uint8Array>>>>
  readonly packageId: string
  readonly packageData: ComponentPackageData
  readonly now?: string
}

export interface ReplaceCourseComponentPackageResult {
  readonly project: CourseProjectDocument
  readonly componentFiles: Record<string, Record<string, Uint8Array>>
  readonly packageData: ComponentPackageData
  readonly previousVersion: string
  readonly replacementVersion: string
  readonly affectedInstances: CourseComponentInstanceSnapshot[]
}

function cloneFileMap(
  files: Readonly<Record<string, Uint8Array>>,
): Record<string, Uint8Array> {
  return Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [path, Uint8Array.from(bytes)]),
  )
}

function cloneSidecar(
  files: Readonly<Record<string, Readonly<Record<string, Uint8Array>>>>,
): Record<string, Record<string, Uint8Array>> {
  return Object.fromEntries(
    Object.entries(files).map(([key, inner]) => [key, cloneFileMap(inner)]),
  )
}

function clonePackageData(data: ComponentPackageData): ComponentPackageData {
  return {
    manifest: structuredClone(data.manifest),
    runtimeSource: data.runtimeSource,
    files: cloneFileMap(data.files),
    ...(data.contentSha256 === undefined ? {} : { contentSha256: data.contentSha256 }),
    ...(data.thumbnailUrl === undefined ? {} : { thumbnailUrl: data.thumbnailUrl }),
    ...(data.provenance === undefined ? {} : { provenance: structuredClone(data.provenance) }),
  }
}

function packageContentHash(data: ComponentPackageData): string | undefined {
  return data.contentSha256 ?? data.provenance?.sha256
}

function embeddedContentHash(meta: EmbeddedComponentPackageMeta): string | undefined {
  return meta.contentSha256 || meta.sha256
}

function componentMetaForReplacement(data: ComponentPackageData): EmbeddedComponentPackageMeta {
  const base = `components/${data.manifest.id}@${data.manifest.version}`
  return {
    packageId: data.manifest.id,
    version: data.manifest.version,
    name: data.manifest.name,
    manifestPath: `${base}/manifest.json`,
    runtimePath: `${base}/${data.manifest.entry}`,
    contentSha256: packageContentHash(data) ?? componentContentSha256(data.files),
    ...(data.manifest.thumbnail ? { thumbnailPath: `${base}/${data.manifest.thumbnail}` } : {}),
    ...(data.provenance === undefined ? {} : data.provenance),
  }
}

function dropPackageSidecar(
  files: Record<string, Record<string, Uint8Array>>,
  packageId: string,
): void {
  const prefix = `${packageId}@`
  for (const key of Object.keys(files)) {
    if (key === packageId || key.startsWith(prefix)) delete files[key]
  }
}

function replaceFailure(
  message: string,
  suggestion = '当前工程未发生变化，现有实例已保留。',
  cause?: unknown,
): UserFacingError {
  return new UserFacingError(
    '组件替换失败',
    message,
    suggestion,
    cause === undefined ? undefined : { cause },
  )
}

function walkFlowBlocks(blocks: FlowBlock[], visit: (block: FlowBlock) => void): void {
  for (const block of blocks) {
    visit(block)
    if (block.type === 'section') walkFlowBlocks(block.blocks, visit)
  }
}

function snapshotLayerItem(
  item: Extract<LayerItem, { kind: 'component' }>,
  scope: CourseComponentInstanceScope,
  location: { surfaceId?: string; sceneId?: string },
): CourseComponentInstanceSnapshot {
  return {
    scope,
    layerItemId: item.layerItemId,
    surfaceId: location.surfaceId,
    sceneId: location.sceneId,
    version: item.component.version,
    props: structuredClone(item.props),
  }
}

function applyInstanceProps(
  item: { component: { version: string }; props: Record<string, unknown> },
  packageData: ComponentPackageData,
): void {
  item.component.version = packageData.manifest.version
  item.props = mergeComponentProps(packageData.manifest, item.props)
}

function collectAndUpdateInstances(
  project: CourseProjectDocument,
  packageId: string,
  packageData: ComponentPackageData | null,
): CourseComponentInstanceSnapshot[] {
  const snapshots: CourseComponentInstanceSnapshot[] = []

  const visitLayer = (
    item: LayerItem,
    scope: CourseComponentInstanceScope,
    location: { surfaceId?: string; sceneId?: string },
  ) => {
    if (item.kind !== 'component' || item.component.packageId !== packageId) return
    snapshots.push(snapshotLayerItem(item, scope, location))
    if (packageData) applyInstanceProps(item, packageData)
  }

  for (const entry of project.globalLayerItems) {
    visitLayer(entry.item, 'global', {})
  }

  for (const surface of project.surfaces) {
    if (surface.type === 'slide') {
      for (const entry of surface.surfaceLayerItems) {
        visitLayer(entry.item, 'scene', { surfaceId: surface.id })
      }
      for (const scene of surface.scenes) {
        for (const item of scene.layerItems) {
          visitLayer(item, 'scene', { surfaceId: surface.id, sceneId: scene.id })
        }
      }
      continue
    }
    if (surface.type === 'spatial-2d') {
      for (const item of surface.world.layerItems) {
        visitLayer(item, 'scene', { surfaceId: surface.id })
      }
      continue
    }
    walkFlowBlocks(surface.blocks, (block) => {
      if (block.type !== 'component' || block.component.packageId !== packageId) return
      snapshots.push({
        scope: 'scene',
        blockId: block.id,
        surfaceId: surface.id,
        version: block.component.version,
        props: structuredClone(block.props),
      })
      if (packageData) applyInstanceProps(block, packageData)
    })
  }

  return snapshots
}

function unsupportedScopeLabels(
  project: CourseProjectDocument,
  packageId: string,
  packageData: ComponentPackageData,
): string[] {
  const instances = collectAndUpdateInstances(project, packageId, null)
  const hasGlobal = instances.some((instance) => instance.scope === 'global')
  const hasScene = instances.some((instance) => instance.scope === 'scene')
  return [
    hasScene && !componentSupportsScope(packageData.manifest, 'scene') ? '场景层' : null,
    hasGlobal && !componentSupportsScope(packageData.manifest, 'global') ? '全局层' : null,
  ].filter((label): label is string => Boolean(label))
}

function assertReplacementAllowed(
  project: CourseProjectDocument,
  packageId: string,
  packageData: ComponentPackageData,
): EmbeddedComponentPackageMeta {
  const replacementId = packageData.manifest.id
  if (replacementId !== packageId) {
    throw replaceFailure(
      `所选组件包 ID 为“${replacementId}”，与待替换的“${packageId}”不一致。`,
      '请选择同一组件 ID 的新版本；替换不会自动把实例迁移到另一种组件。',
    )
  }

  const existing = project.componentPackages[packageId]
  if (!existing) {
    throw replaceFailure(`工程中不存在可替换的组件包“${packageId}”。`)
  }

  const currentHash = embeddedContentHash(existing)
  const replacementHash = packageContentHash(packageData)
  if (
    existing.version === packageData.manifest.version &&
    currentHash !== undefined &&
    replacementHash !== undefined &&
    currentHash !== replacementHash
  ) {
    throw replaceFailure(
      `组件“${packageId}”的 ${packageData.manifest.version} 版本与工程内同版本哈希不一致。`,
      '同一 ID 与版本必须锁定到完全相同的包；请让组件维护者提升版本号后再更新。',
    )
  }

  const unsupported = unsupportedScopeLabels(project, packageId, packageData)
  if (unsupported.length > 0) {
    throw replaceFailure(
      `新包未声明支持现有实例所在的${unsupported.join('和')}。`,
      '请使用 supportedScopes 覆盖现有实例范围的同 ID 组件包，或先删除不兼容范围内的实例。',
    )
  }

  return existing
}

/**
 * Replaces one V9 component package by the same packageId.
 * Returns a detached project + sidecar pair for a single store history commit.
 * Validation failures throw UserFacingError and never mutate the caller inputs.
 */
export function replaceCourseComponentPackage(
  input: ReplaceCourseComponentPackageInput,
): ReplaceCourseComponentPackageResult {
  const existing = assertReplacementAllowed(input.project, input.packageId, input.packageData)
  const nextFiles = cloneSidecar(input.componentFiles)
  dropPackageSidecar(nextFiles, input.packageId)
  nextFiles[componentPackageKey(input.packageData.manifest.id, input.packageData.manifest.version)] =
    cloneFileMap(input.packageData.files)

  let affectedInstances: CourseComponentInstanceSnapshot[] = []
  let nextProject: CourseProjectDocument
  try {
    nextProject = updateCourseProject(input.project, (draft) => {
      draft.componentPackages[input.packageId] = componentMetaForReplacement(input.packageData)
      affectedInstances = collectAndUpdateInstances(draft, input.packageId, input.packageData)
    }, input.now)
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    throw replaceFailure(
      error instanceof Error ? error.message : `无法替换组件包“${input.packageId}”。`,
      '当前工程未发生变化，现有实例已保留。',
      error,
    )
  }

  return {
    project: nextProject,
    componentFiles: nextFiles,
    packageData: clonePackageData(input.packageData),
    previousVersion: existing.version,
    replacementVersion: input.packageData.manifest.version,
    affectedInstances,
  }
}

export function collectCourseComponentPackageInstances(
  project: CourseProjectDocument,
  packageId: string,
): CourseComponentInstanceSnapshot[] {
  return collectAndUpdateInstances(project, packageId, null)
}
