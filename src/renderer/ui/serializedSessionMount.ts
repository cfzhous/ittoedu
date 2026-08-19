export type SerialAsyncChain = { current: Promise<void> }

export function createSerialAsyncChain(): SerialAsyncChain {
  return { current: Promise.resolve() }
}

export function enqueueSerial(
  chainRef: SerialAsyncChain,
  work: () => Promise<void>,
): void {
  chainRef.current = chainRef.current.then(work).then(() => undefined, () => undefined)
}

/**
 * Run async workspace work on a shared chain. Cleanup only marks the job
 * cancelled; in-flight work must destroy what it created when cancelled.
 */
export function beginSerializedWork(
  chainRef: SerialAsyncChain,
  work: (isCancelled: () => boolean) => Promise<void>,
  onError?: (error: unknown) => void,
): () => void {
  let cancelled = false
  const run = chainRef.current.then(async () => {
    if (cancelled) return
    await work(() => cancelled)
  }).catch((error) => {
    if (!cancelled) onError?.(error)
  })
  chainRef.current = run.then(() => undefined, () => undefined)
  return () => {
    cancelled = true
  }
}

/**
 * Mount a destroyable session so React StrictMode / overlay remounts cannot
 * overlap two players in the same DOM node.
 */
export function beginSerializedSessionMount<T extends { destroy(): void | Promise<void> }>(
  chainRef: SerialAsyncChain,
  factory: () => Promise<T>,
  handlers: {
    onReady: (session: T) => void
    onError?: (error: unknown) => void
    onCleanup?: () => void
  },
): () => void {
  let cancelled = false
  let session: T | null = null
  const run = chainRef.current.then(async () => {
    if (cancelled) return
    session = await factory()
    if (cancelled) {
      await session.destroy()
      session = null
      return
    }
    handlers.onReady(session)
  }).catch((error) => {
    if (!cancelled) handlers.onError?.(error)
  })
  chainRef.current = run.then(() => undefined, () => undefined)
  return () => {
    cancelled = true
    handlers.onCleanup?.()
    chainRef.current = run.then(async () => {
      if (session) {
        await session.destroy()
        session = null
      }
    }).then(() => undefined, () => undefined)
  }
}
