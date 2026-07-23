import type {
  InteractionActionStep,
  NodeMotionAction,
} from '../../shared/interactionTypes'

export interface NodeMotionPreviewRequest {
  action: NodeMotionAction
  delayMs: InteractionActionStep['delayMs']
}

type ElementAnimationPreviewHandler = (request: NodeMotionPreviewRequest) => void

const handlers = new Set<ElementAnimationPreviewHandler>()

/**
 * Keeps the properties panel independent from the Phaser canvas lifecycle.
 * The currently mounted editor bridge subscribes and ignores unknown node ids.
 */
export function requestNodeMotionPreview(
  action: NodeMotionAction,
  delayMs = 0,
): void {
  const request = { action: structuredClone(action), delayMs }
  handlers.forEach((handler) => handler(request))
}

export function onElementAnimationPreviewRequested(
  handler: ElementAnimationPreviewHandler,
): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}
