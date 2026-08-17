import {
  EDITOR_ACTION_IDS,
  captureEditorMenuSnapshot,
  describeEditorAuthoringOwner,
  isEditorWriteAction,
  isTextLikeEditorFocus,
  type EditorActionAdapterResult,
  type EditorActionAdapters,
  type EditorActionAvailability,
  type EditorActionEntrySource,
  type EditorActionId,
  type EditorActionResult,
  type EditorAuthoringOwner,
  type EditorSelectionSnapshot,
  type EditorSelectedTarget,
} from './editorActionTypes'

export type { EditorActionEntrySource }

export type EditorEntryInterpretation =
  | { readonly kind: 'open-menu' }
  | { readonly kind: 'close-menu' }
  | { readonly kind: 'action'; readonly actionId: EditorActionId }
  | { readonly kind: 'ignore' }

export interface EditorEntryInput {
  readonly source: EditorActionEntrySource
  readonly key?: string
  readonly shiftKey?: boolean
  readonly snapshot?: EditorSelectionSnapshot
  readonly actionId?: EditorActionId
}

const OWNER_ORDER: readonly EditorAuthoringOwner[] = [
  'global',
  'surface',
  'scene',
  'location',
  'state',
  'flow-block',
  'spatial-world',
  'spatial-camera',
  'spatial-path',
  'spatial-relation',
]

const ACTION_VERBS: Record<EditorActionId, string> = {
  'select-all': '全选',
  copy: '复制',
  cut: '剪切',
  paste: '粘贴',
  duplicate: '重复',
  delete: '删除',
  rename: '重命名',
  'move-forward': '上移',
  'move-backward': '下移',
  'bring-front': '置顶',
  'send-back': '置底',
  show: '显示',
  hide: '隐藏',
  lock: '锁定',
  unlock: '解锁',
  'edit-text': '编辑文字',
  'edit-formula': '编辑公式',
  'replace-media': '替换媒体',
  'insert-before': '在前方插入',
  'insert-after': '在后方插入',
  indent: '缩进',
  outdent: '取消缩进',
  focus: '聚焦',
  fit: '适配视图',
  'reset-view': '重置视图',
}

const CROSS_OWNER_ACTIONS = new Set<EditorActionId>([
  'copy',
  'cut',
  'duplicate',
  'delete',
  'rename',
  'move-forward',
  'move-backward',
  'bring-front',
  'send-back',
  'show',
  'hide',
  'lock',
  'unlock',
  'edit-text',
  'edit-formula',
  'replace-media',
  'insert-before',
  'insert-after',
  'indent',
  'outdent',
  'focus',
])

export function interpretEditorEntry(input: EditorEntryInput): EditorEntryInterpretation {
  if (input.actionId) return { kind: 'action', actionId: input.actionId }

  if (input.source === 'mouse-contextmenu') return { kind: 'open-menu' }

  if (input.source === 'keyboard') {
    const key = input.key ?? ''
    if (key === 'Escape') return { kind: 'close-menu' }
    if (key === 'F10' && input.shiftKey) return { kind: 'open-menu' }
    if (key === 'ContextMenu' || key === 'Menu') return { kind: 'open-menu' }
    if (key === 'Delete' || key === 'Backspace') {
      if (input.snapshot && isTextLikeEditorFocus(input.snapshot.focus)) {
        return { kind: 'ignore' }
      }
      return { kind: 'action', actionId: 'delete' }
    }
  }

  return { kind: 'ignore' }
}

export function listEditorActions(
  snapshot: EditorSelectionSnapshot,
): readonly EditorActionAvailability[] {
  return EDITOR_ACTION_IDS.map((actionId) =>
    resolveEditorActionAvailability(actionId, snapshot),
  )
}

export function resolveEditorActionAvailability(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
): EditorActionAvailability {
  const reason = availabilityReason(actionId, snapshot)
  return {
    actionId,
    enabled: reason === null,
    reason: reason ?? enabledReason(actionId, snapshot),
  }
}

export function resolveEditorAdapterKind(
  snapshot: EditorSelectionSnapshot,
  actionId: EditorActionId,
): 'global' | 'surface' {
  if (actionId === 'fit' || actionId === 'reset-view') return 'surface'
  if (snapshot.owner === 'global') return 'global'
  if (
    snapshot.targets.length > 0 &&
    snapshot.targets.every((target) => target.owner === 'global')
  ) {
    return 'global'
  }
  return 'surface'
}

export function routeEditorAction(input: {
  readonly actionId: EditorActionId
  readonly snapshot: EditorSelectionSnapshot
  readonly adapters: EditorActionAdapters
}): EditorActionResult {
  const availability = resolveEditorActionAvailability(input.actionId, input.snapshot)
  if (!availability.enabled) {
    return {
      actionId: input.actionId,
      ok: false,
      reason: availability.reason,
      adapter: 'none',
    }
  }

  const adapterKind = resolveEditorAdapterKind(input.snapshot, input.actionId)
  const adapter = input.adapters[adapterKind]
  if (!adapter) {
    return {
      actionId: input.actionId,
      ok: false,
      reason: adapterKind === 'global'
        ? '尚未接入全局层动作适配器'
        : '尚未接入当前页面动作适配器',
      adapter: 'none',
    }
  }

  try {
    const result = adapter.execute(input.actionId, input.snapshot)
    return finalizeAdapterResult(input.actionId, adapterKind, result)
  } catch (error) {
    return {
      actionId: input.actionId,
      ok: false,
      adapter: adapterKind,
      reason: error instanceof Error && error.message.trim()
        ? error.message
        : `${ACTION_VERBS[input.actionId]}失败`,
    }
  }
}

export { captureEditorMenuSnapshot }

function finalizeAdapterResult(
  actionId: EditorActionId,
  adapter: 'global' | 'surface',
  result: EditorActionAdapterResult | null | undefined,
): EditorActionResult {
  if (!result || typeof result.ok !== 'boolean' || !result.reason?.trim()) {
    return {
      actionId,
      ok: false,
      adapter,
      reason: '适配器未返回明确结果',
    }
  }
  return {
    actionId,
    ok: result.ok,
    adapter,
    reason: result.reason,
  }
}

function availabilityReason(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
): string | null {
  if (isViewportAction(actionId)) {
    return snapshot.surfaceKind === 'flow'
      ? `流式页面不支持${ACTION_VERBS[actionId]}`
      : null
  }

  if (actionId === 'select-all') {
    return isTextLikeEditorFocus(snapshot.focus)
      ? '文字或作者编辑中，全选只作用于当前编辑内容'
      : null
  }

  if (actionId === 'paste') {
    if (isTextLikeEditorFocus(snapshot.focus)) {
      return '文字或作者编辑中，粘贴只作用于当前编辑内容'
    }
    return snapshot.constraints.clipboardAvailable ? null : '剪贴板为空，无法粘贴'
  }

  const targets = snapshot.targets
  const owners = uniqueOwners(targets)

  if (CROSS_OWNER_ACTIONS.has(actionId) && owners.length > 1) {
    return crossOwnerReason(actionId, owners)
  }

  if (actionId === 'copy') {
    if (isTextLikeEditorFocus(snapshot.focus)) {
      return '文字或作者编辑中，复制只作用于当前编辑内容'
    }
    return targets.length === 0 ? '没有可复制的选择' : null
  }

  if (isTextLikeEditorFocus(snapshot.focus) && blocksTextFocus(actionId)) {
    return actionId === 'delete'
      ? '文字或作者编辑中，Delete/Backspace 只编辑文本，不删除元素'
      : `文字或作者编辑中，不能${ACTION_VERBS[actionId]}元素`
  }

  if (actionId === 'unlock') {
    if (targets.length === 0) return '没有可解锁的选择'
    if (!targets.every((target) => supportsLock(target.owner))) {
      return '该选择不支持锁定'
    }
    return targets.some((target) => target.locked) ? null : '所选元素未锁定'
  }

  if (actionId === 'lock') {
    return lockReason(targets)
  }

  if (targets.some((target) => target.locked) && isEditorWriteAction(actionId)) {
    return `锁定元素不能${ACTION_VERBS[actionId]}；请先解锁`
  }

  switch (actionId) {
    case 'cut':
      return targets.length === 0 ? '没有可剪切的选择' : null
    case 'duplicate':
      return targets.length === 0 ? '没有可重复的选择' : null
    case 'delete':
      return deleteReason(snapshot, targets)
    case 'rename':
      return singleTargetReason(targets, '重命名')
    case 'move-forward':
      return reorderReason(snapshot, targets, 'forward')
    case 'move-backward':
      return reorderReason(snapshot, targets, 'backward')
    case 'bring-front':
      return stackReason(snapshot, targets, 'front')
    case 'send-back':
      return stackReason(snapshot, targets, 'back')
    case 'show':
      return visibilityReason(targets, 'show')
    case 'hide':
      return visibilityReason(targets, 'hide')
    case 'edit-text':
      return editKindReason(targets, 'text', '请选择一个文字元素后编辑')
    case 'edit-formula':
      return editKindReason(targets, 'formula', '请选择一个公式元素后编辑')
    case 'replace-media':
      return replaceMediaReason(targets)
    case 'insert-before':
      return insertReason(snapshot, targets, 'before')
    case 'insert-after':
      return insertReason(snapshot, targets, 'after')
    case 'indent':
      return indentReason(snapshot, targets, 'indent')
    case 'outdent':
      return indentReason(snapshot, targets, 'outdent')
    case 'focus':
      return focusReason(targets)
    default:
      return `未知动作：${actionId}`
  }
}

function enabledReason(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
): string {
  if (actionId === 'select-all') return '全选当前可见元素'
  if (actionId === 'paste') return '粘贴到当前作者范围'
  if (actionId === 'fit' || actionId === 'reset-view') {
    return `${ACTION_VERBS[actionId]}`
  }
  if (snapshot.targets.length > 1) {
    return `对 ${snapshot.targets.length} 项选择执行${ACTION_VERBS[actionId]}`
  }
  return `${ACTION_VERBS[actionId]}当前选择`
}

function deleteReason(
  snapshot: EditorSelectionSnapshot,
  targets: readonly EditorSelectedTarget[],
): string | null {
  if (targets.length === 0) return '没有可删除的选择'
  if (
    targets.some((target) => target.owner === 'location') &&
    !snapshot.constraints.canDeleteActiveLocation
  ) {
    return '不能删除工程最后一个页面'
  }
  return null
}

function singleTargetReason(
  targets: readonly EditorSelectedTarget[],
  verb: string,
): string | null {
  if (targets.length === 0) return `没有可${verb}的选择`
  if (targets.length !== 1) return `请一次选择一项后${verb}`
  return null
}

function reorderReason(
  snapshot: EditorSelectionSnapshot,
  targets: readonly EditorSelectedTarget[],
  direction: 'forward' | 'backward',
): string | null {
  if (targets.length === 0) return '没有可调整顺序的选择'
  if (targets.some((target) => !supportsReorder(target.owner))) {
    return '该选择不支持前移或后移'
  }
  const allowed = direction === 'forward'
    ? snapshot.constraints.canMoveForward
    : snapshot.constraints.canMoveBackward
  if (!allowed) {
    return direction === 'forward' ? '已经位于最前，不能再前移' : '已经位于最后，不能再后移'
  }
  return null
}

function stackReason(
  snapshot: EditorSelectionSnapshot,
  targets: readonly EditorSelectedTarget[],
  edge: 'front' | 'back',
): string | null {
  if (targets.length === 0) return '没有可调整层级的选择'
  if (targets.some((target) => !supportsLayerStack(target.owner))) {
    return '页面、状态或关系对象不支持置顶/置底'
  }
  const allowed = edge === 'front'
    ? snapshot.constraints.canBringFront
    : snapshot.constraints.canSendBack
  if (!allowed) {
    return edge === 'front' ? '已经位于顶层' : '已经位于底层'
  }
  return null
}

function visibilityReason(
  targets: readonly EditorSelectedTarget[],
  mode: 'show' | 'hide',
): string | null {
  if (targets.length === 0) return mode === 'show' ? '没有可显示的选择' : '没有可隐藏的选择'
  if (targets.some((target) => !supportsVisibility(target.owner))) {
    return '该选择不支持显示/隐藏'
  }
  if (mode === 'show' && targets.every((target) => !target.hidden)) {
    return '所选元素已显示'
  }
  if (mode === 'hide' && targets.every((target) => target.hidden)) {
    return '所选元素已隐藏'
  }
  return null
}

function lockReason(targets: readonly EditorSelectedTarget[]): string | null {
  if (targets.length === 0) return '没有可锁定的选择'
  if (targets.some((target) => !supportsLock(target.owner))) {
    return '该选择不支持锁定'
  }
  return targets.every((target) => target.locked) ? '所选元素已锁定' : null
}

function editKindReason(
  targets: readonly EditorSelectedTarget[],
  kind: 'text' | 'formula',
  emptyReason: string,
): string | null {
  if (targets.length !== 1 || targets[0]?.kind !== kind) return emptyReason
  return null
}

function replaceMediaReason(
  targets: readonly EditorSelectedTarget[],
): string | null {
  if (targets.length !== 1) return '请选择一个图片或视频后替换'
  const kind = targets[0]?.kind
  if (kind !== 'image' && kind !== 'video' && kind !== 'flow-media') {
    return '请选择一个图片或视频后替换'
  }
  return null
}

function insertReason(
  snapshot: EditorSelectionSnapshot,
  targets: readonly EditorSelectedTarget[],
  side: 'before' | 'after',
): string | null {
  const allowed = side === 'before'
    ? snapshot.constraints.canInsertBefore
    : snapshot.constraints.canInsertAfter
  if (targets.length === 0) {
    if (side === 'before') return '当前没有参照项，不能在前方插入'
    return allowed ? null : '当前不能新增内容'
  }
  if (targets.length !== 1) return '请一次选择一项后插入'
  if (!supportsInsert(targets[0]!.owner)) {
    return '该选择不支持在前/后插入'
  }
  if (!allowed) {
    return side === 'before' ? '不能在前方插入' : '不能在后方插入'
  }
  return null
}

function indentReason(
  snapshot: EditorSelectionSnapshot,
  targets: readonly EditorSelectedTarget[],
  mode: 'indent' | 'outdent',
): string | null {
  if (targets.length !== 1 || targets[0]?.owner !== 'flow-block') {
    return '只有 Flow 块支持缩进'
  }
  const allowed = mode === 'indent'
    ? snapshot.constraints.canIndent
    : snapshot.constraints.canOutdent
  if (!allowed) {
    return mode === 'indent' ? '当前块不能再缩进' : '当前块不能再取消缩进'
  }
  return null
}

function focusReason(targets: readonly EditorSelectedTarget[]): string | null {
  if (targets.length === 0) return '没有可聚焦的镜头或对象'
  if (targets.length !== 1) return '请一次选择一项后聚焦'
  if (!supportsFocus(targets[0]!.owner)) {
    return '只有无限画布的镜头、路径、关系或世界元素支持聚焦'
  }
  return null
}

function blocksTextFocus(actionId: EditorActionId): boolean {
  return actionId === 'cut' ||
    actionId === 'duplicate' ||
    actionId === 'delete' ||
    actionId === 'rename' ||
    actionId === 'edit-text' ||
    actionId === 'edit-formula' ||
    actionId === 'replace-media'
}

function isViewportAction(actionId: EditorActionId): boolean {
  return actionId === 'fit' || actionId === 'reset-view'
}

function supportsVisibility(owner: EditorAuthoringOwner): boolean {
  return owner === 'global' ||
    owner === 'surface' ||
    owner === 'scene' ||
    owner === 'spatial-world'
}

function supportsLock(owner: EditorAuthoringOwner): boolean {
  return supportsVisibility(owner)
}

function supportsLayerStack(owner: EditorAuthoringOwner): boolean {
  return supportsVisibility(owner) || owner === 'flow-block'
}

function supportsReorder(owner: EditorAuthoringOwner): boolean {
  return supportsLayerStack(owner) ||
    owner === 'location' ||
    owner === 'state' ||
    owner === 'spatial-camera' ||
    owner === 'spatial-path' ||
    owner === 'spatial-relation'
}

function supportsInsert(owner: EditorAuthoringOwner): boolean {
  return owner === 'flow-block' || owner === 'location' || owner === 'state'
}

function supportsFocus(owner: EditorAuthoringOwner): boolean {
  return owner === 'spatial-world' ||
    owner === 'spatial-camera' ||
    owner === 'spatial-path' ||
    owner === 'spatial-relation'
}

function uniqueOwners(
  targets: readonly EditorSelectedTarget[],
): EditorAuthoringOwner[] {
  const seen = new Set<EditorAuthoringOwner>()
  for (const target of targets) seen.add(target.owner)
  return OWNER_ORDER.filter((owner) => seen.has(owner))
}

function crossOwnerReason(
  actionId: EditorActionId,
  owners: readonly EditorAuthoringOwner[],
): string {
  const labels = owners.map(describeEditorAuthoringOwner)
  const joined = labels.length === 2
    ? `${labels[0]}与${labels[1]}`
    : `${labels.slice(0, -1).join('、')}与${labels[labels.length - 1]}`
  return `跨 owner 选择不能一起${ACTION_VERBS[actionId]}：同时包含${joined}`
}
