import {
  SURFACE_RUNTIME_API_VERSION,
  type SurfaceRuntimeDefinition,
} from '../shared/surfaceRuntimeTypes'
import { validateRuntimeSource } from './RuntimeRegistry'

function isDefinition(value: unknown): value is SurfaceRuntimeDefinition {
  return typeof value === 'object' && value !== null &&
    Reflect.get(value, 'runtimeApiVersion') === SURFACE_RUNTIME_API_VERSION &&
    typeof Reflect.get(value, 'create') === 'function'
}

/** Synchronous plain-script registry for the official DOM-only Surface Runtime V1. */
export class SurfaceRuntimeRegistry {
  readonly #globalApi = Object.freeze({
    define: (definition: SurfaceRuntimeDefinition): void => this.#defineDuringLoad(definition),
  })
  #previous: Window['CoursewareSurfaceRuntime']
  #previousWasOwn = false
  #loadingLabel: string | null = null
  #definition: SurfaceRuntimeDefinition | null = null
  #installed = false

  install(): void {
    if (this.#installed) return
    this.#previous = window.CoursewareSurfaceRuntime
    this.#previousWasOwn = Object.hasOwn(window, 'CoursewareSurfaceRuntime')
    window.CoursewareSurfaceRuntime = this.#globalApi
    this.#installed = true
  }

  executeRuntime(source: string, label = 'Surface Runtime'): SurfaceRuntimeDefinition {
    validateRuntimeSource(source)
    if (this.#loadingLabel) throw new Error(`Surface Runtime ${this.#loadingLabel} is still loading`)
    this.install()
    this.#loadingLabel = label
    this.#definition = null
    try {
      const safeLabel = label.replace(/[\r\n]/g, '_')
      const execute = new Function(
        'window',
        'CoursewareSurfaceRuntime',
        `"use strict";\n${source}\n//# sourceURL=h5course-surface-runtime://${safeLabel}/runtime.js`,
      ) as (
        runtimeWindow: Window,
        api: { define(definition: SurfaceRuntimeDefinition): void },
      ) => void
      execute(window, this.#globalApi)
      if (!this.#definition) throw new Error('CoursewareSurfaceRuntime.define was not called synchronously')
      return this.#definition
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`Surface Runtime ${label} failed to register: ${detail}`, { cause })
    } finally {
      this.#loadingLabel = null
      this.#definition = null
    }
  }

  dispose(): void {
    if (this.#installed && window.CoursewareSurfaceRuntime === this.#globalApi) {
      if (this.#previousWasOwn) window.CoursewareSurfaceRuntime = this.#previous
      else delete window.CoursewareSurfaceRuntime
    }
    this.#installed = false
    this.#previous = undefined
    this.#previousWasOwn = false
    this.#loadingLabel = null
    this.#definition = null
  }

  #defineDuringLoad(definition: SurfaceRuntimeDefinition): void {
    if (!this.#loadingLabel) throw new Error('No Surface Runtime is currently loading')
    if (this.#definition) throw new Error(`Surface Runtime ${this.#loadingLabel} called define twice`)
    if (!isDefinition(definition)) {
      throw new Error(`Surface Runtime definitions must use runtimeApiVersion ${SURFACE_RUNTIME_API_VERSION}`)
    }
    this.#definition = definition
  }
}
