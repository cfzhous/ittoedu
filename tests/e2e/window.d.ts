import type * as Phaser from 'phaser'
import type { PlayerApp } from '../../src/player/PlayerApp'
import type { RenderedNodeHandle } from '../../src/player/renderNode'
import type { ExportPayload } from '../../src/shared/componentTypes'

interface PlayerE2eBridge extends PlayerApp {
  /** Read-only E2E introspection of the exact payload rendered by this page. */
  readonly payload: ExportPayload
  /** Read-only E2E introspection; production interaction never uses this shape. */
  readonly playerScene: {
    readonly renderedNodes: readonly RenderedNodeHandle[]
  }
  /** E2E continuity probe for the existing course-state lifecycle contract. */
  readonly runtimeKernel: {
    readonly courseState: {
      get(key: string): unknown
      set(key: string, value: unknown): void
    }
  }
}

interface SceneAuthoringProbe {
  mode: string
  authoring: boolean
  replayAccepted?: boolean
  stateAfterWrite?: unknown
}

declare global {
  interface Window {
    __H5_LESSON_PLAYER__?: PlayerE2eBridge
    __e2eRunFrameSentinel?: string
    __e2eSceneAuthoringProbe?: SceneAuthoringProbe
    __renderHostActiveRafCount?: () => number
  }
}

export {}
