import {
  makeAuthoringAddress,
  type AuthoringCarrier,
} from '../../shared/authoringAddress'

export const EDITOR_ACTION_IDS = [
  'select-all',
  'copy',
  'cut',
  'paste',
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
  'fit',
  'reset-view',
] as const

export type EditorActionId = (typeof EDITOR_ACTION_IDS)[number]

/** Writes that must be refused on a locked target. `unlock` is the exception. */
export const EDITOR_WRITE_ACTION_IDS = [
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
  'edit-text',
  'edit-formula',
  'replace-media',
  'insert-before',
  'insert-after',
  'indent',
  'outdent',
] as const satisfies readonly EditorActionId[]

export type EditorWriteActionId = (typeof EDITOR_WRITE_ACTION_IDS)[number]

export const EDITOR_AUTHORING_OWNERS = [
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
] as const

export type EditorAuthoringOwner = (typeof EDITOR_AUTHORING_OWNERS)[number]

export type EditorSurfaceKind = 'slide' | 'flow' | 'spatial-2d'

export type EditorFocusKind =
  | 'none'
  | 'input'
  | 'textarea'
  | 'contenteditable'
  | 'text-edit-session'
  | 'formula-edit-session'
  | 'runtime-author-session'
  | 'component-author-session'

export type EditorTargetKind =
  | 'text'
  | 'formula'
  | 'image'
  | 'video'
  | 'shape'
  | 'teacher-controller'
  | 'runtime'
  | 'component'
  | 'flow-block'
  | 'flow-media'
  | 'spatial-world'
  | 'spatial-camera'
  | 'spatial-path'
  | 'spatial-relation'
  | 'location'
  | 'state'

export type EditorActionEntrySource =
  | 'keyboard'
  | 'mouse-contextmenu'
  | 'canvas'
  | 'layer'
  | 'property'

export interface EditorFocusDescriptor {
  readonly tagName?: string
  readonly isContentEditable?: boolean
  readonly textEditSession?: boolean
  readonly formulaEditSession?: boolean
  readonly runtimeAuthorSession?: boolean
  readonly componentAuthorSession?: boolean
}

export interface EditorSelectionConstraints {
  readonly clipboardAvailable: boolean
  readonly canDeleteActiveLocation: boolean
  readonly canIndent: boolean
  readonly canOutdent: boolean
  readonly canInsertBefore: boolean
  readonly canInsertAfter: boolean
  readonly canMoveForward: boolean
  readonly canMoveBackward: boolean
  readonly canBringFront: boolean
  readonly canSendBack: boolean
}

export interface EditorSelectedTarget {
  readonly owner: EditorAuthoringOwner
  readonly layerItemId: string
  readonly authoringAddress: string
  readonly locked: boolean
  readonly hidden: boolean
  readonly kind: EditorTargetKind
  readonly label: string
}

export interface EditorMenuSelection {
  readonly locationId: string
  readonly owner: EditorAuthoringOwner
  readonly authoringAddresses: readonly string[]
  readonly targetIds: readonly string[]
}

export interface EditorSelectionSnapshot {
  readonly sessionId: string
  readonly projectId: string
  readonly projectRevision: number
  readonly locationId: string
  readonly surfaceId: string
  readonly sceneId: string | null
  readonly surfaceKind: EditorSurfaceKind
  readonly owner: EditorAuthoringOwner
  readonly authoringAddresses: readonly string[]
  readonly targets: readonly EditorSelectedTarget[]
  readonly menuSelection: EditorMenuSelection
  readonly focus: EditorFocusKind
  readonly constraints: EditorSelectionConstraints
  readonly capturedAt: 'live' | 'menu-open'
}

export interface EditorSelectedTargetInput {
  readonly owner: EditorAuthoringOwner
  readonly layerItemId: string
  readonly locked?: boolean
  readonly hidden?: boolean
  readonly kind?: EditorTargetKind
  readonly label?: string
  readonly authoringAddress?: string
  readonly carrier?: AuthoringCarrier
  readonly field?: string
  readonly surfaceId?: string
  readonly sceneId?: string
}

export interface EditorSelectionSnapshotInput {
  readonly sessionId: string
  readonly projectId: string
  readonly projectRevision: number
  readonly locationId: string
  readonly surfaceId: string
  readonly surfaceKind: EditorSurfaceKind
  readonly owner: EditorAuthoringOwner
  readonly sceneId?: string | null
  readonly focus?: EditorFocusKind | EditorFocusDescriptor | EventTarget | null
  readonly targets?: readonly EditorSelectedTargetInput[]
  readonly constraints?: Partial<EditorSelectionConstraints>
}

export interface EditorActionAvailability {
  readonly actionId: EditorActionId
  readonly enabled: boolean
  readonly reason: string
}

export interface EditorActionAdapterResult {
  readonly ok: boolean
  readonly reason: string
}

export interface EditorActionResult extends EditorActionAdapterResult {
  readonly actionId: EditorActionId
  readonly adapter: 'global' | 'surface' | 'none'
}

export interface EditorActionAdapter {
  execute(
    actionId: EditorActionId,
    snapshot: EditorSelectionSnapshot,
  ): EditorActionAdapterResult
}

export interface EditorActionAdapters {
  readonly global?: EditorActionAdapter
  readonly surface?: EditorActionAdapter
}

const DEFAULT_CONSTRAINTS: EditorSelectionConstraints = {
  clipboardAvailable: false,
  canDeleteActiveLocation: true,
  canIndent: true,
  canOutdent: true,
  canInsertBefore: true,
  canInsertAfter: true,
  canMoveForward: true,
  canMoveBackward: true,
  canBringFront: true,
  canSendBack: true,
}

const WRITE_ACTION_SET = new Set<EditorActionId>(EDITOR_WRITE_ACTION_IDS)

const OWNER_LABELS: Record<EditorAuthoringOwner, string> = {
  global: '全局层',
  surface: '当前内容共用层',
  scene: '本页元素',
  location: '课程页面',
  state: '命名状态',
  'flow-block': 'Flow 块',
  'spatial-world': '世界元素',
  'spatial-camera': '镜头',
  'spatial-path': '路径',
  'spatial-relation': '关系',
}

export function isEditorWriteAction(actionId: EditorActionId): boolean {
  return WRITE_ACTION_SET.has(actionId)
}

export function describeEditorAuthoringOwner(owner: EditorAuthoringOwner): string {
  return OWNER_LABELS[owner]
}

export function isTextLikeEditorFocus(focus: EditorFocusKind): boolean {
  return focus !== 'none'
}

export function classifyEditorFocus(
  input?: EditorFocusKind | EditorFocusDescriptor | EventTarget | null,
): EditorFocusKind {
  if (input == null) return 'none'
  if (typeof input === 'string') return input

  const descriptor = readFocusDescriptor(input)
  if (descriptor.formulaEditSession) return 'formula-edit-session'
  if (descriptor.textEditSession) return 'text-edit-session'
  if (descriptor.runtimeAuthorSession) return 'runtime-author-session'
  if (descriptor.componentAuthorSession) return 'component-author-session'

  const tag = descriptor.tagName?.toLowerCase()
  if (tag === 'input') return 'input'
  if (tag === 'textarea') return 'textarea'
  if (isContentEditableDescriptor(descriptor, input)) return 'contenteditable'
  return 'none'
}

function readFocusDescriptor(
  input: EditorFocusDescriptor | EventTarget,
): EditorFocusDescriptor {
  if (typeof HTMLElement !== 'undefined' && input instanceof HTMLElement) {
    return {
      tagName: input.tagName,
      isContentEditable: isHtmlContentEditable(input),
    }
  }
  return input as EditorFocusDescriptor
}

function isHtmlContentEditable(element: HTMLElement): boolean {
  if (element.isContentEditable) return true
  const value = element.contentEditable
  if (value === 'true' || value === 'plaintext-only') return true
  const attr = element.getAttribute('contenteditable')
  return attr === '' || attr === 'true' || attr === 'plaintext-only'
}

function isContentEditableDescriptor(
  descriptor: EditorFocusDescriptor,
  input: EditorFocusKind | EditorFocusDescriptor | EventTarget,
): boolean {
  if (descriptor.isContentEditable) return true
  if (typeof HTMLElement !== 'undefined' && input instanceof HTMLElement) {
    return isHtmlContentEditable(input)
  }
  return false
}

export function createEditorSelectionSnapshot(
  input: EditorSelectionSnapshotInput,
): EditorSelectionSnapshot {
  if (!input.sessionId.trim()) throw new TypeError('sessionId 不能为空')
  if (!input.projectId.trim()) throw new TypeError('projectId 不能为空')
  if (!input.locationId.trim()) throw new TypeError('locationId 不能为空')
  if (!input.surfaceId.trim()) throw new TypeError('surfaceId 不能为空')
  if (!Number.isInteger(input.projectRevision) || input.projectRevision < 0) {
    throw new TypeError('projectRevision 必须是非负整数')
  }

  const sceneId = input.sceneId ?? null
  const targets = Object.freeze(
    (input.targets ?? []).map((target) =>
      freezeValue(createSelectedTarget(input, target, sceneId)),
    ),
  )
  const authoringAddresses = Object.freeze(
    targets.map((target) => target.authoringAddress),
  )
  const menuSelection = freezeValue({
    locationId: input.locationId,
    owner: input.owner,
    authoringAddresses,
    targetIds: Object.freeze(targets.map((target) => target.layerItemId)),
  })

  return freezeValue({
    sessionId: input.sessionId,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    locationId: input.locationId,
    surfaceId: input.surfaceId,
    sceneId,
    surfaceKind: input.surfaceKind,
    owner: input.owner,
    authoringAddresses,
    targets,
    menuSelection,
    focus: classifyEditorFocus(input.focus),
    constraints: freezeValue({
      ...DEFAULT_CONSTRAINTS,
      ...input.constraints,
    }),
    capturedAt: 'live',
  })
}

export function captureEditorMenuSnapshot(
  snapshot: EditorSelectionSnapshot,
): EditorSelectionSnapshot {
  return freezeValue({
    ...snapshot,
    targets: Object.freeze(snapshot.targets.map((target) => freezeValue({ ...target }))),
    authoringAddresses: Object.freeze([...snapshot.authoringAddresses]),
    menuSelection: freezeValue({
      locationId: snapshot.locationId,
      owner: snapshot.owner,
      authoringAddresses: Object.freeze([...snapshot.authoringAddresses]),
      targetIds: Object.freeze(snapshot.targets.map((target) => target.layerItemId)),
    }),
    constraints: freezeValue({ ...snapshot.constraints }),
    capturedAt: 'menu-open',
  })
}

function createSelectedTarget(
  snapshot: EditorSelectionSnapshotInput,
  target: EditorSelectedTargetInput,
  sceneId: string | null,
): EditorSelectedTarget {
  if (!target.layerItemId.trim()) throw new TypeError('layerItemId 不能为空')
  const kind = target.kind ?? defaultTargetKind(target.owner)
  const address = target.authoringAddress?.trim()
    ? target.authoringAddress
    : makeAuthoringAddress({
        projectId: snapshot.projectId,
        scope: authoringAddressScope(target.owner),
        surfaceId: target.surfaceId ?? snapshot.surfaceId,
        sceneId: target.sceneId ?? sceneId ?? undefined,
        carrier: target.carrier ?? defaultCarrier(kind),
        layerItemId: target.layerItemId,
        field: target.field ?? defaultAuthoringField(target.owner, kind),
      })

  return {
    owner: target.owner,
    layerItemId: target.layerItemId,
    authoringAddress: address,
    locked: Boolean(target.locked),
    hidden: Boolean(target.hidden),
    kind,
    label: target.label ?? target.layerItemId,
  }
}

function authoringAddressScope(
  owner: EditorAuthoringOwner,
): 'global' | 'surface' | 'scene' {
  if (owner === 'global') return 'global'
  if (owner === 'scene' || owner === 'state' || owner === 'location') return 'scene'
  return 'surface'
}

function defaultCarrier(kind: EditorTargetKind): AuthoringCarrier {
  if (kind === 'runtime') return 'runtime'
  if (kind === 'component') return 'component'
  return 'native'
}

function defaultTargetKind(owner: EditorAuthoringOwner): EditorTargetKind {
  if (owner === 'flow-block') return 'flow-block'
  if (owner === 'spatial-world') return 'spatial-world'
  if (owner === 'spatial-camera') return 'spatial-camera'
  if (owner === 'spatial-path') return 'spatial-path'
  if (owner === 'spatial-relation') return 'spatial-relation'
  if (owner === 'location') return 'location'
  if (owner === 'state') return 'state'
  return 'shape'
}

function defaultAuthoringField(
  owner: EditorAuthoringOwner,
  kind: EditorTargetKind,
): string {
  if (owner === 'location') return 'location'
  if (owner === 'state') return 'state'
  if (owner === 'flow-block') return 'block'
  if (owner === 'spatial-camera') return 'camera'
  if (owner === 'spatial-path') return 'path'
  if (owner === 'spatial-relation') return 'relation'
  if (kind === 'text') return 'content.text'
  if (kind === 'formula') return 'content.formula'
  if (kind === 'image' || kind === 'video' || kind === 'flow-media') {
    return 'content.asset'
  }
  return 'item'
}

function freezeValue<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
  }
  return value
}
