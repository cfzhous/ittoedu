import type {
  InteractionRule,
} from './interactionTypes'
import { compareStableStrings } from './stableOrder'
import { makeAuthoringAddress } from './authoringAddress'
import {
  type CourseLocation,
  type CourseProjectDocument,
  type CourseSurfaceDocument,
  type FlowBlock,
  type LayerItem,
  type LayerItemBase,
  type ScopedLayerItem,
  type SlideSceneDocument,
} from './courseProjectTypes'

export type CourseProjectPath = ReadonlyArray<string | number>

export interface CourseProjectVisitor {
  surface?(surface: CourseSurfaceDocument, path: CourseProjectPath): void
  scene?(scene: SlideSceneDocument, path: CourseProjectPath): void
  block?(block: FlowBlock, path: CourseProjectPath): void
  layerItem?(item: LayerItem, path: CourseProjectPath): void
  location?(location: CourseLocation, path: CourseProjectPath): void
}

export type CourseProjectReferenceKind =
  | 'asset'
  | 'component'
  | 'surface'
  | 'scene'
  | 'block'
  | 'camera-frame'
  | 'layer-item'
  | 'location'
  | 'course-state'
  | 'presentation-state'
  | 'sound'

export interface CourseProjectReference {
  kind: CourseProjectReferenceKind
  id: string
  path: CourseProjectPath
  version?: string
}

export type AuthoringInventoryValueKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'asset'
  | 'formula'
  | 'object'
  | 'array'

/**
 * Derived only: never persisted and never carries the current value. The
 * stable path is ID-based; jsonPointer is a disposable projection for the
 * current revision and must be regenerated after structural edits.
 */
export interface DerivedAuthoringInventoryEntry {
  stablePath: string
  jsonPointer: string
  valueKind: AuthoringInventoryValueKind
  label: string
}

export type DerivedAuthoringInventory = Readonly<
  Record<string, Readonly<DerivedAuthoringInventoryEntry>>
>

export interface DerivedAuthoringInventorySnapshot {
  projectId: string
  revision: number
  entries: DerivedAuthoringInventory
}

export function isCanonicalLayerOrder(
  items: ReadonlyArray<Pick<LayerItemBase, 'layerItemId' | 'order'>>,
): boolean {
  const ids = new Set<string>()
  let previousOrder = -1
  return items.every((item) => {
    if (ids.has(item.layerItemId) || item.order <= previousOrder) return false
    ids.add(item.layerItemId)
    previousOrder = item.order
    return true
  })
}

/** Returns a new stable back-to-front view; it never mutates authoring data. */
export function getEffectiveLayerOrder<T extends Pick<LayerItemBase, 'layerItemId' | 'order'>>(
  items: ReadonlyArray<T>,
): T[] {
  return [...items].sort((left, right) =>
    left.order - right.order || compareStableStrings(left.layerItemId, right.layerItemId),
  )
}

export function getEffectiveScopedLayerOrder<T extends ScopedLayerItem>(
  items: ReadonlyArray<T>,
): T[] {
  return [...items].sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.item.layerItemId, right.item.layerItemId),
  )
}

export interface EffectiveCourseLayerItem {
  item: LayerItem
  source: 'global' | 'surface' | 'scene' | 'world'
}

export function isCourseLayerVisibleAtLocation(
  entry: ScopedLayerItem,
  locationId: string,
): boolean {
  if (entry.visibility.mode === 'all') return true
  const listed = entry.visibility.locationIds.includes(locationId)
  return entry.visibility.mode === 'include' ? listed : !listed
}

/** The one back-to-front layer fact consumed by editor, Player, hit and export. */
export function getEffectiveCourseLayerOrder(input: {
  project: CourseProjectDocument
  surfaceId: string
  locationId: string
}): EffectiveCourseLayerItem[] {
  const surface = input.project.surfaces.find((candidate) => candidate.id === input.surfaceId)
  if (!surface) throw new Error(`Unknown course surface: ${input.surfaceId}`)
  const location = input.project.locations.find((candidate) => candidate.id === input.locationId)
  if (!location || location.surfaceId !== surface.id) {
    throw new Error(`Location ${input.locationId} does not belong to surface ${surface.id}`)
  }
  const scoped = (
    entries: readonly ScopedLayerItem[],
    source: EffectiveCourseLayerItem['source'],
  ): EffectiveCourseLayerItem[] => entries
    .filter((entry) => isCourseLayerVisibleAtLocation(entry, input.locationId))
    .map((entry) => ({ item: entry.item, source }))
  const effective: EffectiveCourseLayerItem[] = [
    ...scoped(input.project.globalLayerItems, 'global'),
    ...scoped(surface.surfaceLayerItems, 'surface'),
  ]
  if (surface.type === 'slide' && location.kind === 'slide-scene') {
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
    if (!scene) throw new Error(`Unknown Slide scene: ${location.sceneId}`)
    effective.push(...scene.layerItems.map((item) => ({ item, source: 'scene' as const })))
  } else if (surface.type === 'spatial-2d') {
    effective.push(...surface.world.layerItems.map((item) => ({ item, source: 'world' as const })))
  }
  return effective.sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.item.layerItemId, right.item.layerItemId),
  )
}

export function reindexLayerItems<T extends LayerItem>(items: ReadonlyArray<T>): T[] {
  return getEffectiveLayerOrder(items).map((item, order) => ({ ...item, order }))
}

function walkBlocks(
  blocks: ReadonlyArray<FlowBlock>,
  path: CourseProjectPath,
  visitor: CourseProjectVisitor,
): void {
  blocks.forEach((block, index) => {
    const blockPath = [...path, index]
    visitor.block?.(block, blockPath)
    if (block.type === 'section') walkBlocks(block.blocks, [...blockPath, 'blocks'], visitor)
  })
}

export function visitCourseProject(
  project: CourseProjectDocument,
  visitor: CourseProjectVisitor,
): void {
  project.globalLayerItems.forEach((entry, index) => {
    visitor.layerItem?.(entry.item, ['globalLayerItems', index, 'item'])
  })
  project.locations.forEach((location, index) => {
    visitor.location?.(location, ['locations', index])
  })
  project.surfaces.forEach((surface, surfaceIndex) => {
    const surfacePath: CourseProjectPath = ['surfaces', surfaceIndex]
    visitor.surface?.(surface, surfacePath)
    surface.surfaceLayerItems.forEach((entry, index) => {
      visitor.layerItem?.(entry.item, [...surfacePath, 'surfaceLayerItems', index, 'item'])
    })
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene, sceneIndex) => {
        const scenePath = [...surfacePath, 'scenes', sceneIndex]
        visitor.scene?.(scene, scenePath)
        scene.layerItems.forEach((item, itemIndex) => {
          visitor.layerItem?.(item, [...scenePath, 'layerItems', itemIndex])
        })
      })
    } else if (surface.type === 'flow') {
      walkBlocks(surface.blocks, [...surfacePath, 'blocks'], visitor)
    } else {
      surface.world.layerItems.forEach((item, itemIndex) => {
        visitor.layerItem?.(item, [...surfacePath, 'world', 'layerItems', itemIndex])
      })
    }
  })
}

function addLayerReferences(
  item: LayerItem,
  path: CourseProjectPath,
  emit: (reference: CourseProjectReference) => void,
): void {
  if (item.kind === 'component') {
    emit({
      kind: 'component',
      id: item.component.packageId,
      version: item.component.version,
      path: [...path, 'component'],
    })
    if (item.staticFallbackAssetId) {
      emit({ kind: 'asset', id: item.staticFallbackAssetId, path: [...path, 'staticFallbackAssetId'] })
    }
    return
  }
  if (item.kind === 'runtime') {
    Object.entries(item.runtime.assets).forEach(([key, binding]) => {
      emit({ kind: 'asset', id: binding.assetId, path: [...path, 'runtime', 'assets', key, 'assetId'] })
    })
    Object.entries(item.runtime.nodeBindings ?? {}).forEach(([key, itemId]) => {
      emit({ kind: 'layer-item', id: itemId, path: [...path, 'runtime', 'nodeBindings', key] })
    })
    if (item.runtime.staticFallback) {
      emit({ kind: 'asset', id: item.runtime.staticFallback.assetId, path: [...path, 'runtime', 'staticFallback', 'assetId'] })
    }
    return
  }
  if (item.content.nativeType === 'image') {
    emit({ kind: 'asset', id: item.content.data.assetId, path: [...path, 'content', 'data', 'assetId'] })
  } else if (item.content.nativeType === 'video') {
    emit({ kind: 'asset', id: item.content.data.assetId, path: [...path, 'content', 'data', 'assetId'] })
    if (item.content.data.poster.assetId) {
      emit({ kind: 'asset', id: item.content.data.poster.assetId, path: [...path, 'content', 'data', 'poster', 'assetId'] })
    }
  } else if (item.content.nativeType === 'teacher-controller') {
    item.content.data.buttons.forEach((button, index) => {
      if (button.action.type === 'scene.go') {
        emit({ kind: 'scene', id: button.action.sceneId, path: [...path, 'content', 'data', 'buttons', index, 'action', 'sceneId'] })
      }
    })
  }
}

function addInteractionReferences(
  rules: ReadonlyArray<InteractionRule>,
  path: CourseProjectPath,
  emit: (reference: CourseProjectReference) => void,
): void {
  const add = (
    kind: CourseProjectReferenceKind,
    id: string,
    referencePath: CourseProjectPath,
  ): void => emit({ kind, id, path: referencePath })
  rules.forEach((rule, ruleIndex) => {
    const rulePath = [...path, ruleIndex]
    const trigger = rule.trigger
    if ('nodeId' in trigger) add('layer-item', trigger.nodeId, [...rulePath, 'trigger', 'nodeId'])
    if (trigger.type === 'presentation.enter') {
      add('presentation-state', trigger.stateId, [...rulePath, 'trigger', 'stateId'])
    } else if (trigger.type === 'audio.ended') {
      add('sound', trigger.soundId, [...rulePath, 'trigger', 'soundId'])
    }
    rule.conditions.forEach((condition, conditionIndex) => {
      if (condition.type === 'scene.in') {
        condition.sceneIds.forEach((sceneId, sceneIndex) => {
          add('scene', sceneId, [...rulePath, 'conditions', conditionIndex, 'sceneIds', sceneIndex])
        })
      } else {
        condition.stateIds.forEach((stateId, stateIndex) => {
          add('presentation-state', stateId, [...rulePath, 'conditions', conditionIndex, 'stateIds', stateIndex])
        })
      }
    })
    rule.actions.forEach((step, stepIndex) => {
      const action = step.action
      const actionPath = [...rulePath, 'actions', stepIndex, 'action']
      if (action.type === 'presentation.set') {
        add('presentation-state', action.stateId, [...actionPath, 'stateId'])
      } else if (action.type === 'scene.go') {
        add('scene', action.sceneId, [...actionPath, 'sceneId'])
        if (action.targetStateId) add('presentation-state', action.targetStateId, [...actionPath, 'targetStateId'])
      } else if ('nodeId' in action) {
        add('layer-item', action.nodeId, [...actionPath, 'nodeId'])
      } else if (action.type === 'audio.play') {
        add('sound', action.soundId, [...actionPath, 'soundId'])
      } else if (
        action.type === 'audio.pause' ||
        action.type === 'audio.resume' ||
        action.type === 'audio.stop' ||
        action.type === 'audio.toggle-mute'
      ) {
        if (action.target.kind === 'sound') {
          add('sound', action.target.soundId, [...actionPath, 'target', 'soundId'])
        }
      }
    })
  })
}

/** Traverses references without guessing inside arbitrary component props. */
export function visitCourseProjectReferences(
  project: CourseProjectDocument,
  emit: (reference: CourseProjectReference) => void,
): void {
  emit({ kind: 'location', id: project.startLocationId, path: ['startLocationId'] })
  Object.entries(project.media.audio.sounds).forEach(([key, sound]) => {
    emit({ kind: 'asset', id: sound.assetId, path: ['media', 'audio', 'sounds', key, 'assetId'] })
  })
  const addVisibilityReferences = (
    entries: ReadonlyArray<ScopedLayerItem>,
    path: CourseProjectPath,
  ): void => {
    entries.forEach((entry, entryIndex) => {
      entry.visibility.locationIds.forEach((locationId, locationIndex) => {
        emit({
          kind: 'location',
          id: locationId,
          path: [...path, entryIndex, 'visibility', 'locationIds', locationIndex],
        })
      })
    })
  }
  addVisibilityReferences(project.globalLayerItems, ['globalLayerItems'])
  addInteractionReferences(project.globalInteractions, ['globalInteractions'], emit)
  visitCourseProject(project, {
    layerItem: (item, path) => addLayerReferences(item, path, emit),
    location: (location, path) => {
      emit({ kind: 'surface', id: location.surfaceId, path: [...path, 'surfaceId'] })
      if (location.kind === 'slide-scene') {
        emit({ kind: 'scene', id: location.sceneId, path: [...path, 'sceneId'] })
      } else if (location.kind === 'flow-block') {
        emit({ kind: 'block', id: location.blockId, path: [...path, 'blockId'] })
      } else {
        emit({ kind: 'camera-frame', id: location.cameraFrameId, path: [...path, 'cameraFrameId'] })
      }
    },
    scene: (scene, path) => {
      addInteractionReferences(scene.interactions, [...path, 'interactions'], emit)
      if (scene.backgroundAssetId) {
        emit({ kind: 'asset', id: scene.backgroundAssetId, path: [...path, 'backgroundAssetId'] })
      }
      scene.presentation?.states.forEach((state, index) => {
        if (state.backgroundAssetId) {
          emit({ kind: 'asset', id: state.backgroundAssetId, path: [...path, 'presentation', 'states', index, 'backgroundAssetId'] })
        }
        Object.keys(state.layerItemOverrides).forEach((itemId) => {
          emit({ kind: 'layer-item', id: itemId, path: [...path, 'presentation', 'states', index, 'layerItemOverrides', itemId] })
        })
        state.layerItemOrder?.forEach((itemId, itemIndex) => {
          emit({ kind: 'layer-item', id: itemId, path: [...path, 'presentation', 'states', index, 'layerItemOrder', itemIndex] })
        })
      })
    },
    block: (block, path) => {
      if (block.type === 'media') {
        emit({ kind: 'asset', id: block.assetId, path: [...path, 'assetId'] })
      } else if (block.type === 'component') {
        emit({ kind: 'component', id: block.component.packageId, version: block.component.version, path: [...path, 'component'] })
        emit({ kind: 'asset', id: block.staticFallbackAssetId, path: [...path, 'staticFallbackAssetId'] })
      }
    },
    surface: (surface, path) => {
      addVisibilityReferences(surface.surfaceLayerItems, [...path, 'surfaceLayerItems'])
      if (surface.type === 'spatial-2d') {
        surface.semanticZoom.forEach((rule, ruleIndex) => {
          rule.layerItemIds.forEach((itemId, itemIndex) => {
            emit({ kind: 'layer-item', id: itemId, path: [...path, 'semanticZoom', ruleIndex, 'layerItemIds', itemIndex] })
          })
        })
      }
    },
  })
  project.navigationGuards.forEach((guard, guardIndex) => {
    ;[...(guard.fromLocationIds ?? []), ...guard.toLocationIds].forEach((locationId, index) => {
      emit({ kind: 'location', id: locationId, path: ['navigationGuards', guardIndex, 'locations', index] })
    })
    guard.conditions.forEach((condition, conditionIndex) => {
      emit({ kind: 'course-state', id: condition.key, path: ['navigationGuards', guardIndex, 'conditions', conditionIndex, 'key'] })
    })
  })
  project.mixedPrintPlan?.entries.forEach((entry, entryIndex) => {
    const path: CourseProjectPath = ['mixedPrintPlan', 'entries', entryIndex]
    emit({ kind: 'surface', id: entry.surfaceId, path: [...path, 'surfaceId'] })
    if (entry.kind === 'slide-scenes') {
      entry.sceneIds.forEach((sceneId, sceneIndex) => {
        emit({ kind: 'scene', id: sceneId, path: [...path, 'sceneIds', sceneIndex] })
      })
    } else if (entry.kind === 'spatial-frames') {
      entry.cameraFrameIds.forEach((frameId, frameIndex) => {
        emit({ kind: 'camera-frame', id: frameId, path: [...path, 'cameraFrameIds', frameIndex] })
      })
    }
  })
}

export function collectCourseProjectReferences(
  project: CourseProjectDocument,
): CourseProjectReference[] {
  const references: CourseProjectReference[] = []
  visitCourseProjectReferences(project, (reference) => references.push(reference))
  return references
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonPointerEscape(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function inventoryKind(value: unknown, semantic?: 'asset' | 'formula'): AuthoringInventoryValueKind {
  if (semantic) return semantic
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

interface InventoryTargetContext {
  scope: 'global' | 'surface' | 'scene'
  surfaceId?: string
  sceneId?: string
  carrier: LayerItem['kind']
  layerItemId: string
  stablePrefix: string
  jsonPointer: string
}

interface LayerInventoryTargetContext extends InventoryTargetContext {
  item: LayerItem
}

function addInventoryEntry(
  project: CourseProjectDocument,
  inventory: Record<string, DerivedAuthoringInventoryEntry>,
  target: InventoryTargetContext,
  field: string,
  label: string,
  value: unknown,
  semantic?: 'asset' | 'formula',
  pointerSegments?: ReadonlyArray<string | number>,
): void {
  const address = makeAuthoringAddress({
    projectId: project.id,
    scope: target.scope,
    surfaceId: target.surfaceId,
    sceneId: target.sceneId,
    carrier: target.carrier,
    layerItemId: target.layerItemId,
    field,
  })
  const pointerSuffix = (pointerSegments ?? field.split('.'))
    .map(String)
    .map(jsonPointerEscape)
    .join('/')
  inventory[address] = {
    stablePath: `${target.stablePrefix}/${field}`,
    jsonPointer: `${target.jsonPointer}/${pointerSuffix}`,
    valueKind: inventoryKind(value, semantic),
    label,
  }
}

function visitLeafValues(
  value: unknown,
  prefix: ReadonlyArray<string | number>,
  visit: (path: ReadonlyArray<string | number>, value: unknown) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => visitLeafValues(child, [...prefix, index], visit))
    return
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, child]) => {
      visitLeafValues(child, [...prefix, key], visit)
    })
    return
  }
  visit(prefix, value)
}

function deriveLayerInventory(
  project: CourseProjectDocument,
  inventory: Record<string, DerivedAuthoringInventoryEntry>,
  target: LayerInventoryTargetContext,
): void {
  ;([
    ['label', '图层名称'],
    ['frame.x', '水平位置'],
    ['frame.y', '垂直位置'],
    ['frame.width', '宽度'],
    ['frame.height', '高度'],
    ['rotation', '旋转'],
    ['opacity', '不透明度'],
    ['visible', '可见性'],
  ] as const).forEach(([field, label]) => {
    const value = field.startsWith('frame.')
      ? target.item.frame[field.slice(6) as keyof LayerItem['frame']]
      : target.item[field as keyof LayerItem]
    addInventoryEntry(project, inventory, target, field, label, value)
  })

  if (target.item.kind === 'runtime') {
    Object.entries(target.item.runtime.content.values).forEach(([key, value]) => {
      const metadata = target.item.kind === 'runtime'
        ? target.item.runtime.content.metadata?.[key]
        : undefined
      addInventoryEntry(
        project,
        inventory,
        target,
        `runtime/content/values/${jsonPointerEscape(key)}`,
        metadata?.label ?? key,
        value,
        undefined,
        ['runtime', 'content', 'values', key],
      )
    })
    Object.entries(target.item.runtime.assets).forEach(([key, binding]) => {
      addInventoryEntry(
        project,
        inventory,
        target,
        `runtime/assets/${jsonPointerEscape(key)}/assetId`,
        key,
        binding.assetId,
        'asset',
        ['runtime', 'assets', key, 'assetId'],
      )
    })
    return
  }
  if (target.item.kind === 'component') {
    visitLeafValues(target.item.props, ['props'], (segments, value) => {
      const field = segments.map(String).map(jsonPointerEscape).join('/')
      addInventoryEntry(project, inventory, target, field, segments.slice(1).join('.'), value, undefined, segments)
    })
    return
  }

  const content = target.item.content
  if (content.nativeType === 'text') {
    addInventoryEntry(project, inventory, target, 'content.data.text', '文字', content.data.text)
  } else if (content.nativeType === 'formula') {
    addInventoryEntry(project, inventory, target, 'content.data.accessibleText', '公式说明', content.data.accessibleText)
    addInventoryEntry(project, inventory, target, 'content.data.ast', '公式', content.data.ast, 'formula')
  } else if (content.nativeType === 'image') {
    addInventoryEntry(project, inventory, target, 'content.data.assetId', '图片', content.data.assetId, 'asset')
  } else if (content.nativeType === 'video') {
    addInventoryEntry(project, inventory, target, 'content.data.assetId', '视频', content.data.assetId, 'asset')
    if (content.data.poster.assetId) {
      addInventoryEntry(project, inventory, target, 'content.data.poster.assetId', '视频封面', content.data.poster.assetId, 'asset')
    }
  } else if (content.nativeType === 'teacher-controller') {
    addInventoryEntry(project, inventory, target, 'content.data.title', '教师控制器标题', content.data.title)
    content.data.buttons.forEach((button, index) => {
      addInventoryEntry(project, inventory, target, `content.data.buttons.${index}.label`, `按钮：${button.id}`, button.label)
    })
  } else {
    visitLeafValues(content.data.style, ['content', 'data', 'style'], (segments, value) => {
      const field = segments.map(String).map(jsonPointerEscape).join('/')
      addInventoryEntry(project, inventory, target, field, segments.slice(3).join('.'), value, undefined, segments)
    })
  }
}

/**
 * Rebuilds the complete authoring inventory from Project V9. Nothing returned
 * here is persisted; callers must discard it when `project.revision` changes.
 */
export function deriveCourseProjectAuthoringInventory(
  project: CourseProjectDocument,
): DerivedAuthoringInventory {
  const inventory: Record<string, DerivedAuthoringInventoryEntry> = {}
  project.globalLayerItems.forEach((entry, index) => {
    deriveLayerInventory(project, inventory, {
      scope: 'global',
      item: entry.item,
      carrier: entry.item.kind,
      layerItemId: entry.item.layerItemId,
      stablePrefix: `global/layer:${entry.item.layerItemId}`,
      jsonPointer: `/globalLayerItems/${index}/item`,
    })
  })
  project.surfaces.forEach((surface, surfaceIndex) => {
    surface.surfaceLayerItems.forEach((entry, itemIndex) => {
      deriveLayerInventory(project, inventory, {
        scope: 'surface',
        surfaceId: surface.id,
        item: entry.item,
        carrier: entry.item.kind,
        layerItemId: entry.item.layerItemId,
        stablePrefix: `surface:${surface.id}/layer:${entry.item.layerItemId}`,
        jsonPointer: `/surfaces/${surfaceIndex}/surfaceLayerItems/${itemIndex}/item`,
      })
    })
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene, sceneIndex) => {
        scene.layerItems.forEach((item, itemIndex) => {
          deriveLayerInventory(project, inventory, {
            scope: 'scene',
            surfaceId: surface.id,
            sceneId: scene.id,
            item,
            carrier: item.kind,
            layerItemId: item.layerItemId,
            stablePrefix: `surface:${surface.id}/scene:${scene.id}/layer:${item.layerItemId}`,
            jsonPointer: `/surfaces/${surfaceIndex}/scenes/${sceneIndex}/layerItems/${itemIndex}`,
          })
        })
      })
    } else if (surface.type === 'flow') {
      const walk = (blocks: FlowBlock[], indices: number[]): void => {
        blocks.forEach((block, index) => {
          const nextIndices = [...indices, index]
          const pointerParts: Array<string | number> = ['surfaces', surfaceIndex, 'blocks']
          nextIndices.forEach((part, partIndex) => {
            pointerParts.push(part)
            if (partIndex < nextIndices.length - 1) pointerParts.push('blocks')
          })
          const pointer = `/${pointerParts.map(String).map(jsonPointerEscape).join('/')}`
          const target: InventoryTargetContext = {
            scope: 'surface', surfaceId: surface.id,
            carrier: block.type === 'component' ? 'component' : 'native',
            layerItemId: block.id,
            stablePrefix: `surface:${surface.id}/block:${block.id}`,
            jsonPointer: pointer,
          }
          if ('text' in block && typeof block.text === 'string') {
            addInventoryEntry(project, inventory, target, 'text', block.type, block.text)
          }
          if (block.type === 'quote' && block.citation !== undefined) {
            addInventoryEntry(project, inventory, target, 'citation', '引用出处', block.citation)
          } else if (block.type === 'list') {
            block.items.forEach((item, itemIndex) => {
              addInventoryEntry(
                project, inventory, target, `items/${jsonPointerEscape(item.id)}/text`,
                `列表项：${item.id}`, item.text, undefined, ['items', itemIndex, 'text'],
              )
              addInventoryEntry(
                project, inventory, target, `items/${jsonPointerEscape(item.id)}/level`,
                `列表层级：${item.id}`, item.level, undefined, ['items', itemIndex, 'level'],
              )
            })
          } else if (block.type === 'media') {
            addInventoryEntry(project, inventory, target, 'assetId', '媒体', block.assetId, 'asset')
            if (block.altText !== undefined) addInventoryEntry(project, inventory, target, 'altText', '替代文本', block.altText)
            if (block.caption !== undefined) addInventoryEntry(project, inventory, target, 'caption', '图注', block.caption)
          } else if (block.type === 'table') {
            block.columns.forEach((column, columnIndex) => {
              addInventoryEntry(
                project, inventory, target, `columns/${jsonPointerEscape(column.id)}/header`,
                `列标题：${column.id}`, column.header, undefined, ['columns', columnIndex, 'header'],
              )
            })
            block.rows.forEach((row, rowIndex) => {
              block.columns.forEach((column) => {
                addInventoryEntry(
                  project, inventory, target,
                  `rows/${jsonPointerEscape(row.id)}/cells/${jsonPointerEscape(column.id)}`,
                  `表格：${row.id}/${column.id}`, row.cells[column.id] ?? '', undefined,
                  ['rows', rowIndex, 'cells', column.id],
                )
              })
            })
          } else if (block.type === 'formula') {
            addInventoryEntry(project, inventory, target, 'accessibleText', '公式说明', block.accessibleText)
            addInventoryEntry(project, inventory, target, 'ast', '公式', block.ast, 'formula')
          } else if (block.type === 'code') {
            addInventoryEntry(project, inventory, target, 'code', '代码', block.code)
          } else if (block.type === 'callout') {
            addInventoryEntry(project, inventory, target, 'body', '提示内容', block.body)
            if (block.title !== undefined) addInventoryEntry(project, inventory, target, 'title', '提示标题', block.title)
          } else if (block.type === 'section') {
            addInventoryEntry(project, inventory, target, 'title', '章节标题', block.title)
            walk(block.blocks, nextIndices)
          } else if (block.type === 'component') {
            visitLeafValues(block.props, ['props'], (segments, value) => {
              const field = segments.map(String).map(jsonPointerEscape).join('/')
              addInventoryEntry(project, inventory, target, field, segments.slice(1).join('.'), value, undefined, segments)
            })
            addInventoryEntry(project, inventory, target, 'staticFallbackAssetId', '静态后备', block.staticFallbackAssetId, 'asset')
          }
        })
      }
      walk(surface.blocks, [])
    } else {
      surface.world.layerItems.forEach((item, itemIndex) => {
        deriveLayerInventory(project, inventory, {
          scope: 'surface',
          surfaceId: surface.id,
          item,
          carrier: item.kind,
          layerItemId: item.layerItemId,
          stablePrefix: `surface:${surface.id}/layer:${item.layerItemId}`,
          jsonPointer: `/surfaces/${surfaceIndex}/world/layerItems/${itemIndex}`,
        })
      })
    }
  })
  return Object.freeze(Object.fromEntries(
    Object.entries(inventory)
      .sort(([left], [right]) => compareStableStrings(left, right))
      .map(([address, entry]) => [address, Object.freeze(entry)]),
  ))
}

export function deriveCourseProjectAuthoringInventorySnapshot(
  project: CourseProjectDocument,
): Readonly<DerivedAuthoringInventorySnapshot> {
  return Object.freeze({
    projectId: project.id,
    revision: project.revision,
    entries: deriveCourseProjectAuthoringInventory(project),
  })
}
