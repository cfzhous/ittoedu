export type RecoveryRevision = number | string

export interface RecoveryWriteCoordinatorOptions<TSnapshot, TResult> {
  delayMs: number
  build(snapshot: TSnapshot, signal: AbortSignal): Promise<TResult>
  write(result: TResult, snapshot: TSnapshot): Promise<void>
  onSuccess?(snapshot: TSnapshot): void
  onError?(error: unknown, snapshot: TSnapshot): void
}

interface PendingRecovery<TSnapshot> {
  revision: RecoveryRevision
  generation: number
  snapshot: TSnapshot
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Debounces recovery snapshots, permits only one build/write pipeline at a
 * time, and cancels compression whose result has already become obsolete.
 */
export class RecoveryWriteCoordinator<TSnapshot, TResult> {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: PendingRecovery<TSnapshot> | null = null
  private controller: AbortController | null = null
  private running = false
  private disposed = false
  private generation = 0
  private lastAcceptedRevision: RecoveryRevision | undefined

  constructor(
    private readonly options: RecoveryWriteCoordinatorOptions<TSnapshot, TResult>,
  ) {
    if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
      throw new TypeError('自动恢复延迟必须是非负有限数。')
    }
  }

  schedule(revision: RecoveryRevision, snapshot: TSnapshot): void {
    if (this.disposed) return
    if (Object.is(revision, this.lastAcceptedRevision)) return

    this.lastAcceptedRevision = revision
    this.generation += 1
    this.pending = {
      revision,
      generation: this.generation,
      snapshot,
    }
    this.controller?.abort()
    this.arm(this.options.delayMs)
  }

  cancel(): void {
    if (this.disposed) return
    this.generation += 1
    this.pending = null
    this.clearTimer()
    this.controller?.abort()
  }

  dispose(): void {
    if (this.disposed) return
    this.cancel()
    this.disposed = true
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private arm(delayMs: number): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.drain()
    }, delayMs)
  }

  private async drain(): Promise<void> {
    if (this.disposed || this.running) return
    const pending = this.pending
    if (!pending) return
    this.pending = null
    this.running = true
    const controller = new AbortController()
    this.controller = controller

    try {
      const result = await this.options.build(pending.snapshot, controller.signal)
      if (
        controller.signal.aborted ||
        this.disposed ||
        pending.generation !== this.generation
      ) {
        return
      }
      await this.options.write(result, pending.snapshot)
      if (
        !this.disposed &&
        pending.generation === this.generation
      ) {
        this.options.onSuccess?.(pending.snapshot)
      }
    } catch (error) {
      if (
        !controller.signal.aborted &&
        !isAbortError(error) &&
        !this.disposed &&
        pending.generation === this.generation
      ) {
        this.options.onError?.(error, pending.snapshot)
      }
    } finally {
      if (this.controller === controller) this.controller = null
      this.running = false
      // A newer edit may have completed its own idle delay while the previous
      // worker was winding down. Start it immediately, still single-flight.
      if (!this.disposed && this.pending) this.arm(0)
    }
  }
}
