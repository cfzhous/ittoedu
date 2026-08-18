import { expect, type ElectronApplication } from '@playwright/test'
import {
  BACKGROUND_E2E_ENV,
  BACKGROUND_E2E_WINDOW_ORIGIN,
} from '../../src/main/windowVisibility'

const backgroundE2eEnabled = (process.env[BACKGROUND_E2E_ENV] ?? '1') === '1'

interface BackgroundWindowSnapshot {
  visible: boolean
  focused: boolean
  opacity: number
  x: number
  y: number
  originOk: boolean
  opacityOk: boolean
  isolated: boolean
}

/**
 * COURSEWARE_E2E_BACKGROUND=1 keeps windows hidden and unfocused.
 * Opacity and off-screen coordinates are extra protection. Electron's
 * BrowserWindow.opacity does nothing on Linux without a compositor
 * (Xvfb typically has none), so getOpacity() stays 1 there.
 */
export async function expectBackgroundWindowsIsolated(
  app: ElectronApplication,
  required = backgroundE2eEnabled,
): Promise<void> {
  if (!required) return
  await expect.poll(async () => {
    const windows: BackgroundWindowSnapshot[] = await app.evaluate(({ BrowserWindow }, origin) => {
      const opacityRequired = process.platform !== 'linux'
      return BrowserWindow.getAllWindows().map((window) => {
        const bounds = window.getBounds()
        const originOk = bounds.x === origin && bounds.y === origin
        const opacityOk = !opacityRequired || window.getOpacity() === 0
        return {
          visible: window.isVisible(),
          focused: window.isFocused(),
          opacity: window.getOpacity(),
          x: bounds.x,
          y: bounds.y,
          originOk,
          opacityOk,
          isolated:
            !window.isVisible() &&
            !window.isFocused() &&
            opacityOk &&
            originOk,
        }
      })
    }, BACKGROUND_E2E_WINDOW_ORIGIN)
    return {
      count: windows.length,
      isolated: windows.length > 0 && windows.every((window) => window.isolated),
      windows,
    }
  }).toMatchObject({ isolated: true })
}
