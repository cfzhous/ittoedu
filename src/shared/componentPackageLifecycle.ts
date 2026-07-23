import {
  ensureScenePresentation,
  materializeScene,
} from './presentation'
import type {
  EmbeddedComponentPackageMeta,
  ExternalComponentNode,
  GlobalLayerItem,
  ProjectDocument,
  SceneDocument,
} from './projectTypes'

export type ComponentInstanceScope = 'scene' | 'global'

export interface ComponentStateReference {
  stateId: string
  stateName: string
  visible: boolean
}

export interface ComponentInstanceReference {
  scope: ComponentInstanceScope
  nodeId: string
  nodeName: string
  packageId: string
  version: string
  sceneId?: string
  sceneName?: string
  /** Every named state still references the base instance, even when hidden. */
  states: ComponentStateReference[]
  /** Global instances are mounted once; this records where they are visible. */
  visibleSceneIds: string[]
}

export interface ComponentPackageUsage {
  packageId: string
  packageKeys: string[]
  declaredVersions: string[]
  references: ComponentInstanceReference[]
  sceneInstanceCount: number
  stateReferenceCount: number
  visibleStateCount: number
  globalInstanceCount: number
  totalInstanceCount: number
}

export interface ComponentPackageDeletionDecision {
  packageId: string
  packageExists: boolean
  canDelete: boolean
  usage: ComponentPackageUsage
  reason: 'unused' | 'referenced' | 'package-missing'
}

export interface ComponentInstanceSnapshot {
  scope: ComponentInstanceScope
  nodeId: string
  sceneId?: string
  version: string
  props: Record<string, unknown>
}

export interface ComponentPackageReplacementRollback {
  packageId: string
  replacementKey: string
  replacementVersion: string
  previousPackageEntries: Record<string, EmbeddedComponentPackageMeta>
  instances: ComponentInstanceSnapshot[]
}

export interface ComponentPackageReplacementPlan {
  packageId: string
  previousVersions: string[]
  replacementVersion: string
  replacementKey: string
  affectedInstances: ComponentInstanceSnapshot[]
  /** A detached project clone. Applying the plan never mutates the input. */
  nextProject: ProjectDocument
  rollback: ComponentPackageReplacementRollback
}

export class ComponentPackagePlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComponentPackagePlanError'
  }
}

function isExternalComponentNode(
  node: SceneDocument['nodes'][number],
): node is ExternalComponentNode {
  return node.type === 'external-component'
}

function packageEntries(
  project: Pick<ProjectDocument, 'componentPackages'>,
  packageId: string,
): Array<[string, EmbeddedComponentPackageMeta]> {
  return Object.entries(project.componentPackages).filter(
    ([, meta]) => meta.packageId === packageId,
  )
}

function globalItemVisibleSceneIds(
  item: GlobalLayerItem,
  scenes: ReadonlyArray<Pick<SceneDocument, 'id'>>,
): string[] {
  if (item.visibility.mode === 'all') return scenes.map((scene) => scene.id)
  const selected = new Set(item.visibility.sceneIds)
  return scenes
    .filter((scene) => item.visibility.mode === 'include'
      ? selected.has(scene.id)
      : !selected.has(scene.id))
    .map((scene) => scene.id)
}

function sceneComponentReferences(
  scene: SceneDocument,
): ComponentInstanceReference[] {
  const presentation = ensureScenePresentation(scene)
  const materializedByState = new Map(
    presentation.states.map((state) => [
      state.id,
      new Map(materializeScene(scene, state.id).nodes.map((node) => [node.id, node])),
    ]),
  )

  return scene.nodes
    .filter(isExternalComponentNode)
    .map((node) => ({
      scope: 'scene' as const,
      sceneId: scene.id,
      sceneName: scene.name,
      nodeId: node.id,
      nodeName: node.name,
      packageId: node.component.packageId,
      version: node.component.version,
      states: presentation.states.map((state) => ({
        stateId: state.id,
        stateName: state.name,
        visible: materializedByState.get(state.id)?.get(node.id)?.visible === true,
      })),
      visibleSceneIds: [],
    }))
}

function globalComponentReferences(
  project: Pick<ProjectDocument, 'scenes' | 'globalLayer'>,
): ComponentInstanceReference[] {
  return project.globalLayer.flatMap((item) => {
    if (item.node.type !== 'external-component') return []
    return [{
      scope: 'global' as const,
      nodeId: item.node.id,
      nodeName: item.node.name,
      packageId: item.node.component.packageId,
      version: item.node.component.version,
      states: [],
      visibleSceneIds: globalItemVisibleSceneIds(item, project.scenes),
    }]
  })
}

export function collectComponentInstanceReferences(
  project: Pick<ProjectDocument, 'scenes' | 'globalLayer'>,
): ComponentInstanceReference[] {
  return [
    ...project.scenes.flatMap(sceneComponentReferences),
    ...globalComponentReferences(project),
  ]
}

export function collectComponentPackageUsage(
  project: Pick<ProjectDocument, 'scenes' | 'globalLayer' | 'componentPackages'>,
  packageId: string,
): ComponentPackageUsage {
  const entries = packageEntries(project, packageId)
  const references = collectComponentInstanceReferences(project).filter(
    (reference) => reference.packageId === packageId,
  )
  const sceneReferences = references.filter((reference) => reference.scope === 'scene')
  const globalReferences = references.filter((reference) => reference.scope === 'global')
  return {
    packageId,
    packageKeys: entries.map(([key]) => key),
    declaredVersions: [...new Set(entries.map(([, meta]) => meta.version))],
    references,
    sceneInstanceCount: sceneReferences.length,
    stateReferenceCount: sceneReferences.reduce(
      (count, reference) => count + reference.states.length,
      0,
    ),
    visibleStateCount: sceneReferences.reduce(
      (count, reference) => count + reference.states.filter((state) => state.visible).length,
      0,
    ),
    globalInstanceCount: globalReferences.length,
    totalInstanceCount: references.length,
  }
}

export function collectComponentPackageUsages(
  project: Pick<ProjectDocument, 'scenes' | 'globalLayer' | 'componentPackages'>,
): ComponentPackageUsage[] {
  const packageIds = new Set(
    Object.values(project.componentPackages).map((meta) => meta.packageId),
  )
  collectComponentInstanceReferences(project).forEach((reference) => {
    packageIds.add(reference.packageId)
  })
  return [...packageIds]
    .sort((left, right) => left.localeCompare(right))
    .map((packageId) => collectComponentPackageUsage(project, packageId))
}

export function evaluateComponentPackageDeletion(
  project: Pick<ProjectDocument, 'scenes' | 'globalLayer' | 'componentPackages'>,
  packageId: string,
): ComponentPackageDeletionDecision {
  const usage = collectComponentPackageUsage(project, packageId)
  const packageExists = usage.packageKeys.length > 0
  if (!packageExists) {
    return {
      packageId,
      packageExists: false,
      canDelete: false,
      usage,
      reason: 'package-missing',
    }
  }
  const canDelete = usage.totalInstanceCount === 0
  return {
    packageId,
    packageExists,
    canDelete,
    usage,
    reason: canDelete ? 'unused' : 'referenced',
  }
}

function defaultReplacementKey(
  existingKeys: string[],
  replacement: EmbeddedComponentPackageMeta,
): string {
  if (existingKeys.includes(replacement.packageId)) return replacement.packageId
  return `${replacement.packageId}@${replacement.version}`
}

function componentSnapshots(
  project: Pick<ProjectDocument, 'scenes' | 'globalLayer'>,
  packageId: string,
): ComponentInstanceSnapshot[] {
  const snapshots: ComponentInstanceSnapshot[] = []
  for (const scene of project.scenes) {
    for (const node of scene.nodes) {
      if (node.type !== 'external-component' || node.component.packageId !== packageId) {
        continue
      }
      snapshots.push({
        scope: 'scene',
        sceneId: scene.id,
        nodeId: node.id,
        version: node.component.version,
        props: structuredClone(node.props),
      })
    }
  }
  for (const item of project.globalLayer) {
    const node = item.node
    if (node.type !== 'external-component' || node.component.packageId !== packageId) {
      continue
    }
    snapshots.push({
      scope: 'global',
      nodeId: node.id,
      version: node.component.version,
      props: structuredClone(node.props),
    })
  }
  return snapshots
}

function updateComponentInstances(
  project: ProjectDocument,
  packageId: string,
  version: string,
): void {
  for (const scene of project.scenes) {
    for (const node of scene.nodes) {
      if (node.type === 'external-component' && node.component.packageId === packageId) {
        node.component.version = version
      }
    }
  }
  for (const item of project.globalLayer) {
    const node = item.node
    if (node.type === 'external-component' && node.component.packageId === packageId) {
      node.component.version = version
    }
  }
}

export function planComponentPackageReplacement(
  project: ProjectDocument,
  replacement: EmbeddedComponentPackageMeta,
  options: { replacementKey?: string } = {},
): ComponentPackageReplacementPlan {
  const packageId = replacement.packageId
  const existingEntries = packageEntries(project, packageId)
  if (existingEntries.length === 0) {
    throw new ComponentPackagePlanError(
      `工程中不存在可替换的组件包“${packageId}”。`,
    )
  }

  const replacementKey = options.replacementKey?.trim() ||
    defaultReplacementKey(existingEntries.map(([key]) => key), replacement)
  const conflicting = project.componentPackages[replacementKey]
  if (conflicting && conflicting.packageId !== packageId) {
    throw new ComponentPackagePlanError(
      `组件包键“${replacementKey}”已被“${conflicting.packageId}”占用。`,
    )
  }

  const previousPackageEntries = Object.fromEntries(
    existingEntries.map(([key, meta]) => [key, structuredClone(meta)]),
  )
  const instances = componentSnapshots(project, packageId)
  const nextProject = structuredClone(project)
  for (const [key, meta] of Object.entries(nextProject.componentPackages)) {
    if (meta.packageId === packageId) delete nextProject.componentPackages[key]
  }
  nextProject.componentPackages[replacementKey] = structuredClone(replacement)
  updateComponentInstances(nextProject, packageId, replacement.version)

  const rollback: ComponentPackageReplacementRollback = {
    packageId,
    replacementKey,
    replacementVersion: replacement.version,
    previousPackageEntries,
    instances: structuredClone(instances),
  }
  return {
    packageId,
    previousVersions: [...new Set(existingEntries.map(([, meta]) => meta.version))],
    replacementVersion: replacement.version,
    replacementKey,
    affectedInstances: structuredClone(instances),
    nextProject,
    rollback,
  }
}

function restoreInstanceSnapshot(
  project: ProjectDocument,
  snapshot: ComponentInstanceSnapshot,
  packageId: string,
  replacementVersion: string,
): void {
  const node = snapshot.scope === 'scene'
    ? project.scenes
        .find((scene) => scene.id === snapshot.sceneId)
        ?.nodes.find((item) => item.id === snapshot.nodeId)
    : project.globalLayer.find((item) => item.node.id === snapshot.nodeId)?.node
  if (
    node?.type !== 'external-component' ||
    node.component.packageId !== packageId ||
    node.component.version !== replacementVersion
  ) {
    return
  }
  node.component.version = snapshot.version
  node.props = structuredClone(snapshot.props)
}

/**
 * Roll back an immediately failed package replacement without replacing the
 * whole project object. Callers should still apply replacement and rollback as
 * one editor transaction so concurrent author edits cannot interleave.
 */
export function rollbackComponentPackageReplacement(
  project: ProjectDocument,
  rollback: ComponentPackageReplacementRollback,
): ProjectDocument {
  const nextProject = structuredClone(project)
  for (const [key, meta] of Object.entries(nextProject.componentPackages)) {
    if (meta.packageId === rollback.packageId || key === rollback.replacementKey) {
      delete nextProject.componentPackages[key]
    }
  }
  Object.assign(
    nextProject.componentPackages,
    structuredClone(rollback.previousPackageEntries),
  )
  rollback.instances.forEach((snapshot) => restoreInstanceSnapshot(
    nextProject,
    snapshot,
    rollback.packageId,
    rollback.replacementVersion,
  ))
  return nextProject
}
