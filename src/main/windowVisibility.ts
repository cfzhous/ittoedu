export const BACKGROUND_E2E_ENV = 'COURSEWARE_E2E_BACKGROUND'
// Windows clamps BrowserWindow coordinates below this value.
export const BACKGROUND_E2E_WINDOW_ORIGIN = -16_384
export const BACKGROUND_E2E_CHROMIUM_SWITCHES = [
  'disable-background-timer-throttling',
  'disable-backgrounding-occluded-windows',
  'disable-renderer-backgrounding',
] as const

export function shouldShowApplicationWindows(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment[BACKGROUND_E2E_ENV] !== '1'
}
