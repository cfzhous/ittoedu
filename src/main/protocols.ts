import path from 'node:path'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { app, net, protocol, type Session } from 'electron'

export const EDITOR_SCHEME = 'courseware-editor'
export const PREVIEW_SCHEME = 'courseware-preview'

const previewDocuments = new Map<string, string>()
const configuredEditorSessions = new WeakSet<Session>()
const configuredPreviewSessions = new WeakSet<Session>()

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EDITOR_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
    {
      scheme: PREVIEW_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
  ])
}

function rendererRoot(): string {
  return path.resolve(app.getAppPath(), 'dist-renderer')
}

function safeRendererPath(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const root = rendererRoot()
  const target = path.resolve(root, relative)
  const difference = path.relative(root, target)
  if (!difference || difference === 'index.html') return target
  if (difference.startsWith('..') || path.isAbsolute(difference)) return null
  return target
}

export function installEditorProtocol(electronSession: Session): void {
  if (configuredEditorSessions.has(electronSession)) return
  configuredEditorSessions.add(electronSession)
  electronSession.protocol.handle(EDITOR_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app') return new Response('Not found', { status: 404 })
    const target = safeRendererPath(url.pathname)
    if (!target) return new Response('Forbidden', { status: 403 })
    try {
      const stats = await fs.stat(target)
      if (!stats.isFile()) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(target).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

export function editorEntryUrl(): string {
  return `${EDITOR_SCHEME}://app/index.html`
}

export function installPreviewProtocol(electronSession: Session): void {
  if (configuredPreviewSessions.has(electronSession)) return
  configuredPreviewSessions.add(electronSession)
  electronSession.protocol.handle(PREVIEW_SCHEME, async (request) => {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/([a-f0-9-]+)\/index\.html$/u)
    const html = url.hostname === 'lesson' && match
      ? previewDocuments.get(match[1])
      : undefined
    if (!html) return new Response('Not found', { status: 404 })
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}

export function registerPreviewDocument(id: string, html: string): string {
  previewDocuments.set(id, html)
  return `${PREVIEW_SCHEME}://lesson/${id}/index.html`
}

export function releasePreviewDocument(id: string): void {
  previewDocuments.delete(id)
}

export function clearPreviewDocuments(): void {
  previewDocuments.clear()
}
