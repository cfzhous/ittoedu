import { randomUUID } from 'node:crypto'
import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron'
import {
  IPC_CHANNELS,
  type ClosePreparationMode,
  type ClosePreparationRequest,
  type ClosePreparationResult,
} from '../shared/ipcTypes'

type ClosePreparationIpc = Pick<IpcMain, 'on' | 'removeListener'>
type ClosePreparationWindow = Pick<
  BrowserWindow,
  'webContents' | 'once' | 'removeListener'
>

interface ClosePreparationOptions {
  timeoutMs?: number
  requestId?: string
}

function isClosePreparationResult(
  value: unknown,
): value is ClosePreparationResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  return (
    typeof result.requestId === 'string' &&
    typeof result.prepared === 'boolean'
  )
}

export function requestRendererClosePreparation(
  ipc: ClosePreparationIpc,
  window: ClosePreparationWindow,
  mode: ClosePreparationMode,
  options: ClosePreparationOptions = {},
): Promise<boolean> {
  const requestId = options.requestId ?? randomUUID()
  const request: ClosePreparationRequest = { requestId, mode }

  return new Promise((resolve) => {
    let settled = false
    const finish = (prepared: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      ipc.removeListener(IPC_CHANNELS.saveAndCloseResult, onResult)
      window.removeListener('closed', onClosed)
      resolve(prepared)
    }
    const onResult = (
      event: IpcMainEvent,
      result: unknown,
    ) => {
      if (event.sender !== window.webContents) return
      if (!isClosePreparationResult(result)) return
      if (result.requestId !== requestId) return
      finish(result.prepared)
    }
    const onClosed = () => finish(false)
    const timeout = setTimeout(
      () => finish(false),
      options.timeoutMs ?? 5 * 60_000,
    )
    ipc.on(IPC_CHANNELS.saveAndCloseResult, onResult)
    window.once('closed', onClosed)
    try {
      window.webContents.send(IPC_CHANNELS.requestSaveAndClose, request)
    } catch (error) {
      console.error('发送关闭准备请求失败', error)
      finish(false)
    }
  })
}
