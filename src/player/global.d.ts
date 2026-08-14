import type {
  ComponentDefinitionV4,
  ExportPayload,
} from '../shared/componentTypes'
import type { PublishedLessonPayload } from '../shared/publishedLessonTypes'
import type { PublishedCourseV2Payload } from '../shared/publishedCourseTypes'
import type { PublishedCourseApp } from './PublishedCourseApp'
import type { PlayerApp, PlayerAppOptions } from './PlayerApp'
import type { SurfaceRuntimeDefinition } from '../shared/surfaceRuntimeTypes'

declare global {
  interface Window {
    __H5_LESSON_PAYLOAD__?: string | ExportPayload | PublishedLessonPayload
    __H5_LESSON_PAYLOAD_URL__?: string
    __H5_LESSON_PAYLOAD_FALLBACK__?: ExportPayload | PublishedLessonPayload
    __H5_LESSON_PLAYER__?: PlayerApp
    __H5_LESSON_PLAYER_OPTIONS__?: PlayerAppOptions
    __H5_LESSON_BRIDGE_TOKEN__?: string
    __H5_COURSE_PAYLOAD__?: PublishedCourseV2Payload
    __H5_COURSE_PLAYER__?: PublishedCourseApp
    CoursewareComponent?: {
      define(definition: ComponentDefinitionV4): void
    }
    CoursewareSurfaceRuntime?: {
      define(definition: SurfaceRuntimeDefinition): void
    }
  }
}

export {}
