import { ZodError } from 'zod'

export interface DesktopErrorPayload {
  code: string
  title: string
  message: string
  suggestion: string
}

export class DesktopOperationError extends Error {
  constructor(
    public readonly code: string,
    public readonly title: string,
    message: string,
    public readonly suggestion: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'DesktopOperationError'
  }
}

interface ErrorWithCode {
  code?: unknown
}

function systemErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as ErrorWithCode).code
  return typeof code === 'string' ? code : undefined
}

export function normalizeDesktopError(
  error: unknown,
  fallback: DesktopErrorPayload,
): DesktopErrorPayload {
  if (error instanceof DesktopOperationError) {
    console.error(`[${error.code}] ${error.title}`, error)
    const causeCode = systemErrorCode(error.cause)
    if (causeCode === 'ENOSPC') {
      return {
        code: 'DISK_FULL',
        title: error.title,
        message: '磁盘可用空间不足，文件未能写入。',
        suggestion: '请清理磁盘空间或改存到其他磁盘后重试。',
      }
    }
    if (
      causeCode === 'EACCES' ||
      causeCode === 'EPERM' ||
      causeCode === 'EROFS'
    ) {
      return {
        code: 'FILE_PERMISSION_DENIED',
        title: error.title,
        message: '没有权限访问所选文件或目录。',
        suggestion: '请关闭占用该文件的程序，或选择有写入权限的位置后重试。',
      }
    }
    return {
      code: error.code,
      title: error.title,
      message: error.message,
      suggestion: error.suggestion,
    }
  }

  if (error instanceof ZodError) {
    console.error('[INVALID_ARGUMENT] IPC 参数校验失败', error)
    return {
      code: 'INVALID_ARGUMENT',
      title: '操作未完成',
      message: '收到的操作参数无效。',
      suggestion: '请重试；如果问题持续出现，请重新启动编辑器。',
    }
  }

  const code = systemErrorCode(error)
  console.error(`[${code ?? fallback.code}] ${fallback.title}`, error)

  if (code === 'ENOSPC') {
    return {
      code: 'DISK_FULL',
      title: '保存失败',
      message: '磁盘可用空间不足，文件未能写入。',
      suggestion: '请清理磁盘空间或改存到其他磁盘后重试。',
    }
  }

  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return {
      code: 'FILE_PERMISSION_DENIED',
      title: fallback.title,
      message: '没有权限访问所选文件或目录。',
      suggestion: '请关闭占用该文件的程序，或选择有写入权限的位置后重试。',
    }
  }

  return fallback
}
