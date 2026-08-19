import { describe, expect, it } from 'vitest'
import {
  beginSerializedSessionMount,
  createSerialAsyncChain,
} from '@/renderer/ui/serializedSessionMount'

describe('beginSerializedSessionMount', () => {
  it('destroys a cancelled session before the next mount attaches', async () => {
    const chain = createSerialAsyncChain()
    const events: string[] = []
    let finishFirst!: (session: { id: string; destroy(): Promise<void> }) => void
    let startedFirst!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      startedFirst = resolve
    })
    const firstFactory = () => {
      startedFirst()
      return new Promise<{ id: string; destroy(): Promise<void> }>((resolve) => {
        finishFirst = resolve
      })
    }
    const cancelFirst = beginSerializedSessionMount(chain, firstFactory, {
      onReady: (session) => events.push(`ready:${session.id}`),
    })
    await firstStarted
    cancelFirst()

    let resolveSecond!: () => void
    const secondReady = new Promise<void>((resolve) => {
      resolveSecond = resolve
    })
    beginSerializedSessionMount(chain, async () => ({
      id: 'second',
      async destroy() {
        events.push('destroy:second')
      },
    }), {
      onReady: (session) => {
        events.push(`ready:${session.id}`)
        resolveSecond()
      },
    })

    finishFirst({
      id: 'first',
      async destroy() {
        events.push('destroy:first')
      },
    })
    await secondReady
    await chain.current
    expect(events).toEqual(['destroy:first', 'ready:second'])
  })
})
