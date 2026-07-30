import type { ExportPayload } from '../../shared/componentTypes'
import type {
  ExternalComponentNode,
  GlobalComponentInstance,
  GlobalLayerItem,
  ProjectDocument,
  SceneDocument,
} from '../../shared/projectTypes'
import type {
  RuntimeDocument,
  RuntimeLayer,
  RuntimeScope,
} from '../../shared/runtimeTypes'
import { componentSupportsScope } from '../../shared/componentCapabilities'

export interface RuntimeStaticExportEntry {
  key: string
  label: string
  layer: RuntimeLayer
  runtime: RuntimeDocument
  scope: RuntimeScope
  sceneId: string
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function componentKey(
  packageId: string,
  version: string,
): string {
  return `${packageId}@${version}`
}

function projectHasAsset(project: ProjectDocument, assetId: string): boolean {
  return hasOwn(project.assets, assetId) || Object.values(project.assets).some(
    (meta) => meta.id === assetId,
  )
}

function findPackagedComponent(
  payload: ExportPayload,
  packageId: string,
  version: string,
): ExportPayload['components'][string] | undefined {
  return Object.values(payload.components).find(
    (component) =>
      component.manifest.id === packageId &&
      component.manifest.version === version,
  )
}

function assertRuntimeDependencies(
  payload: ExportPayload,
  runtime: RuntimeDocument | undefined,
  label: string,
  allowedNodeIds: ReadonlySet<string>,
  allowedNodeLabel: string,
): void {
  if (!runtime) return

  for (const [bindingKey, binding] of Object.entries(runtime.assets)) {
    if (
      !projectHasAsset(payload.project, binding.assetId) ||
      !hasOwn(payload.assets, binding.assetId)
    ) {
      throw new Error(
        `${label}的运行时素材绑定“${bindingKey}”缺少素材“${binding.assetId}”，无法完整导出`,
      )
    }
  }

  const fallbackAssetId = runtime.staticFallback?.assetId
  if (
    fallbackAssetId &&
    (!projectHasAsset(payload.project, fallbackAssetId) ||
      !hasOwn(payload.assets, fallbackAssetId))
  ) {
    throw new Error(
      `${label}的运行时静态后备素材“${fallbackAssetId}”缺失，无法完整导出`,
    )
  }

  for (const [bindingKey, nodeId] of Object.entries(runtime.nodeBindings ?? {})) {
    if (!allowedNodeIds.has(nodeId)) {
      throw new Error(
        `${label}的运行时节点绑定“${bindingKey}”指向了非${allowedNodeLabel}“${nodeId}”，无法完整导出`,
      )
    }
  }
}

function assertComponentDependency(
  payload: ExportPayload,
  instance: ExternalComponentNode,
  label: string,
  scope: 'scene' | 'global',
): void {
  const { packageId, version } = instance.component
  const key = componentKey(packageId, version)
  const projectPackage = Object.values(payload.project.componentPackages).find(
    (component) =>
      component.packageId === packageId && component.version === version,
  )
  const packagedComponent = findPackagedComponent(payload, packageId, version)

  if (!projectPackage || !packagedComponent) {
    throw new Error(
      `${label}引用的组件包“${key}”未完整打入导出内容`,
    )
  }
  if (!componentSupportsScope(packagedComponent.manifest, scope)) {
    throw new Error(
      `${label}引用的组件包“${key}”未声明支持${scope === 'global' ? '全局层' : '场景层'}`,
    )
  }
}

/**
 * Export builders accept a complete payload directly, so they cannot assume it
 * was produced by buildExportPayload(). Validate every V3 dependency at the
 * boundary to prevent a successful-looking export that drops runtime content.
 */
export interface V3ExportDependencyOptions {
  /**
   * Authoring/static exports still require a complete project snapshot.
   * PublishedLesson compiles a runtime-only closure and validates only assets
   * and component packages reachable from published content.
   */
  requireAllProjectResources?: boolean
  /** Disabled runtimes are authoring data and are omitted from PublishedLesson. */
  includeDisabledRuntimes?: boolean
}

export function assertV3ExportDependencies(
  payload: ExportPayload,
  options: V3ExportDependencyOptions = {},
): void {
  const requireAllProjectResources =
    options.requireAllProjectResources ?? true
  const includeDisabledRuntimes = options.includeDisabledRuntimes ?? true

  if (requireAllProjectResources) {
    for (const [assetId, meta] of Object.entries(payload.project.assets)) {
      if (!hasOwn(payload.assets, assetId) && !hasOwn(payload.assets, meta.id)) {
        throw new Error(`工程素材“${meta.filename}”未完整打入导出内容`)
      }
    }

    for (const component of Object.values(payload.project.componentPackages)) {
      if (
        !findPackagedComponent(
          payload,
          component.packageId,
          component.version,
        )
      ) {
        throw new Error(
          `组件包“${componentKey(component.packageId, component.version)}”未完整打入导出内容`,
        )
      }
    }
  }

  const sceneIds = new Set(payload.project.scenes.map((scene) => scene.id))
  const globalNodeIds = new Set(
    payload.project.globalLayer.map((item) => item.node.id),
  )
  assertRuntimeDependencies(
    payload,
    payload.project.globalRuntime?.enabled || includeDisabledRuntimes
      ? payload.project.globalRuntime
      : undefined,
    '全局层',
    globalNodeIds,
    '全局层节点',
  )

  for (const item of payload.project.globalLayer) {
    const { node } = item
    if (node.type === 'image' && !projectHasAsset(payload.project, node.assetId)) {
      throw new Error(`全局元素“${node.name}”引用的图片素材“${node.assetId}”不存在`)
    }
    if (node.type === 'external-component') {
      assertComponentDependency(payload, node, `全局组件“${node.name}”`, 'global')
    }
    for (const sceneId of item.visibility.sceneIds) {
      if (!sceneIds.has(sceneId)) {
        throw new Error(
          `全局元素“${node.name}”的可见范围引用了不存在的场景“${sceneId}”`,
        )
      }
    }
  }

  for (const scene of payload.project.scenes) {
    assertRuntimeDependencies(
      payload,
      scene.runtime?.enabled || includeDisabledRuntimes
        ? scene.runtime
        : undefined,
      `场景“${scene.name}”`,
      new Set(scene.nodes.map((node) => node.id)),
      '本场景节点',
    )
    for (const node of scene.nodes) {
      if (node.type === 'external-component') {
        assertComponentDependency(
          payload,
          node,
          `场景“${scene.name}”中的组件“${node.name}”`,
          'scene',
        )
      }
    }
  }
}

export function isGlobalLayerItemVisibleForScene(
  item: Pick<GlobalLayerItem, 'visibility'>,
  sceneId: string,
): boolean {
  if (item.visibility.mode === 'all') return true
  const listed = item.visibility.sceneIds.includes(sceneId)
  return item.visibility.mode === 'include' ? listed : !listed
}

export function visibleGlobalLayerItemsForScene(
  project: ProjectDocument,
  sceneId: string,
  layer?: RuntimeLayer,
): GlobalLayerItem[] {
  return project.globalLayer.filter(
    (item) =>
      item.node.visible &&
      (layer === undefined || item.layer === layer) &&
      isGlobalLayerItemVisibleForScene(item, sceneId),
  )
}

/** @deprecated V3 compatibility name for component-only consumers. */
export const isGlobalComponentVisibleForScene = isGlobalLayerItemVisibleForScene

/** @deprecated Prefer visibleGlobalLayerItemsForScene for Project V4. */
export function visibleGlobalComponentsForScene(
  project: ProjectDocument,
  sceneId: string,
  layer?: RuntimeLayer,
): GlobalComponentInstance[] {
  return visibleGlobalLayerItemsForScene(project, sceneId, layer).filter(
    (item): item is GlobalComponentInstance =>
      item.node.type === 'external-component',
  )
}

export function runtimeSnapshotKey(
  scope: RuntimeScope,
  sceneId: string,
  layer?: RuntimeLayer,
): string {
  return layer
    ? `${scope}:${sceneId}:${layer}`
    : `${scope}:${sceneId}`
}

export function runtimeEntriesForScene(
  project: ProjectDocument,
  scene: SceneDocument,
): RuntimeStaticExportEntry[] {
  const entries: RuntimeStaticExportEntry[] = []
  if (project.globalRuntime?.enabled) {
    entries.push({
      key: runtimeSnapshotKey('global', scene.id),
      label: '全局自由运行时',
      layer: project.globalRuntime.staticFallback?.layer ?? 'overlay',
      runtime: project.globalRuntime,
      scope: 'global',
      sceneId: scene.id,
    })
  }
  if (scene.runtime?.enabled) {
    entries.push({
      key: runtimeSnapshotKey('scene', scene.id),
      label: `场景自由运行时“${scene.name}”`,
      layer: scene.runtime.staticFallback?.layer ?? 'overlay',
      runtime: scene.runtime,
      scope: 'scene',
      sceneId: scene.id,
    })
  }
  return entries
}
