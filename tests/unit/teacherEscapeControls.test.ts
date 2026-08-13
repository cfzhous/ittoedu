import '@testing-library/jest-dom/vitest'
import { fireEvent } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TEACHER_ESCAPE_ACTION_EVENT,
  TeacherEscapeControls,
} from '../../src/player/TeacherEscapeControls'

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('TeacherEscapeControls', () => {
  it('stays above authored surfaces and requires an explicit second click to bypass guards', () => {
    const stage = document.createElement('section')
    document.body.append(stage)
    let index = 1
    const navigate = vi.fn((_direction: 'previous' | 'next', bypass: boolean) => {
      if (!bypass) return { accepted: false, guardBlocked: true }
      index += 1
      return { accepted: true, guardBlocked: false }
    })
    const eventDetails: unknown[] = []
    const collectEvent = (event: Event) => {
      eventDetails.push((event as CustomEvent).detail)
    }
    window.addEventListener(TEACHER_ESCAPE_ACTION_EVENT, collectEvent)
    const evidenceClicks: unknown[][] = []
    const controls = new TeacherEscapeControls({
      stage,
      totalScenes: 4,
      getCurrentIndex: () => index,
      getCurrentSceneId: () => index === 1 ? 'scene-practice' : 'scene-summary',
      getCurrentStateId: () => index === 1 ? 'state-incomplete' : 'state-complete',
      navigate,
      openScenePicker: vi.fn(),
      replay: vi.fn(() => true),
      beginEvidenceClick: () => {
        const records: unknown[] = []
        evidenceClicks.push(records)
        return (evidence) => records.push(evidence)
      },
    })
    const root = stage.querySelector<HTMLElement>('[data-testid="teacher-escape-controls"]')!
    const next = stage.querySelector<HTMLButtonElement>('[data-testid="teacher-escape-next"]')!
    const status = stage.querySelector<HTMLElement>('[data-testid="teacher-escape-status"]')!

    expect(root).toHaveStyle({ zIndex: '50', pointerEvents: 'auto' })
    expect(next).toHaveStyle({ pointerEvents: 'auto' })
    expect(next).toHaveAttribute('data-teacher-escape', 'continue-incomplete')
    fireEvent.click(next)
    expect(navigate).toHaveBeenLastCalledWith('next', false)
    expect(next).toHaveAttribute('data-confirmation-pending', 'true')
    expect(next).toHaveAttribute('data-teacher-escape-confirmation', 'true')
    expect(next).toHaveTextContent('未完成仍继续')
    expect(status).toBeVisible()
    expect(status).toHaveTextContent('课程提示：任务未完成')
    expect(status.style.maxWidth).toBe('132px')
    expect(status.style.position).toBe('')

    fireEvent.click(next)
    expect(navigate).toHaveBeenLastCalledWith('next', true)
    expect(next).not.toHaveAttribute('data-confirmation-pending')
    expect(status).not.toBeVisible()
    expect(eventDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'next',
        phase: 'confirmation-required',
        sceneId: 'scene-practice',
        stateId: 'state-incomplete',
        bypassNavigationGuards: false,
      }),
      expect.objectContaining({
        action: 'next',
        phase: 'completed',
        sceneId: 'scene-practice',
        stateId: 'state-incomplete',
        bypassNavigationGuards: true,
        accepted: true,
      }),
    ]))
    expect(evidenceClicks).toEqual([
      [
        expect.objectContaining({
          action: 'next',
          phase: 'requested',
          bypassNavigationGuards: false,
        }),
        expect.objectContaining({
          action: 'next',
          phase: 'confirmation-required',
          accepted: false,
        }),
      ],
      [
        expect.objectContaining({
          action: 'next',
          phase: 'requested',
          bypassNavigationGuards: true,
        }),
        expect.objectContaining({
          action: 'next',
          phase: 'completed',
          accepted: true,
        }),
      ],
    ])
    window.removeEventListener(TEACHER_ESCAPE_ACTION_EVENT, collectEvent)
    controls.destroy()
  })

  it('bypasses guards on the first previous click and never confirms non-guard rejection', () => {
    const stage = document.createElement('section')
    document.body.append(stage)
    const navigate = vi.fn((direction: 'previous' | 'next') => ({
      accepted: false,
      guardBlocked: direction === 'previous',
    }))
    const controls = new TeacherEscapeControls({
      stage,
      totalScenes: 4,
      getCurrentIndex: () => 1,
      getCurrentSceneId: () => 'scene-practice',
      getCurrentStateId: () => 'state-incomplete',
      navigate,
      openScenePicker: vi.fn(),
      replay: vi.fn(() => true),
      beginEvidenceClick: () => vi.fn(),
    })
    const previous = stage.querySelector<HTMLButtonElement>(
      '[data-testid="teacher-escape-previous"]',
    )!
    const next = stage.querySelector<HTMLButtonElement>(
      '[data-testid="teacher-escape-next"]',
    )!

    fireEvent.click(previous)
    expect(navigate).toHaveBeenLastCalledWith('previous', true)
    expect(previous).not.toHaveAttribute('data-teacher-escape-confirmation')

    fireEvent.click(next)
    expect(navigate).toHaveBeenLastCalledWith('next', false)
    expect(next).not.toHaveAttribute('data-teacher-escape-confirmation')
    controls.destroy()
  })

  it('exposes scene picker and replay without owning course state', () => {
    const stage = document.createElement('section')
    document.body.append(stage)
    const openScenePicker = vi.fn()
    const replayOrder: string[] = []
    const replay = vi.fn(() => {
      replayOrder.push('replay-called')
      return true
    })
    const eventDetails: unknown[] = []
    const collectEvent = (event: Event) => {
      eventDetails.push((event as CustomEvent).detail)
    }
    window.addEventListener(TEACHER_ESCAPE_ACTION_EVENT, collectEvent)
    const evidenceClicks: unknown[][] = []
    const controls = new TeacherEscapeControls({
      stage,
      totalScenes: 1,
      getCurrentIndex: () => 0,
      getCurrentSceneId: () => 'scene-only',
      getCurrentStateId: () => 'state-initial',
      navigate: vi.fn(() => ({ accepted: false, guardBlocked: false })),
      openScenePicker,
      replay,
      beginEvidenceClick: () => {
        const records: unknown[] = []
        evidenceClicks.push(records)
        return (evidence) => {
          records.push(evidence)
          if (evidence.action === 'replay') replayOrder.push(evidence.phase)
        }
      },
    })

    expect(stage.querySelector<HTMLButtonElement>(
      '[data-testid="teacher-escape-previous"]',
    )).toBeDisabled()
    expect(stage.querySelector<HTMLButtonElement>(
      '[data-testid="teacher-escape-next"]',
    )).toBeDisabled()
    fireEvent.click(stage.querySelector('[data-testid="teacher-escape-scene-picker"]')!)
    fireEvent.click(stage.querySelector('[data-testid="teacher-escape-replay"]')!)
    expect(stage.querySelector('[data-teacher-escape="scene-picker"]')).not.toBeNull()
    expect(stage.querySelector('[data-teacher-escape="replay"]')).not.toBeNull()
    expect(openScenePicker).toHaveBeenCalledOnce()
    expect(replay).toHaveBeenCalledOnce()
    expect(eventDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'scene-picker',
        phase: 'requested',
        sceneId: 'scene-only',
        stateId: 'state-initial',
      }),
      expect.objectContaining({
        action: 'scene-picker',
        phase: 'completed',
        sceneId: 'scene-only',
        stateId: 'state-initial',
        accepted: true,
      }),
    ]))
    expect(evidenceClicks[0]).toEqual([
      expect.objectContaining({ action: 'scene-picker', phase: 'requested' }),
      expect.objectContaining({
        action: 'scene-picker',
        phase: 'completed',
        accepted: true,
      }),
    ])
    expect(evidenceClicks[1]).toEqual([
      {
        action: 'replay',
        phase: 'requested',
        sceneId: 'scene-only',
        stateId: 'state-initial',
        bypassNavigationGuards: true,
      },
      {
        action: 'replay',
        phase: 'completed',
        sceneId: 'scene-only',
        stateId: 'state-initial',
        bypassNavigationGuards: true,
        accepted: true,
      },
    ])
    expect(replayOrder).toEqual(['requested', 'replay-called', 'completed'])

    window.removeEventListener(TEACHER_ESCAPE_ACTION_EVENT, collectEvent)
    controls.destroy()
    expect(stage.querySelector('[data-testid="teacher-escape-controls"]')).toBeNull()
  })
})
