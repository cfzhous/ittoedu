import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_E2E_CHROMIUM_SWITCHES,
  BACKGROUND_E2E_ENV,
  BACKGROUND_E2E_WINDOW_ORIGIN,
  shouldShowApplicationWindows,
} from '@/main/windowVisibility'

describe('Electron window visibility', () => {
  it('keeps normal application launches visible', () => {
    expect(shouldShowApplicationWindows({})).toBe(true)
    expect(shouldShowApplicationWindows({ [BACKGROUND_E2E_ENV]: '0' })).toBe(true)
  })

  it('hides application windows only for background E2E runs', () => {
    expect(shouldShowApplicationWindows({ [BACKGROUND_E2E_ENV]: '1' })).toBe(false)
    expect(BACKGROUND_E2E_WINDOW_ORIGIN).toBe(-16_384)
    expect(BACKGROUND_E2E_CHROMIUM_SWITCHES).toEqual([
      'disable-background-timer-throttling',
      'disable-backgrounding-occluded-windows',
      'disable-renderer-backgrounding',
    ])
  })
})
