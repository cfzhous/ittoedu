import type {
  CourseProjectDocument,
  FlowBlock,
  LayerItem,
} from '../../shared/courseProjectTypes'
import {
  deriveCourseProjectAuthoringInventorySnapshot,
} from '../../shared/courseProjectModel'
import type { CourseAuthoringPatch } from '../course/courseStudioModel'

/**
 * D2/D3 未挂载纯接口：单目标 `replace` Patch 的 parser 与 preflight。
 *
 * 硬边界（与 AI_NATIVE_PARALLEL_40_AI_INTERFACE_LANE §5/§6 一致）：
 * - 只接受显式参数并返回结构化数据；不读取 Store、DOM、window、文件、网络或 IPC。
 * - 不调用 `applyCourseAuthoringPatch`，不 clone-and-commit，不修改 project，
 *   不生成 history/dirty/revision。
 * - 地址只通过 `deriveCourseProjectAuthoringInventorySnapshot` 查证，不手拼
 *   JSON Pointer、不生成另一套作者地址。
 * - 公开 export 只有单目标 parser/preflight；batch 形态一律拒绝，不新增任何
 *   batch 类型/parser/执行结构。
 * - 本文件不得被任何产品文件 import。
 */

export type CourseAiPatchRejectCode =
  | 'parse-invalid'
  | 'batch-not-supported'
  | 'target-missing'
  | 'stale-revision'
  | 'expected-value-mismatch'
  | 'target-locked'

export class CourseAiPatchParseError extends Error {
  readonly code: CourseAiPatchRejectCode

  constructor(code: CourseAiPatchRejectCode, message: string) {
    super(message)
    this.name = 'CourseAiPatchParseError'
    this.code = code
  }
}

export interface CourseAiPatchImpact {
  project: {
    id: string
    revision: number
  }
  target: {
    label: string
  }
  field: {
    label: string
  }
  authoringAddress: string
  currentValue: unknown
  nextValue: unknown
}

export type CourseAiPatchPreflightResult =
  | { ok: true; patch: CourseAuthoringPatch; impact: CourseAiPatchImpact }
  | { ok: false; code: CourseAiPatchRejectCode; message: string }

const AUTHORING_ADDRESS_PREFIX = 'courseware://authoring/'

const PATCH_FIELDS = new Set([
  'op',
  'expectedRevision',
  'authoringAddress',
  'value',
  'expectedValue',
])

/** Batch container keys; any array-valued occurrence is rejected outright. */
const BATCH_KEYS = ['operations', 'patches'] as const

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

type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'forbidden' | 'invalid' }

/** Read-only resolution of an inventory `jsonPointer` against `root`. */
function readPointerValue(root: unknown, pointer: string): ReadResult {
  if (!pointer.startsWith('/')) return { ok: false, reason: 'invalid' }
  const segments = pointer.slice(1).split('/').map(unescapeJsonPointerSegment)
  let current: unknown = root
  for (const segment of segments) {
    if (FORBIDDEN_JSON_POINTER_SEGMENTS.has(segment)) {
      return { ok: false, reason: 'forbidden' }
    }
    if (current === null || typeof current !== 'object') {
      return { ok: false, reason: 'invalid' }
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { ok: false, reason: 'invalid' }
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return { ok: true, value: current }
}

/** Detaches values so the preflight result cannot mutate project data. */
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

/**
 * Canonical comparison used by `applyCourseAuthoringPatch`
 * (src/renderer/course/courseStudioModel.ts:2073): JSON.stringify equality.
 */
function canonical(value: unknown): string | undefined {
  return JSON.stringify(value)
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

type TargetInfo =
  | { kind: 'layer-item'; label: string; locked: boolean }
  | { kind: 'flow-block'; label: string }

/**
 * Locates the addressed item/block inside the current project to decide the
 * lock boundary. Flow blocks have no `locked` field and are never reported as
 * locked.
 */
function resolveTargetInfo(
  project: CourseProjectDocument,
  parts: ParsedAuthoringAddress,
): TargetInfo | null {
  if (parts.scope === 'global') {
    const item = project.globalLayerItems.find(
      (entry) => entry.item.layerItemId === parts.layerItemId,
    )?.item
    return item ? { kind: 'layer-item', label: item.label, locked: item.locked } : null
  }
  const surface = project.surfaces.find((candidate) => candidate.id === parts.surfaceId)
  if (!surface) return null
  if (parts.scope === 'scene') {
    if (surface.type !== 'slide') return null
    const scene = surface.scenes.find((candidate) => candidate.id === parts.sceneId)
    const item = scene?.layerItems.find(
      (candidate) => candidate.layerItemId === parts.layerItemId,
    )
    return item ? { kind: 'layer-item', label: item.label, locked: item.locked } : null
  }
  const surfaceItem = surface.surfaceLayerItems.find(
    (entry) => entry.item.layerItemId === parts.layerItemId,
  )?.item
  if (surfaceItem) return { kind: 'layer-item', label: surfaceItem.label, locked: surfaceItem.locked }
  if (surface.type === 'flow') {
    const block = findFlowBlock(surface.blocks, parts.layerItemId)
    return block ? { kind: 'flow-block', label: flowBlockLabel(block) } : null
  }
  if (surface.type === 'spatial-2d') {
    const item = surface.world.layerItems.find(
      (candidate) => candidate.layerItemId === parts.layerItemId,
    )
    return item ? { kind: 'layer-item', label: item.label, locked: item.locked } : null
  }
  return null
}

function reject(code: CourseAiPatchRejectCode, message: string): CourseAiPatchPreflightResult {
  return { ok: false, code, message }
}

/**
 * Parses one plain-object single-target `replace` Patch. Batch-like shapes
 * (root arrays, `operations`/`patches` arrays) throw
 * `CourseAiPatchParseError` with code `batch-not-supported`; any other shape
 * violation throws with code `parse-invalid`.
 */
export function parseSingleCourseAiPatch(value: unknown): CourseAuthoringPatch {
  if (Array.isArray(value)) {
    throw new CourseAiPatchParseError(
      'batch-not-supported',
      '不支持批量 Patch；请只提交单个 replace 对象',
    )
  }
  if (typeof value !== 'object' || value === null) {
    throw new CourseAiPatchParseError('parse-invalid', 'AI Patch 根节点必须是普通对象')
  }
  const record = value as Record<string, unknown>
  for (const key of BATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key) && Array.isArray(record[key])) {
      throw new CourseAiPatchParseError(
        'batch-not-supported',
        `不支持批量字段 ${key}；请只提交单个 replace 对象`,
      )
    }
  }
  for (const key of Object.keys(record)) {
    if (!PATCH_FIELDS.has(key)) {
      throw new CourseAiPatchParseError('parse-invalid', `AI Patch 包含未知字段：${key}`)
    }
  }
  if (record.op !== 'replace') {
    throw new CourseAiPatchParseError('parse-invalid', 'AI Patch 仅支持 op="replace"')
  }
  const revision = record.expectedRevision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new CourseAiPatchParseError('parse-invalid', 'AI Patch.expectedRevision 必须是非负安全整数')
  }
  const address = record.authoringAddress
  if (typeof address !== 'string' || !address.startsWith(AUTHORING_ADDRESS_PREFIX)) {
    throw new CourseAiPatchParseError('parse-invalid', 'AI Patch.authoringAddress 无效')
  }
  if (!parseAuthoringAddress(address)) {
    throw new CourseAiPatchParseError('parse-invalid', 'AI Patch.authoringAddress 格式无效')
  }
  if (!Object.prototype.hasOwnProperty.call(record, 'value')) {
    throw new CourseAiPatchParseError('parse-invalid', 'AI Patch 缺少 value')
  }
  return {
    op: 'replace',
    expectedRevision: revision,
    authoringAddress: address,
    value: structuredClone(record.value),
    ...(Object.prototype.hasOwnProperty.call(record, 'expectedValue')
      ? { expectedValue: structuredClone(record.expectedValue) }
      : {}),
  }
}

/**
 * Preflights one in-memory single-target `replace` against the current
 * project. All rejection paths return a stable code and a teacher-readable
 * message; no one-off `jsonPointer` is ever exposed. The project is never
 * modified and no history/dirty/revision is generated.
 */
export function preflightSingleCourseAiPatch(input: {
  project: CourseProjectDocument
  value: unknown
}): CourseAiPatchPreflightResult {
  let patch: CourseAuthoringPatch
  try {
    patch = parseSingleCourseAiPatch(input.value)
  } catch (error) {
    if (error instanceof CourseAiPatchParseError) {
      return reject(error.code, error.message)
    }
    throw error
  }

  const project = input.project
  const snapshot = deriveCourseProjectAuthoringInventorySnapshot(project)
  const entry = snapshot.entries[patch.authoringAddress]
  if (!entry) {
    return reject('target-missing', '作者地址不属于当前工程或已失效')
  }

  const read = readPointerValue(project, entry.jsonPointer)
  if (!read.ok) {
    return reject(
      'target-missing',
      read.reason === 'forbidden'
        ? '目标字段包含不允许的字段段，不能安全读取'
        : '目标字段已失效，无法读取当前值',
    )
  }

  if ('expectedValue' in patch && canonical(read.value) !== canonical(patch.expectedValue)) {
    return reject('expected-value-mismatch', '目标字段在点选后已被修改，与期望值不一致')
  }

  if (patch.expectedRevision !== snapshot.revision) {
    return reject(
      'stale-revision',
      `课件已被修改：期望 revision ${patch.expectedRevision}，当前为 ${snapshot.revision}`,
    )
  }

  const parts = parseAuthoringAddress(patch.authoringAddress)
  if (!parts) return reject('parse-invalid', 'AI Patch.authoringAddress 格式无效')
  const target = resolveTargetInfo(project, parts)
  if (!target) return reject('target-missing', '无法定位目标图层或块')
  if (target.kind === 'layer-item' && target.locked) {
    return reject('target-locked', `目标图层「${target.label}」已锁定，不能修改`)
  }

  return {
    ok: true,
    patch,
    impact: deepFreeze({
      project: { id: snapshot.projectId, revision: snapshot.revision },
      target: { label: target.label },
      field: { label: entry.label },
      authoringAddress: patch.authoringAddress,
      currentValue: snapshotValue(read.value),
      nextValue: snapshotValue(patch.value),
    }),
  }
}
