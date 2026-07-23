import type { DesktopAPI } from '../shared/ipcTypes'

declare global {
  interface Window {
    desktopAPI: DesktopAPI
  }
}

export {}
