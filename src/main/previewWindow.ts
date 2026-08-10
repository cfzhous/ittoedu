import crypto from 'node:crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  app,
  BrowserWindow,
  session,
  type BrowserWindow as BrowserWindowType,
} from 'electron'
import { DesktopOperationError } from './errors'
import {
  configureRestrictedSession,
  hardenWebContents,
  isAllowedDocumentUrl,
} from './security'
import {
  installPreviewProtocol,
  registerPreviewDocument,
  releasePreviewDocument,
} from './protocols'
import {
  BACKGROUND_E2E_WINDOW_ORIGIN,
  shouldShowApplicationWindows,
} from './windowVisibility'

const PREVIEW_DIRECTORY_NAME = 'phaser-courseware-editor-preview'
const previewWindows = new Set<BrowserWindowType>()

function previewDirectory(): string {
  return path.join(app.getPath('temp'), PREVIEW_DIRECTORY_NAME)
}

async function removePreviewFile(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch((error: unknown) => {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined
    if (code !== 'ENOENT') console.error('清理预览临时文件失败', error)
  })
}

export async function cleanupPreviewFiles(): Promise<void> {
  const directory = previewDirectory()
  await fs.mkdir(directory, { recursive: true })

  const entries = await fs.readdir(directory, { withFileTypes: true })
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith('preview-') &&
          entry.name.endsWith('.html'),
      )
      .map((entry) => removePreviewFile(path.join(directory, entry.name))),
  )
}

export async function openPreviewWindow(
  html: string,
  parentWindow: BrowserWindowType,
): Promise<void> {
  if (Buffer.byteLength(html, 'utf8') > 256 * 1024 * 1024) {
    throw new DesktopOperationError(
      'PREVIEW_TOO_LARGE',
      '预览创建失败',
      '预览内容超过 256 MB 限制。',
      '请删除未使用的大图片或组件资源后重试。',
    )
  }

  const previewSession = session.fromPartition('courseware-preview')
  configureRestrictedSession(previewSession, new Set())
  installPreviewProtocol(previewSession)
  const documentId = crypto.randomUUID()
  const entryUrl = registerPreviewDocument(documentId, html)
  const showApplicationWindows = shouldShowApplicationWindows()

  const window = new BrowserWindow({
    ...(!showApplicationWindows
      ? {
          x: BACKGROUND_E2E_WINDOW_ORIGIN,
          y: BACKGROUND_E2E_WINDOW_ORIGIN,
          opacity: 0,
        }
      : {}),
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '课件预览',
    parent: parentWindow,
    modal: false,
    backgroundColor: '#080b12',
    autoHideMenuBar: true,
    show: false,
    skipTaskbar: !showApplicationWindows,
    webPreferences: {
      partition: 'courseware-preview',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
      spellcheck: false,
      backgroundThrottling: showApplicationWindows,
    },
  })

  previewWindows.add(window)
  hardenWebContents(window.webContents, (url) =>
    isAllowedDocumentUrl(url, entryUrl),
  )

  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return
    if (showApplicationWindows) window.show()
    else window.showInactive()
  })
  window.on('closed', () => {
    previewWindows.delete(window)
    releasePreviewDocument(documentId)
  })

  try {
    await window.loadURL(entryUrl)
  } catch (error) {
    if (!window.isDestroyed()) window.destroy()
    releasePreviewDocument(documentId)
    throw new DesktopOperationError(
      'PREVIEW_WINDOW_FAILED',
      '预览创建失败',
      '预览窗口未能载入课件内容。',
      '请重新导出内容后再试；如果问题持续出现，请重启编辑器。',
      { cause: error },
    )
  }
}

export function closeAllPreviewWindows(): void {
  for (const window of previewWindows) {
    if (!window.isDestroyed()) window.destroy()
  }
  previewWindows.clear()
}
