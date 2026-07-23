import type { RuntimeDefinition } from '../shared/runtimeTypes'

declare global {
  interface Window {
    CoursewareRuntime?: {
      define(definition: RuntimeDefinition): void
    }
  }
}

export {}
