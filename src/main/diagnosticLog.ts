import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'

const MAX_LOG_BYTES = 2 * 1024 * 1024
const MAX_MESSAGE_LENGTH = 8_000
const MAX_STACK_LENGTH = 24_000

export type DiagnosticSource = 'main' | 'renderer' | 'preview' | 'component'

export interface DiagnosticEntry {
  source: DiagnosticSource
  message: string
  stack?: string
  details?: Record<string, unknown>
  timestamp?: string
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum)}\n…已截断`
}

function errorEntry(source: DiagnosticSource, error: unknown): DiagnosticEntry {
  if (error instanceof Error) {
    return { source, message: error.message || error.name, stack: error.stack }
  }
  return { source, message: String(error) }
}

export class DiagnosticLog {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly directory: string | (() => string)) {}

  private resolveDirectory(): string {
    return typeof this.directory === 'function' ? this.directory() : this.directory
  }

  private logPath(): string {
    return path.join(this.resolveDirectory(), 'editor-diagnostics.jsonl')
  }

  private previousLogPath(): string {
    return path.join(this.resolveDirectory(), 'editor-diagnostics.previous.jsonl')
  }

  append(entry: DiagnosticEntry): Promise<void> {
    const normalized = {
      timestamp: entry.timestamp ?? new Date().toISOString(),
      source: entry.source,
      message: truncate(entry.message, MAX_MESSAGE_LENGTH),
      ...(entry.stack ? { stack: truncate(entry.stack, MAX_STACK_LENGTH) } : {}),
      ...(entry.details ? { details: entry.details } : {}),
    }
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        const directory = this.resolveDirectory()
        await fs.mkdir(directory, { recursive: true })
        const current = this.logPath()
        const size = await fs.stat(current).then((stat) => stat.size).catch(() => 0)
        if (size >= MAX_LOG_BYTES) {
          await fs.rm(this.previousLogPath(), { force: true })
          await fs.rename(current, this.previousLogPath()).catch(() => undefined)
        }
        await fs.appendFile(current, `${JSON.stringify(normalized)}\n`, 'utf8')
      })
    return this.queue
  }

  async report(): Promise<string> {
    await this.queue.catch(() => undefined)
    const read = async (filePath: string): Promise<string> =>
      fs.readFile(filePath, 'utf8').catch(() => '')
    const [previous, current] = await Promise.all([
      read(this.previousLogPath()),
      read(this.logPath()),
    ])
    const header = [
      'Phaser 课件编辑器诊断报告',
      `生成时间：${new Date().toISOString()}`,
      `应用版本：${app?.isReady?.() ? app.getVersion() : (process.env.npm_package_version ?? 'unknown')}`,
      `平台：${process.platform} ${process.arch}`,
      `系统：${os.type()} ${os.release()}`,
      `Electron：${process.versions.electron ?? 'unknown'}`,
      `Chrome：${process.versions.chrome ?? 'unknown'}`,
      `Node：${process.versions.node}`,
      '',
      '以下记录不包含课件素材内容。',
      '',
    ].join('\n')
    return `${header}${previous}${current}`
  }

  installProcessHandlers(): () => void {
    const onUncaught = (error: Error): void => {
      void this.append(errorEntry('main', error))
    }
    const onRejection = (reason: unknown): void => {
      void this.append(errorEntry('main', reason))
    }
    process.on('uncaughtExceptionMonitor', onUncaught)
    process.on('unhandledRejection', onRejection)
    return () => {
      process.off('uncaughtExceptionMonitor', onUncaught)
      process.off('unhandledRejection', onRejection)
    }
  }
}

export const diagnosticLog = new DiagnosticLog(() =>
  path.join(app.getPath('userData'), 'diagnostics'),
)

export async function exportDiagnosticReport(
  window: BrowserWindow,
): Promise<{ path: string } | null> {
  const result = await dialog.showSaveDialog(window, {
    title: '导出诊断报告',
    defaultPath: `PhaserCoursewareEditor-diagnostics-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`,
    filters: [{ name: '文本诊断报告', extensions: ['txt'] }],
  })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, await diagnosticLog.report(), 'utf8')
  return { path: result.filePath }
}
