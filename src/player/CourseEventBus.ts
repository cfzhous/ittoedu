import type {
  CourseEventBus as CourseEventBusContract,
  RuntimeEventDisposer,
  RuntimeEventListener,
} from '../shared/runtimeTypes'

type StoredListener = RuntimeEventListener<unknown>

function reportListenerError(eventName: string, error: unknown): void {
  console.error(`课程事件“${eventName}”的监听器执行失败`, error)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  ) && typeof Reflect.get(value, 'then') === 'function'
}

export class CourseEventBus implements CourseEventBusContract {
  private readonly listeners = new Map<string, Set<StoredListener>>()
  private disposed = false

  on<T = unknown>(
    eventName: string,
    listener: RuntimeEventListener<T>,
  ): RuntimeEventDisposer {
    if (this.disposed) {
      throw new Error('课程事件总线已销毁，不能继续订阅事件')
    }

    const storedListener = listener as StoredListener
    let eventListeners = this.listeners.get(eventName)
    if (!eventListeners) {
      eventListeners = new Set<StoredListener>()
      this.listeners.set(eventName, eventListeners)
    }
    eventListeners.add(storedListener)

    let active = true
    return () => {
      if (!active) return
      active = false
      this.off(eventName, storedListener)
    }
  }

  off<T = unknown>(eventName: string, listener: RuntimeEventListener<T>): void {
    const eventListeners = this.listeners.get(eventName)
    if (!eventListeners) return
    eventListeners.delete(listener as StoredListener)
    if (eventListeners.size === 0) {
      this.listeners.delete(eventName)
    }
  }

  emit<T = unknown>(eventName: string, payload?: T): void {
    if (this.disposed) return
    const eventListeners = this.listeners.get(eventName)
    if (!eventListeners) return

    for (const listener of [...eventListeners]) {
      if (this.disposed || !eventListeners.has(listener)) continue
      try {
        const result = listener(payload)
        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch((error: unknown) => {
            reportListenerError(eventName, error)
          })
        }
      } catch (error) {
        reportListenerError(eventName, error)
      }
    }
  }

  listenerCount(eventName?: string): number {
    if (eventName !== undefined) {
      return this.listeners.get(eventName)?.size ?? 0
    }
    let count = 0
    for (const eventListeners of this.listeners.values()) {
      count += eventListeners.size
    }
    return count
  }

  dispose(): void {
    this.listeners.clear()
    this.disposed = true
  }
}
