import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestRendererClosePreparation } from '@/main/rendererClosePreparation'
import { IPC_CHANNELS } from '@/shared/ipcTypes'

afterEach(() => {
  vi.useRealTimers()
})

describe('requestRendererClosePreparation', () => {
  it('不会用迟到的旧回执完成新的关闭请求', async () => {
    vi.useFakeTimers()
    const ipc = new EventEmitter()
    const webContents = { send: vi.fn() }
    const window = Object.assign(new EventEmitter(), { webContents })
    const request = (
      mode: 'save' | 'discard',
      requestId: string,
      timeoutMs: number,
    ) => requestRendererClosePreparation(
      ipc as unknown as Parameters<typeof requestRendererClosePreparation>[0],
      window as unknown as Parameters<typeof requestRendererClosePreparation>[1],
      mode,
      { requestId, timeoutMs },
    )

    const oldRequest = request('save', 'request-old', 10)
    expect(webContents.send).toHaveBeenLastCalledWith(
      IPC_CHANNELS.requestSaveAndClose,
      { requestId: 'request-old', mode: 'save' },
    )
    await vi.advanceTimersByTimeAsync(10)
    await expect(oldRequest).resolves.toBe(false)

    const currentRequest = request('discard', 'request-current', 100)
    let currentResult: boolean | undefined
    void currentRequest.then((prepared) => {
      currentResult = prepared
    })

    ipc.emit(
      IPC_CHANNELS.saveAndCloseResult,
      { sender: webContents },
      { requestId: 'request-old', prepared: true },
    )
    ipc.emit(
      IPC_CHANNELS.saveAndCloseResult,
      { sender: {} },
      { requestId: 'request-current', prepared: true },
    )
    await Promise.resolve()
    expect(currentResult).toBeUndefined()

    ipc.emit(
      IPC_CHANNELS.saveAndCloseResult,
      { sender: webContents },
      { requestId: 'request-current', prepared: true },
    )
    await expect(currentRequest).resolves.toBe(true)
  })
})
