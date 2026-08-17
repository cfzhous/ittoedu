import type {
  CourseLocation,
  CourseProjectDocument,
  FlowBlock,
  LayerItem,
} from '../../shared/courseProjectTypes'
import {
  deriveCourseProjectAuthoringInventorySnapshot,
  type AuthoringInventoryValueKind,
} from '../../shared/courseProjectModel'
import { compareStableStrings } from '../../shared/stableOrder'

/**
 * D1 未挂载纯接口：从显式 V9 project、location 与 source-aware target 构造
 * 稳定字段上下文，供未来另行授权的外部协作调用。
 *
 * 硬边界（与 AI_NATIVE_PARALLEL_40_AI_INTERFACE_LANE §2 一致）：
 * - 只接受显式参数并返回结构化数据；不读取 Store、DOM、window、文件、网络或 IPC。
 * - 结果不持久化、不修改工程、不产生 history/revision/dirty，不发布实时 selection。
 * - 字段地址只来自 `deriveCourseProjectAuthoringInventorySnapshot`，不手拼
 *   JSON Pointer、不生成另一套作者地址。
 * - 本文件不得被任何产品文件 import。
 */

export type CourseAiHandoffSource =
  | 'global'
  | 'surface'
  | 'scene'
  | 'world'
  | 'flow-block'

export type CourseAiHandoffTarget =
  | { locationId: string; source: 'global'; layerItemId: string }
  | { locationId: string; source: 'surface'; surfaceId: string; layerItemId: string }
  | {
      locationId: string
      source: 'scene'
      surfaceId: string
      sceneId: string
      layerItemId: string
    }
  | { locationId: string; source: 'world'; surfaceId: string; layerItemId: string }
  | { locationId: string; source: 'flow-block'; surfaceId: string; blockId: string }

export interface CourseAiHandoffField {
  label: string
  authoringAddress: string
  valueKind: AuthoringInventoryValueKind
  currentValue: unknown
}

export interface CourseAiHandoff {
  projectId: string
  projectRevision: number
  location: {
    id: string
    label: string
    kind: CourseLocation['kind']
  }
  target: {
    source: CourseAiHandoffSource
    stableId: string
    label: string
  }
  fields: readonly CourseAiHandoffField[]
}

const AUTHORING_ADDRESS_PREFIX = 'courseware://authoring/'

interface ParsedAuthoringAddress {
  projectId: string
  scope: 'global' | 'surface' | 'scene'
  surfaceId: string
  sceneId: string
  carrier: string
  layerItemId: string
  field: string
}

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * Parses the stable address produced by `makeAuthoringAddress`:
 * `courseware://authoring/{projectId}/{scope}/{surfaceId}/{sceneId}/{carrier}/{layerItemId}?field={field}`.
 * The parser is string-based and never touches DOM `URL`.
 */
function parseAuthoringAddress(address: string): ParsedAuthoringAddress | null {
  if (!address.startsWith(AUTHORING_ADDRESS_PREFIX)) return null
  const rest = address.slice(AUTHORING_ADDRESS_PREFIX.length)
  const queryIndex = rest.indexOf('?field=')
  if (queryIndex < 0) return null
  const field = decodeSegment(rest.slice(queryIndex + '?field='.length))
  if (field === null) return null
  const segments = rest.slice(0, queryIndex).split('/')
  if (segments.length !== 6) return null
  const [projectId, scope, surfaceId, sceneId, carrier, layerItemId] = segments
  if (scope !== 'global' && scope !== 'surface' && scope !== 'scene') return null
  const decoded = [projectId, surfaceId, sceneId, layerItemId].map(decodeSegment)
  if (decoded.some((value) => value === null)) return null
  return {
    projectId: decoded[0]!,
    scope,
    surfaceId: decoded[1]!,
    sceneId: decoded[2]!,
    carrier: carrier!,
    layerItemId: decoded[3]!,
    field,
  }
}

/** Prototype-related segments must never be traversed during value resolution. */
const FORBIDDEN_JSON_POINTER_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

/** Read-only resolution of an inventory `jsonPointer` against `root`. */
function resolveJsonPointerReadonly(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return undefined
  const segments = pointer.slice(1).split('/').map(unescapeJsonPointerSegment)
  let current: unknown = root
  for (const segment of segments) {
    if (FORBIDDEN_JSON_POINTER_SEGMENTS.has(segment)) return undefined
    if (current === null || typeof current !== 'object') return undefined
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** Detaches the resolved value so the handoff cannot mutate project data. */
function snapshotValue(value: unknown): unknown {
  return value !== null && typeof value === 'object'
    ? structuredClone(value)
    : value
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child)
    }
  }
  return value
}

function findLocation(
  project: CourseProjectDocument,
  locationId: string,
): CourseLocation | null {
  return project.locations.find((location) => location.id === locationId) ?? null
}

function findFlowBlock(
  blocks: readonly FlowBlock[],
  blockId: string,
): FlowBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block
    if (block.type === 'section') {
      const nested = findFlowBlock(block.blocks, blockId)
      if (nested) return nested
    }
  }
  return null
}

/** Human-readable stable label for a Flow block target. */
function flowBlockLabel(block: FlowBlock): string {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
    return block.text.trim().slice(0, 48) || block.type
  }
  if (block.type === 'callout') {
    return block.title?.trim() || block.body.trim().slice(0, 48) || '提示'
  }
  if (block.type === 'section') return block.title.trim() || '分节'
  if (block.type === 'media') {
    return block.caption?.trim() || block.altText?.trim() || '媒体'
  }
  if (block.type === 'code') return block.language ? `代码·${block.language}` : '代码'
  if (block.type === 'formula') return block.accessibleText.trim() || '公式'
  if (block.type === 'component') return `组件·${block.component.packageId}`
  if (block.type === 'list') return block.items[0]?.text.trim().slice(0, 48) || '列表'
  if (block.type === 'table') return block.caption?.trim() || '表格'
  return '分隔线'
}

interface ResolvedTarget {
  stableId: string
  label: string
  filter: (parts: ParsedAuthoringAddress) => boolean
}

/**
 * Validates the explicit target against the current project and returns a
 * source-aware inventory filter. Any mismatch returns `null`; the helper never
 * guesses the current selection.
 */
function resolveTarget(
  project: CourseProjectDocument,
  target: CourseAiHandoffTarget,
  location: CourseLocation,
): ResolvedTarget | null {
  if (target.source === 'global') {
    const item = project.globalLayerItems.find(
      (entry) => entry.item.layerItemId === target.layerItemId,
    )?.item
    if (!item) return null
    return {
      stableId: item.layerItemId,
      label: item.label,
      filter: (parts) =>
        parts.scope === 'global' && parts.layerItemId === item.layerItemId,
    }
  }

  const surface = project.surfaces.find(
    (candidate) => candidate.id === target.surfaceId,
  )
  if (!surface) return null

  switch (target.source) {
    case 'surface': {
      if (location.surfaceId !== surface.id) return null
      const item = surface.surfaceLayerItems.find(
        (entry) => entry.item.layerItemId === target.layerItemId,
      )?.item
      if (!item) return null
      return {
        stableId: item.layerItemId,
        label: item.label,
        filter: (parts) =>
          parts.scope === 'surface' &&
          parts.surfaceId === surface.id &&
          parts.layerItemId === item.layerItemId,
      }
    }
    case 'scene': {
      if (surface.type !== 'slide') return null
      const scene = surface.scenes.find(
        (candidate) => candidate.id === target.sceneId,
      )
      if (!scene) return null
      if (
        location.kind !== 'slide-scene' ||
        location.surfaceId !== surface.id ||
        location.sceneId !== target.sceneId
      ) {
        return null
      }
      const item = scene.layerItems.find(
        (candidate) => candidate.layerItemId === target.layerItemId,
      )
      if (!item) return null
      return {
        stableId: item.layerItemId,
        label: item.label,
        filter: (parts) =>
          parts.scope === 'scene' &&
          parts.surfaceId === surface.id &&
          parts.sceneId === target.sceneId &&
          parts.layerItemId === item.layerItemId,
      }
    }
    case 'world': {
      if (surface.type !== 'spatial-2d') return null
      if (location.surfaceId !== surface.id) return null
      const item = surface.world.layerItems.find(
        (candidate) => candidate.layerItemId === target.layerItemId,
      )
      if (!item) return null
      return {
        stableId: item.layerItemId,
        label: item.label,
        filter: (parts) =>
          parts.scope === 'surface' &&
          parts.surfaceId === surface.id &&
          parts.layerItemId === item.layerItemId,
      }
    }
    case 'flow-block': {
      if (surface.type !== 'flow') return null
      const block = findFlowBlock(surface.blocks, target.blockId)
      if (!block) return null
      if (
        location.kind !== 'flow-block' ||
        location.surfaceId !== surface.id ||
        location.blockId !== target.blockId
      ) {
        return null
      }
      return {
        stableId: block.id,
        label: flowBlockLabel(block),
        filter: (parts) =>
          parts.scope === 'surface' &&
          parts.surfaceId === surface.id &&
          parts.layerItemId === block.id,
      }
    }
  }
}

/**
 * Builds a stable field-context handoff for one explicit target.
 * Returns `null` when the location or target is missing/mismatched. The result
 * is frozen and detached; the helper never mutates `input.project` and never
 * caches (callers must rebuild after any revision change).
 */
export function buildCourseAiHandoff(input: {
  project: CourseProjectDocument
  target: CourseAiHandoffTarget
}): CourseAiHandoff | null {
  const { project, target } = input
  const location = findLocation(project, target.locationId)
  if (!location) return null
  const resolved = resolveTarget(project, target, location)
  if (!resolved) return null

  const snapshot = deriveCourseProjectAuthoringInventorySnapshot(project)
  const fields: CourseAiHandoffField[] = []
  for (const [address, entry] of Object.entries(snapshot.entries)) {
    const parts = parseAuthoringAddress(address)
    if (!parts || !resolved.filter(parts)) continue
    fields.push({
      label: entry.label,
      authoringAddress: address,
      valueKind: entry.valueKind,
      currentValue: snapshotValue(
        resolveJsonPointerReadonly(project, entry.jsonPointer),
      ),
    })
  }
  fields.sort((left, right) =>
    compareStableStrings(left.authoringAddress, right.authoringAddress),
  )

  return deepFreeze({
    projectId: snapshot.projectId,
    projectRevision: snapshot.revision,
    location: {
      id: location.id,
      label: location.label,
      kind: location.kind,
    },
    target: {
      source: target.source,
      stableId: resolved.stableId,
      label: resolved.label,
    },
    fields,
  })
}
