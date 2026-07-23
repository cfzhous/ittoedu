import type { ComponentEventDetail } from './renderNode'

type BufferState = 'mounting' | 'replaying' | 'active' | 'disposed'

/**
 * Holds synchronous component events until the matching interaction engine has
 * subscribed and bound its node handles. The instance is scoped to one scene
 * or global-layer mount; disposing it makes retained component emit functions
 * harmless after navigation or teardown.
 */
export class ComponentEventMountBuffer {
  private state: BufferState = 'mounting'
  private readonly pending: ComponentEventDetail[] = []

  constructor(
    private readonly deliver: (detail: ComponentEventDetail) => void,
  ) {}

  readonly emit = (detail: ComponentEventDetail): void => {
    if (this.state === 'disposed') return
    if (this.state === 'mounting' || this.state === 'replaying') {
      this.pending.push(detail)
      return
    }
    this.deliver(detail)
  }

  complete(replayPending: boolean): void {
    if (this.state !== 'mounting') return
    if (!replayPending) {
      this.pending.length = 0
      this.state = 'active'
      return
    }

    this.state = 'replaying'
    try {
      while (this.state === 'replaying' && this.pending.length > 0) {
        const detail = this.pending.shift()
        if (detail) this.deliver(detail)
      }
    } finally {
      if (!this.isDisposed()) {
        this.pending.length = 0
        this.state = 'active'
      }
    }
  }

  dispose(): void {
    this.state = 'disposed'
    this.pending.length = 0
  }

  private isDisposed(): boolean {
    return this.state === 'disposed'
  }
}
