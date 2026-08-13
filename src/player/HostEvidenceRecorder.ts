import type {
  AssessmentEvaluationRequest,
  AssessmentEvaluationResult,
} from '../shared/assessmentEvaluators'
import type {
  RuntimeEvidenceActionKind,
  RuntimeScope,
} from '../shared/runtimeTypes'

export const HOST_EVIDENCE_SCHEMA_VERSION = 1 as const
export const HOST_EVIDENCE_CONSOLE_PREFIX =
  '[courseware-host-evidence-v1] ' as const

export const HOST_TEACHER_ESCAPE_ACTIONS = [
  'previous',
  'next',
  'scene-picker',
  'replay',
] as const

export const HOST_TEACHER_ESCAPE_PHASES = [
  'requested',
  'confirmation-required',
  'completed',
] as const

export type HostTeacherEscapeAction =
  (typeof HOST_TEACHER_ESCAPE_ACTIONS)[number]
export type HostTeacherEscapePhase =
  (typeof HOST_TEACHER_ESCAPE_PHASES)[number]

export interface HostTeacherEscapeEvidence {
  action: HostTeacherEscapeAction
  phase: HostTeacherEscapePhase
  sceneId: string | null
  stateId: string | null
  bypassNavigationGuards: boolean
  accepted?: boolean
}

export type HostTeacherEscapeEvidenceWriter = (
  evidence: Readonly<HostTeacherEscapeEvidence>,
) => void

export interface RuntimeAssessmentEvaluationEvidence {
  scope: RuntimeScope
  sceneId?: string
  request: Readonly<AssessmentEvaluationRequest>
  result: Readonly<AssessmentEvaluationResult>
}

export type RuntimeAssessmentEvaluatedHandler = (
  evidence: RuntimeAssessmentEvaluationEvidence,
) => void

export interface RuntimeActionRecordedEvidence {
  scope: RuntimeScope
  sceneId?: string
  actId: string
  responseId?: string
  actionKind: RuntimeEvidenceActionKind
  eventType: string
}

export type RuntimeActionRecordedHandler = (
  evidence: Readonly<RuntimeActionRecordedEvidence>,
) => void

export interface HostEvidenceSessionStartRecord {
  schemaVersion: typeof HOST_EVIDENCE_SCHEMA_VERSION
  kind: 'session-start'
  sessionId: string
  sequence: 0
}

export interface HostAssessmentEvaluatedRecord {
  schemaVersion: typeof HOST_EVIDENCE_SCHEMA_VERSION
  kind: 'assessment-evaluated'
  sessionId: string
  sequence: number
  scope: RuntimeScope
  sceneId: string | null
  responseId: string | null
  evaluatorId: AssessmentEvaluationResult['evaluatorId']
  input: string
  acceptedValues: string[]
  normalizedInput: string
  status: AssessmentEvaluationResult['status']
}

export interface HostActionRecordedRecord {
  schemaVersion: typeof HOST_EVIDENCE_SCHEMA_VERSION
  kind: 'action-recorded'
  sessionId: string
  sequence: number
  scope: RuntimeScope
  sceneId: string | null
  actId: string
  responseId: string | null
  actionKind: RuntimeEvidenceActionKind
  eventType: string
}

export interface HostTeacherEscapeRecordedRecord {
  schemaVersion: typeof HOST_EVIDENCE_SCHEMA_VERSION
  kind: 'teacher-escape-recorded'
  sessionId: string
  sequence: number
  action: HostTeacherEscapeAction
  phase: HostTeacherEscapePhase
  sceneId: string | null
  stateId: string | null
  bypassNavigationGuards: boolean
  accepted?: boolean
  eventType: 'click'
}

export type HostEvidenceRecord =
  | HostEvidenceSessionStartRecord
  | HostAssessmentEvaluatedRecord
  | HostActionRecordedRecord
  | HostTeacherEscapeRecordedRecord

export type HostEvidenceSink = (serializedRecord: string) => void

// Capture the native writer while the trusted Player bundle is evaluated,
// before any course-owned Runtime source can execute or replace console.info.
const capturedConsoleInfo = console.info.bind(console)
const capturedJsonStringify = JSON.stringify.bind(JSON)
const capturedFreeze = Object.freeze.bind(Object)
const defaultSink: HostEvidenceSink = capturedConsoleInfo
const approvedTeacherEscapeActions = new Set<string>(HOST_TEACHER_ESCAPE_ACTIONS)
const approvedTeacherEscapePhases = new Set<string>(HOST_TEACHER_ESCAPE_PHASES)
const hasApprovedTeacherEscapeAction = approvedTeacherEscapeActions.has.bind(
  approvedTeacherEscapeActions,
)
const hasApprovedTeacherEscapePhase = approvedTeacherEscapePhases.has.bind(
  approvedTeacherEscapePhases,
)
const capturedEventComposedPath = Function.prototype.call.bind(
  Event.prototype.composedPath,
) as (event: Event) => EventTarget[]
const eventTypeGetter = Object.getOwnPropertyDescriptor(Event.prototype, 'type')?.get
const eventPhaseGetter = Object.getOwnPropertyDescriptor(
  Event.prototype,
  'eventPhase',
)?.get

if (!eventTypeGetter || !eventPhaseGetter) {
  throw new Error('当前浏览器缺少教师出口证据所需的 Event 属性')
}

const capturedEventType = Function.prototype.call.bind(eventTypeGetter) as (
  event: Event,
) => string
const capturedEventPhase = Function.prototype.call.bind(eventPhaseGetter) as (
  event: Event,
) => number

function assertTrustedDispatchedClick(event: Event): 'click' {
  try {
    capturedEventComposedPath(event)
  } catch {
    throw new TypeError('教师出口证据必须绑定真实的浏览器 Event')
  }
  const eventType = capturedEventType(event)
  if (
    event.isTrusted !== true ||
    capturedEventPhase(event) === 0 ||
    eventType !== 'click'
  ) {
    throw new TypeError(
      '教师出口证据只接受当前正在分发且 Event.isTrusted=true 的 click',
    )
  }
  return eventType
}

function snapshotTeacherEscapeEvidence(
  evidence: Readonly<HostTeacherEscapeEvidence>,
): HostTeacherEscapeEvidence {
  const source = evidence as Partial<HostTeacherEscapeEvidence> | null | undefined
  const action = source?.action
  const phase = source?.phase
  const sceneId = source?.sceneId
  const stateId = source?.stateId
  const bypassNavigationGuards = source?.bypassNavigationGuards
  const accepted = source?.accepted

  if (typeof action !== 'string' || !hasApprovedTeacherEscapeAction(action)) {
    throw new TypeError(`未批准的教师出口动作：${String(action)}`)
  }
  if (typeof phase !== 'string' || !hasApprovedTeacherEscapePhase(phase)) {
    throw new TypeError(`未批准的教师出口阶段：${String(phase)}`)
  }
  if (sceneId !== null && typeof sceneId !== 'string') {
    throw new TypeError('教师出口 sceneId 必须是 string 或 null')
  }
  if (stateId !== null && typeof stateId !== 'string') {
    throw new TypeError('教师出口 stateId 必须是 string 或 null')
  }
  if (typeof bypassNavigationGuards !== 'boolean') {
    throw new TypeError('教师出口 bypassNavigationGuards 必须是 boolean')
  }
  if (phase === 'requested' && accepted !== undefined) {
    throw new TypeError('教师出口 requested 阶段不得声明 accepted')
  }
  if (phase === 'confirmation-required' && accepted !== false) {
    throw new TypeError('教师出口 confirmation-required 阶段必须声明 accepted=false')
  }
  if (phase === 'completed' && typeof accepted !== 'boolean') {
    throw new TypeError('教师出口 completed 阶段必须声明 boolean accepted')
  }

  return {
    action: action as HostTeacherEscapeAction,
    phase: phase as HostTeacherEscapePhase,
    sceneId,
    stateId,
    bypassNavigationGuards,
    ...(accepted !== undefined ? { accepted } : {}),
  }
}

function createSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('宿主证据会话需要安全随机数源')
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  // RFC 4122 version 4 / variant 1 layout for environments without randomUUID.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}

/**
 * Write-only host evidence channel. PlayerApp keeps the recorder in a native
 * private field; Runtime code receives only the normal assessment API.
 */
export class HostEvidenceRecorder {
  readonly #sessionId: string
  readonly #sink: HostEvidenceSink
  #sequence = 0

  constructor(options: {
    sink?: HostEvidenceSink
    /** Deterministic tests only. PlayerApp always uses a random session id. */
    sessionId?: string
  } = {}) {
    this.#sessionId = options.sessionId ?? createSessionId()
    this.#sink = options.sink ?? defaultSink
    this.#write({
      schemaVersion: HOST_EVIDENCE_SCHEMA_VERSION,
      kind: 'session-start',
      sessionId: this.#sessionId,
      sequence: 0,
    })
  }

  recordAssessment(evidence: RuntimeAssessmentEvaluationEvidence): void {
    this.#sequence += 1
    this.#write({
      schemaVersion: HOST_EVIDENCE_SCHEMA_VERSION,
      kind: 'assessment-evaluated',
      sessionId: this.#sessionId,
      sequence: this.#sequence,
      scope: evidence.scope,
      sceneId: evidence.sceneId ?? null,
      responseId: evidence.request.responseId ?? null,
      evaluatorId: evidence.result.evaluatorId,
      input: evidence.request.input,
      acceptedValues: [...evidence.request.acceptedValues],
      normalizedInput: evidence.result.normalizedInput,
      status: evidence.result.status,
    })
  }

  recordAction(evidence: RuntimeActionRecordedEvidence): void {
    this.#sequence += 1
    this.#write({
      schemaVersion: HOST_EVIDENCE_SCHEMA_VERSION,
      kind: 'action-recorded',
      sessionId: this.#sessionId,
      sequence: this.#sequence,
      scope: evidence.scope,
      sceneId: evidence.sceneId ?? null,
      actId: evidence.actId,
      responseId: evidence.responseId ?? null,
      actionKind: evidence.actionKind,
      eventType: evidence.eventType,
    })
  }

  /**
   * Opens a write-only receipt closure for one native teacher-control click.
   * Every phase write rechecks that the original click is still dispatching,
   * so the closure cannot be retained and replayed after the handler returns.
   */
  beginTeacherEscapeClick(event: Event): HostTeacherEscapeEvidenceWriter {
    const eventType = assertTrustedDispatchedClick(event)
    return capturedFreeze((evidence: Readonly<HostTeacherEscapeEvidence>) => {
      if (assertTrustedDispatchedClick(event) !== eventType) {
        throw new TypeError('教师出口证据事件类型在处理期间发生变化')
      }
      const snapshot = snapshotTeacherEscapeEvidence(evidence)
      this.#sequence += 1
      this.#write({
        schemaVersion: HOST_EVIDENCE_SCHEMA_VERSION,
        kind: 'teacher-escape-recorded',
        sessionId: this.#sessionId,
        sequence: this.#sequence,
        ...snapshot,
        eventType,
      })
    })
  }

  #write(record: HostEvidenceRecord): void {
    this.#sink(`${HOST_EVIDENCE_CONSOLE_PREFIX}${capturedJsonStringify(record)}`)
  }
}
