import { app, BrowserWindow, dialog, session } from 'electron'
import { AppState } from './appState'
import { createMainWindow } from './createWindow'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc'
import {
  cleanupPreviewFiles,
  closeAllPreviewWindows,
} from './previewWindow'
import {
  clearPreviewDocuments,
  installEditorProtocol,
  registerPrivilegedSchemes,
} from './protocols'
import { diagnosticLog } from './diagnosticLog'

registerPrivilegedSchemes()

const appState = new AppState()
let mainWindow: BrowserWindow | null = null
let rendererEntryUrl: string | null = null
let removeDiagnosticHandlers: (() => void) | null = null

app.on('render-process-gone', (_event, contents, details) => {
  void diagnosticLog.append({
    source: contents === mainWindow?.webContents ? 'renderer' : 'preview',
    message: `渲染进程退出：${details.reason}`,
    details: {
      exitCode: details.exitCode,
      reason: details.reason,
      url: contents.getURL(),
    },
  })
})

app.on('child-process-gone', (_event, details) => {
  void diagnosticLog.append({
    source: 'main',
    message: `Electron 子进程退出：${details.type} / ${details.reason}`,
    details: {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    },
  })
})

const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.quit()
}

async function openMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    return
  }

  await createMainWindow(appState, (result) => {
    mainWindow = result.window
    rendererEntryUrl = result.rendererEntryUrl
    result.window.once('closed', () => {
      mainWindow = null
      rendererEntryUrl = null
    })
  })
}

app.on('second-instance', () => {
  void openMainWindow().catch((error) => {
    console.error('恢复主窗口失败', error)
  })
})

app.on('certificate-error', (event, _contents, _url, _error, _certificate, callback) => {
  event.preventDefault()
  callback(false)
})

app
  .whenReady()
  .then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.alepha.phaser-courseware-editor')
    }

    removeDiagnosticHandlers = diagnosticLog.installProcessHandlers()

    await cleanupPreviewFiles().catch((error) => {
      console.error('启动时清理预览临时文件失败', error)
    })
    installEditorProtocol(session.defaultSession)
    registerIpcHandlers({
      getMainWindow: () => mainWindow,
      getRendererEntryUrl: () => rendererEntryUrl,
      appState,
    })
    await openMainWindow()

    app.on('activate', () => {
      void openMainWindow().catch((error) => {
        console.error('创建主窗口失败', error)
      })
    })
  })
  .catch((error) => {
    console.error('应用启动失败', error)
    dialog.showErrorBox(
      '应用启动失败',
      '编辑器未能启动。请重新解压应用或重新下载后再试。',
    )
    app.quit()
  })

app.on('before-quit', () => {
  closeAllPreviewWindows()
  clearPreviewDocuments()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  removeDiagnosticHandlers?.()
  removeDiagnosticHandlers = null
  unregisterIpcHandlers()
})
