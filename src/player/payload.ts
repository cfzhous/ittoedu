import type { ExportPayload } from '../shared/componentTypes'
import type { PublishedLessonPayload } from '../shared/publishedLessonTypes'
import { migrateProjectDocument } from '../shared/projectSchema'
import {
  isPublishedLessonPayload,
  publishedLessonToExportPayload,
} from './publishedLesson'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function assertExportPayload(
  value: unknown,
): asserts value is ExportPayload {
  if (!isRecord(value) || !isRecord(value.project)) {
    throw new Error('课件 Payload 格式无效')
  }
  if (!isRecord(value.assets) || !isRecord(value.components)) {
    throw new Error('课件 Payload 缺少必要数据或版本不受支持')
  }
  try {
    value.project = migrateProjectDocument(value.project)
  } catch (cause) {
    throw new Error('课件 Payload 缺少必要数据或版本不受支持', {
      cause,
    })
  }
}

export function normalizePlayerPayload(
  value: unknown,
): ExportPayload {
  if (isPublishedLessonPayload(value)) {
    const payload = publishedLessonToExportPayload(value)
    assertExportPayload(payload)
    return payload
  }
  assertExportPayload(value)
  return value
}

export function decodeExportPayload(encodedPayload: string): ExportPayload {
  if (!encodedPayload.trim()) {
    throw new Error('课件 Payload 为空')
  }

  try {
    const normalizedPayload = encodedPayload.replace(/\s/g, '')
    if (
      normalizedPayload.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedPayload)
    ) {
      throw new Error('Base64 格式无效')
    }
    const padding = normalizedPayload.endsWith('==')
      ? 2
      : normalizedPayload.endsWith('=')
        ? 1
        : 0
    const bytes = new Uint8Array(
      (normalizedPayload.length / 4) * 3 - padding,
    )
    const chunkSize = 32_768
    let byteOffset = 0
    for (
      let encodedOffset = 0;
      encodedOffset < normalizedPayload.length;
      encodedOffset += chunkSize
    ) {
      const binary = atob(
        normalizedPayload.slice(encodedOffset, encodedOffset + chunkSize),
      )
      for (let index = 0; index < binary.length; index += 1) {
        bytes[byteOffset] = binary.charCodeAt(index)
        byteOffset += 1
      }
    }

    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return normalizePlayerPayload(parsed)
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message.startsWith('课件 Payload') ||
        cause.message.includes('版本不受支持'))
    ) {
      throw cause
    }
    throw new Error('课件 Payload 无法解码，请重新导出课件', { cause })
  }
}

export function parseExportPayloadJson(json: string): ExportPayload {
  if (!json.trim()) {
    throw new Error('course.json 为空')
  }

  try {
    const parsed: unknown = JSON.parse(json)
    return normalizePlayerPayload(parsed)
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message.startsWith('课件 Payload') ||
        cause.message.includes('版本不受支持'))
    ) {
      throw cause
    }
    throw new Error('course.json 无法解析，请重新导出网页包', { cause })
  }
}

export async function loadExportPayloadFromUrl(
  payloadUrl: string,
): Promise<ExportPayload> {
  if (!payloadUrl.trim()) {
    throw new Error('course.json 路径为空')
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('当前浏览器不支持载入 course.json')
  }

  try {
    const response = await globalThis.fetch(payloadUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return parseExportPayloadJson(await response.text())
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message.startsWith('课件 Payload') ||
        cause.message.startsWith('course.json 无法解析'))
    ) {
      throw cause
    }
    throw new Error('无法载入 course.json，请确认网页包已经完整解压', {
      cause,
    })
  }
}

export type PlayerPayload = ExportPayload | PublishedLessonPayload
