import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { APP_NAME } from '../shared/constants'
import { IPC_CHANNELS } from '../shared/ipcTypes'
import type { AppState } from './appState'
import {
  configureRestrictedSession,
  hardenWebContents,
  isAllowedDocumentUrl,
  isAllowedEditorPreviewFrameUrl,
} from './security'
import { editorEntryUrl } from './protocols'
import { clearRecoveryProject } from './projectPersistence'
import {
  BACKGROUND_E2E_WINDOW_ORIGIN,
  shouldShowApplicationWindows,
} from './windowVisibility'
import { requestRendererClosePreparation } from './rendererClosePreparation'

export interface MainWindowResult {
  window: BrowserWindow
  rendererEntryUrl: string
}

function getPreloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js')
}

function getIconPath(): string | undefined {
  const iconPath = path.join(app.getAppPath(), 'resources', 'icons', 'icon.png')
  return fs.existsSync(iconPath) ? iconPath : undefined
}

function parseDevelopmentServerUrl(): URL | null {
  if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL) return null

  let url: URL
  try {
    url = new URL(process.env.VITE_DEV_SERVER_URL)
  } catch {
    throw new Error('VITE_DEV_SERVER_URL 不是有效地址。')
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname)) {
    throw new Error('开发服务器只能使用本机 HTTP 地址。')
  }
  return url
}

function confirmClose(window: BrowserWindow): 'save' | 'discard' | 'cancel' {
  const choice = dialog.showMessageBoxSync(window, {
    type: 'warning',
    title: '保存未完成的修改？',
    message: '当前课件有尚未保存的修改。',
    detail: '可以先保存工程、直接关闭并放弃修改，或取消关闭。',
    buttons: ['保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })
  if (choice === 0) return 'save'
  if (choice === 1) return 'discard'
  return 'cancel'
}

export async function createMainWindow(
  appState: AppState,
  onCreated?: (result: MainWindowResult) => void,
): Promise<MainWindowResult> {
  const developmentServerUrl = parseDevelopmentServerUrl()
  const rendererEntryUrl = developmentServerUrl?.toString() ?? editorEntryUrl()

  const allowedNetworkOrigins = new Set<string>()
  if (developmentServerUrl) allowedNetworkOrigins.add(developmentServerUrl.origin)
  configureRestrictedSession(session.defaultSession, allowedNetworkOrigins)
  const showApplicationWindows = shouldShowApplicationWindows()

  const window = new BrowserWindow({
    ...(!showApplicationWindows
      ? {
          x: BACKGROUND_E2E_WINDOW_ORIGIN,
          y: BACKGROUND_E2E_WINDOW_ORIGIN,
          opacity: 0,
        }
      : {}),
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: '#0b1020',
    icon: getIconPath(),
    show: false,
    skipTaskbar: !showApplicationWindows,
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      devTools: !app.isPackaged,
      backgroundThrottling: showApplicationWindows,
    },
  })
  let closeApproved = false
  let closeCheckInFlight = false

  onCreated?.({ window, rendererEntryUrl })
  appState.attachWindow(window)
  hardenWebContents(
    window.webContents,
    (url) => isAllowedDocumentUrl(url, rendererEntryUrl),
    (url) => isAllowedEditorPreviewFrameUrl(url, rendererEntryUrl),
  )

  window.webContents.on('before-input-event', (event, input) => {
    const saveShortcut =
      input.type === 'keyDown' &&
      !input.isAutoRepeat &&
      (input.control || input.meta) &&
      !input.alt &&
      !input.shift &&
      input.key.toLocaleLowerCase('en-US') === 's'

    if (!saveShortcut) return
    event.preventDefault()
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.requestSave)
    }
  })

  window.on('close', (event) => {
    if (closeApproved) return
    event.preventDefault()
    if (closeCheckInFlight) return
    closeCheckInFlight = true
    void Promise.race([
      window.webContents.executeJavaScript(
        'Boolean(window.__COURSEWARE_EDITOR_DIRTY__)',
        true,
      ).then((dirty) => ({ read: true as const, dirty: Boolean(dirty) }))
        .catch(() => ({ read: false as const, dirty: true })),
      new Promise<{ read: false; dirty: true }>((resolve) => {
        setTimeout(() => resolve({ read: false, dirty: true }), 1_500)
      }),
    ]).then(async (rendererDirty) => {
      // A successful renderer read is the current document authority. The IPC
      // mirror can legitimately lag one React commit, so OR-ing it here would
      // turn a just-saved V9 document back into a false dirty state.
      const dirty = rendererDirty.read ? rendererDirty.dirty : true
      const decision = dirty ? confirmClose(window) : 'discard'
      if (decision === 'cancel') return
      if (decision === 'save' && !(
        await requestRendererClosePreparation(ipcMain, window, 'save')
      )) {
        return
      }
      if (dirty && decision === 'discard' && !(
        await requestRendererClosePreparation(ipcMain, window, 'discard')
      )) {
        return
      }
      if (dirty) {
        await clearRecoveryProject().catch((error) => {
          console.error('关闭时清理恢复副本失败', error)
        })
      }
      appState.setDirty(false)
      closeApproved = true
      if (!window.isDestroyed()) window.close()
    }).catch((error) => {
      console.error('关闭前读取编辑状态失败', error)
    }).finally(() => {
      closeCheckInFlight = false
    })
  })

  window.on('closed', () => {
    appState.detachWindow(window)
  })

  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return
    if (showApplicationWindows) window.show()
  })

  if (developmentServerUrl) {
    await window.loadURL(rendererEntryUrl)
  } else {
    await window.loadURL(rendererEntryUrl)
  }

  return { window, rendererEntryUrl }
}
