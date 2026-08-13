import type {
  HostTeacherEscapeAction,
  HostTeacherEscapeEvidence,
  HostTeacherEscapeEvidenceWriter,
  HostTeacherEscapePhase,
} from './HostEvidenceRecorder'

export type TeacherEscapeDirection = 'previous' | 'next'

export interface TeacherEscapeControlsOptions {
  stage: HTMLElement
  getCurrentIndex(): number
  getCurrentSceneId(): string | null
  getCurrentStateId(): string | null
  totalScenes: number
  navigate(
    direction: TeacherEscapeDirection,
    bypassNavigationGuards: boolean,
  ): TeacherEscapeNavigationResult
  openScenePicker(): void
  replay(): boolean
  /** Host-private ledger bridge. PlayerApp always binds this to its recorder. */
  beginEvidenceClick(event: MouseEvent): HostTeacherEscapeEvidenceWriter
}

export interface TeacherEscapeNavigationResult {
  accepted: boolean
  /** True only when a course navigation guard rejected the request. */
  guardBlocked: boolean
}

export const TEACHER_ESCAPE_ACTION_EVENT = 'courseware-teacher-escape-action'

export interface TeacherEscapeActionEventDetail {
  action: HostTeacherEscapeAction
  phase: HostTeacherEscapePhase
  sceneId: string | null
  stateId: string | null
  bypassNavigationGuards: boolean
  accepted?: boolean
}

const TEACHER_ESCAPE_HOOK: Record<
  TeacherEscapeDirection | 'scene-picker' | 'replay',
  string
> = {
  previous: 'previous',
  next: 'continue-incomplete',
  'scene-picker': 'scene-picker',
  replay: 'replay',
}

function applyStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
): void {
  Object.assign(element.style, styles)
}

/**
 * A deliberately tiny, native-DOM teacher escape plane. It owns no course
 * state: every action delegates back to PlayerApp/PlayerScene.
 */
export class TeacherEscapeControls {
  private readonly root: HTMLElement
  private readonly previousButton: HTMLButtonElement
  private readonly nextButton: HTMLButtonElement
  private readonly status: HTMLSpanElement
  private pendingDirection: TeacherEscapeDirection | null = null
  private confirmationTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  constructor(private readonly options: TeacherEscapeControlsOptions) {
    const root = document.createElement('nav')
    root.className = 'lesson-teacher-escape-controls'
    root.dataset.testid = 'teacher-escape-controls'
    root.setAttribute('aria-label', '教师快捷控制')
    applyStyles(root, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '50',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '3px',
      border: '1px solid rgba(255, 255, 255, 0.28)',
      borderRadius: '999px',
      color: '#f8fafc',
      background: 'rgba(13, 22, 38, 0.82)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.24)',
      fontFamily: 'Inter, "Microsoft YaHei", "PingFang SC", sans-serif',
      pointerEvents: 'auto',
      backdropFilter: 'blur(4px)',
    })

    const previousButton = this.createButton(
      'previous',
      '上一页',
      '‹',
      (event) => this.handleNavigate('previous', event),
    )
    const nextButton = this.createButton(
      'next',
      '下一页',
      '›',
      (event) => this.handleNavigate('next', event),
    )
    const pickerButton = this.createButton(
      'scene-picker',
      '打开场景目录',
      '目录',
      (event) => {
        const writeEvidence = this.options.beginEvidenceClick(event)
        this.clearConfirmation()
        const sourceContext = this.currentContractContext()
        this.dispatchAction({
          action: 'scene-picker',
          phase: 'requested',
          bypassNavigationGuards: true,
        }, sourceContext, writeEvidence)
        this.options.openScenePicker()
        this.dispatchAction({
          action: 'scene-picker',
          phase: 'completed',
          bypassNavigationGuards: true,
          accepted: true,
        }, sourceContext, writeEvidence)
      },
    )
    const replayButton = this.createButton(
      'replay',
      '重播当前场景',
      '重播',
      (event) => {
        const writeEvidence = this.options.beginEvidenceClick(event)
        this.clearConfirmation()
        const sourceContext = this.currentContractContext()
        this.dispatchAction({
          action: 'replay',
          phase: 'requested',
          bypassNavigationGuards: true,
        }, sourceContext, writeEvidence)
        const accepted = this.options.replay()
        this.dispatchAction({
          action: 'replay',
          phase: 'completed',
          bypassNavigationGuards: true,
          accepted,
        }, sourceContext, writeEvidence)
      },
    )
    const status = document.createElement('span')
    status.className = 'lesson-teacher-escape-controls__status'
    status.dataset.testid = 'teacher-escape-status'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.hidden = true
    applyStyles(status, {
      maxWidth: '132px',
      padding: '0 6px',
      color: '#fde68a',
      fontSize: '11px',
      fontWeight: '600',
      lineHeight: '1.25',
      textAlign: 'right',
      whiteSpace: 'normal',
    })

    root.append(previousButton, nextButton, pickerButton, replayButton, status)
    options.stage.append(root)
    this.root = root
    this.previousButton = previousButton
    this.nextButton = nextButton
    this.status = status
    this.refresh()
  }

  refresh(): void {
    if (this.destroyed) return
    const index = this.options.getCurrentIndex()
    this.previousButton.disabled = index <= 0
    this.nextButton.disabled = index >= this.options.totalScenes - 1
  }

  resetConfirmation(): void {
    this.clearConfirmation()
    this.refresh()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.clearConfirmation()
    this.root.remove()
  }

  private createButton(
    action: TeacherEscapeDirection | 'scene-picker' | 'replay',
    accessibleName: string,
    text: string,
    onClick: (event: MouseEvent) => void,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `lesson-teacher-escape-controls__${action}`
    button.dataset.testid = `teacher-escape-${action}`
    button.dataset.teacherEscape = TEACHER_ESCAPE_HOOK[action]
    button.setAttribute('aria-label', accessibleName)
    button.textContent = text
    applyStyles(button, {
      minWidth: action === 'previous' || action === 'next' ? '32px' : '44px',
      height: '30px',
      padding: action === 'previous' || action === 'next' ? '0 9px' : '0 10px',
      border: '0',
      borderRadius: '999px',
      color: 'inherit',
      background: 'transparent',
      font: '600 12px/1 inherit',
      cursor: 'pointer',
      pointerEvents: 'auto',
    })
    button.addEventListener('click', onClick)
    return button
  }

  private handleNavigate(
    direction: TeacherEscapeDirection,
    event: MouseEvent,
  ): void {
    if (this.destroyed) return
    const writeEvidence = this.options.beginEvidenceClick(event)
    // Freeze the source context before navigation. PlayerApp switches scenes
    // synchronously, so reading it after navigate() would mislabel the
    // completed event with the destination scene/state.
    const sourceContext = this.currentContractContext()
    // Going back is always a teacher escape. Only forward navigation asks for
    // a deliberate second click before bypassing course guards.
    const bypassNavigationGuards = direction === 'previous' ||
      this.pendingDirection === direction
    if (this.pendingDirection && this.pendingDirection !== direction) {
      this.clearConfirmation()
    }
    this.dispatchAction({
      action: direction,
      phase: 'requested',
      bypassNavigationGuards,
    }, sourceContext, writeEvidence)
    const result = this.options.navigate(direction, bypassNavigationGuards)
    if (result.accepted) {
      this.clearConfirmation()
      this.refresh()
      this.dispatchAction({
        action: direction,
        phase: 'completed',
        bypassNavigationGuards,
        accepted: true,
      }, sourceContext, writeEvidence)
      return
    }

    const index = this.options.getCurrentIndex()
    const atBoundary = direction === 'previous'
      ? index <= 0
      : index >= this.options.totalScenes - 1
    if (atBoundary || bypassNavigationGuards || !result.guardBlocked) {
      this.clearConfirmation()
      this.refresh()
      this.dispatchAction({
        action: direction,
        phase: 'completed',
        bypassNavigationGuards,
        accepted: false,
      }, sourceContext, writeEvidence)
      return
    }

    this.pendingDirection = direction
    const button = this.nextButton
    button.textContent = '未完成仍继续'
    button.dataset.confirmationPending = 'true'
    button.dataset.teacherEscapeConfirmation = 'true'
    this.status.textContent = '课程提示：任务未完成'
    this.status.hidden = false
    this.dispatchAction({
      action: direction,
      phase: 'confirmation-required',
      bypassNavigationGuards: false,
      accepted: false,
    }, sourceContext, writeEvidence)
    this.confirmationTimer = setTimeout(() => this.clearConfirmation(), 5000)
  }

  private dispatchAction(
    detail: Omit<TeacherEscapeActionEventDetail, 'sceneId' | 'stateId'>,
    sourceContext: Pick<TeacherEscapeActionEventDetail, 'sceneId' | 'stateId'>,
    writeEvidence: HostTeacherEscapeEvidenceWriter,
  ): void {
    const actionDetail = {
      ...detail,
      ...sourceContext,
    } satisfies HostTeacherEscapeEvidence
    writeEvidence(actionDetail)
    window.dispatchEvent(new CustomEvent(TEACHER_ESCAPE_ACTION_EVENT, {
      detail: actionDetail satisfies TeacherEscapeActionEventDetail,
    }))
  }

  private currentContractContext(): Pick<
    TeacherEscapeActionEventDetail,
    'sceneId' | 'stateId'
  > {
    const sceneId = this.options.getCurrentSceneId()
    const stateId = this.options.getCurrentStateId()
    return { sceneId, stateId }
  }

  private clearConfirmation(): void {
    if (this.confirmationTimer !== null) clearTimeout(this.confirmationTimer)
    this.confirmationTimer = null
    this.pendingDirection = null
    if (this.previousButton) {
      this.previousButton.textContent = '‹'
      delete this.previousButton.dataset.confirmationPending
      delete this.previousButton.dataset.teacherEscapeConfirmation
    }
    if (this.nextButton) {
      this.nextButton.textContent = '›'
      delete this.nextButton.dataset.confirmationPending
      delete this.nextButton.dataset.teacherEscapeConfirmation
    }
    if (this.status) {
      this.status.textContent = ''
      this.status.hidden = true
    }
  }
}
