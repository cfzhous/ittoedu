import type { SceneNode } from '../../../shared/projectTypes'
import { BaseNodeAdapter } from './NodeAdapter'

/**
 * Geometry-only adapter used by the unified authoring overlay. The isolated
 * Player is the visual source of truth; this proxy owns only hit testing and
 * transform handles and therefore never loads assets or executes components.
 */
export class ProxyNodeAdapter extends BaseNodeAdapter<SceneNode> {
  protected override redraw(): void {
    this.resizeInteractionTarget()
  }
}
