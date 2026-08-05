import { describe, expect, it } from 'vitest'
import {
  isAuthoringCanvasInteractive,
  type AuthoringCanvasReadiness,
} from '@/renderer/authoring/authoringReadiness'

const READY: AuthoringCanvasReadiness = {
  canvasMode: 'edit',
  playerReady: true,
  snapshotPending: false,
  hasPreviewFeedback: false,
  generationCurrent: true,
}

describe('authoring canvas readiness', () => {
  it('opens authoring interaction only after the current snapshot is settled', () => {
    expect(isAuthoringCanvasInteractive(READY)).toBe(true)
  })

  it.each([
    ['playback mode', { canvasMode: 'run' as const }],
    ['player not ready', { playerReady: false }],
    ['snapshot barrier pending', { snapshotPending: true }],
    ['preview feedback visible', { hasPreviewFeedback: true }],
    ['preview generation stale', { generationCurrent: false }],
  ])('stays closed while %s', (_label, patch) => {
    expect(isAuthoringCanvasInteractive({ ...READY, ...patch })).toBe(false)
  })
})
