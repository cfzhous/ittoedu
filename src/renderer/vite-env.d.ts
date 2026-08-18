/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_V9_CANDIDATE_SMOKE?: string
}

import type { DesktopAPI } from '../shared/ipcTypes'

declare global {
  interface Window {
    desktopAPI: DesktopAPI
    __COURSEWARE_EDITOR_DIRTY__: boolean
  }
}

declare module 'virtual:player-bundle' {
  const source: string
  export default source
}

export {}
