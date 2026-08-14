import type {
  ComponentDefinitionV4,
} from '../shared/componentTypes'
import type { PublishedCourseV2Payload } from '../shared/publishedCourseTypes'
import type { PublishedCourseApp } from './PublishedCourseApp'
import type { SurfaceRuntimeDefinition } from '../shared/surfaceRuntimeTypes'

declare global {
  interface Window {
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
