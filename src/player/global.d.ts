import type {
  ComponentDefinition,
  ExportPayload,
} from '../shared/componentTypes'
import type { PlayerApp, PlayerAppOptions } from './PlayerApp'

declare global {
  interface Window {
    __H5_LESSON_PAYLOAD__?: string | ExportPayload
    __H5_LESSON_PAYLOAD_URL__?: string
    __H5_LESSON_PAYLOAD_FALLBACK__?: ExportPayload
    __H5_LESSON_PLAYER__?: PlayerApp
    __H5_LESSON_PLAYER_OPTIONS__?: PlayerAppOptions
    __H5_LESSON_BRIDGE_TOKEN__?: string
    CoursewareComponent?: {
      define(definition: ComponentDefinition): void
    }
  }
}

export {}
